import { chapter } from '../dsl.js';

export default chapter`
@chapter dev.d06 | ASP.NET Core 1: Building Web APIs with .NET 10 | 6
@sources Microsoft Learn - ASP.NET Core fundamentals (Program.cs, middleware, dependency injection, configuration, environments), Minimal APIs overview, Create web APIs with controllers; .NET support policy (LTS/STS); RFC 9110 HTTP Semantics
@story
The Flutter app needs a brain: a server that stores products, takes orders and checks who is logged in. Lindiwe's accountant says their bank and the big retailers use .NET. ASP.NET Core is Microsoft's open-source, cross-platform framework for web APIs - one of the fastest web frameworks in independent benchmarks, and it runs happily on Linux and in Docker. Phemelo opens a terminal: dotnet new webapi.
@lab dev:aspnet-api | ASP.NET Mission 1 - build, run and call your first Web API

=== lesson d06-1 | Your First API: Project Structure, Program.cs and the dotnet CLI | 25
@analogy An ASP.NET Core app is a restaurant. Program.cs is the opening checklist read every morning: hire the staff (register services), arrange the kitchen line (middleware pipeline), print the menu (map endpoints), then open the doors (app.Run).
@objectives
- Create, build and run a Web API with the dotnet CLI
- Read every part of a minimal-API Program.cs
- Explain .NET LTS vs STS releases and the project file
@body
~~~
dotnet --version                 # 10.0.x
dotnet new webapi -n TodoApi     # (add --use-controllers for controller style)
cd TodoApi
dotnet run                       # Now listening on: http://localhost:5080
curl http://localhost:5080/weatherforecast
~~~
**Program.cs** (top-level statements - no Main method needed):
~~~
var builder = WebApplication.CreateBuilder(args);   // config, logging, DI container

builder.Services.AddOpenApi();                      // 1. register SERVICES

var app = builder.Build();

if (app.Environment.IsDevelopment())                // 2. MIDDLEWARE pipeline
    app.MapOpenApi();                               //    /openapi/v1.json describes your API
app.UseHttpsRedirection();

app.MapGet("/weatherforecast", () => ...);          // 3. ENDPOINTS
app.MapGet("/hello/{name}", (string name) => $"Sawubona {name}!");

app.Run();                                          // 4. start Kestrel, the web server
~~~
**Files you'll see:**
- **TodoApi.csproj** - target framework ([[net10.0]]), package references (NuGet).
- **appsettings.json** / **appsettings.Development.json** - configuration (logging, connection strings, feature switches).
- **Properties/launchSettings.json** - local dev URLs/ports and ASPNETCORE_ENVIRONMENT=Development.
- **TodoApi.http** - send requests from VS/VS Code without curl.
- **bin/** and **obj/** - build output (never commit).

**Kestrel** is the cross-platform web server built into ASP.NET Core. In production it usually sits behind a reverse proxy or load balancer (nginx, Azure App Service, a Kubernetes Ingress) that terminates TLS.

**.NET release cadence**: a new major version every November. **Even numbers are LTS** (3 years of support - .NET 8, .NET 10), odd numbers are STS (shorter support). Production teams favour LTS.

Tools: **Visual Studio 2022/2026** (Windows), **VS Code + C# Dev Kit** (any OS), **JetBrains Rider**. Everything also works from the CLI - which is exactly what CI servers use.
@terms
- ASP.NET Core :: Microsoft's open-source, cross-platform framework for web apps and APIs
- Program.cs :: Startup file that registers services, builds the pipeline and maps endpoints
- WebApplicationBuilder :: Sets up configuration, logging and the DI container before Build()
- Kestrel :: The fast cross-platform web server built into ASP.NET Core
- Minimal API :: Endpoints declared with MapGet/MapPost lambdas instead of controllers
- .csproj :: MSBuild project file: target framework and package references
- launchSettings.json :: Local development profiles: URLs, ports, environment
- OpenAPI :: Standard machine-readable description of an HTTP API
@pro
- "Program.cs has three jobs: register services, build the middleware pipeline, map endpoints."
- "We run on .NET 10 LTS in production for the three-year support window."
@interview Walk me through what happens when you run dotnet run on a new Web API. :: The CLI restores NuGet packages, compiles the C# into an IL assembly in bin/Debug/net10.0, and starts it. Program.cs builds a WebApplicationBuilder - loading appsettings and environment variables, configuring logging and the dependency-injection container - registers services, builds the app, configures the middleware pipeline and maps endpoints, then app.Run starts Kestrel listening on the URL from launchSettings.json. Each request then flows through the middleware into the matching endpoint.
@lab dev:aspnet-api
@quiz
? What starts the Kestrel web server in Program.cs?
- builder.Services.AddOpenApi()
- app.MapGet(...)
+ app.Run()
- WebApplication.CreateBuilder(args)
> Nothing listens until app.Run().
? Which .NET versions are Long-Term Support?
+ Even-numbered releases such as .NET 8 and .NET 10
- Odd-numbered releases
- Every release
- Only .NET Framework 4.8
> Even = LTS (3 years), odd = STS.
? Where do you set the local development port?
- Program.cs only
+ Properties/launchSettings.json (or --urls)
- appsettings.Production.json
- The .gitignore
> launchSettings.json holds local profiles and applicationUrl.
?= Which dotnet command creates a new Web API project? (dotnet new ...)
= dotnet new webapi | dotnet new webapi -n TodoApi
> dotnet new webapi -n TodoApi

=== lesson d06-2 | Routing, Model Binding, Results and REST Design | 30
@analogy Routing is the shopping mall directory: /todos/7 means "Todos shop, unit 7". Model binding is the security guard who reads your ticket and hands the right details (id 7, the JSON body) to the shopkeeper, already checked and in the right shape.
@objectives
- Map CRUD endpoints with route parameters and MapGroup
- Explain model binding from route, query, body and services
- Return correct status codes with Results/TypedResults
- Compare minimal APIs with controllers
@body
~~~
var todos = app.MapGroup("/todos");                          // shared prefix

todos.MapGet("/", async (AppDbContext db) => await db.Todos.ToListAsync());

todos.MapGet("/{id:int}", async (int id, AppDbContext db) =>
    await db.Todos.FindAsync(id) is Todo t ? Results.Ok(t) : Results.NotFound());

todos.MapPost("/", async (CreateTodo dto, AppDbContext db) =>
{
    var todo = new Todo { Title = dto.Title };
    db.Todos.Add(todo);
    await db.SaveChangesAsync();
    return Results.Created($"/todos/{todo.Id}", todo);      // 201 + Location header
});

todos.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
    await db.Todos.Where(t => t.Id == id).ExecuteDeleteAsync() == 1 ? Results.NoContent() : Results.NotFound());

record CreateTodo(string Title);                               // a DTO: only what clients may send
~~~
**Model binding** fills handler parameters automatically:
- **Route** values: [[{id:int}]] -> int id (the :int **route constraint** returns 404 for /todos/abc).
- **Query string**: [[GET /products?search=bread&page=2]] -> string? search, int page.
- **Body**: a complex type (CreateTodo) is read from JSON.
- **Services**: AppDbContext, ILogger<T> come from dependency injection.

**REST resource design** (nouns, not verbs):
| Action | Method + route | Success |
|---|---|---|
| List | GET /todos | 200 |
| Get one | GET /todos/7 | 200 / 404 |
| Create | POST /todos | 201 + Location |
| Replace/update | PUT /todos/7 | 204 |
| Delete | DELETE /todos/7 | 204 / 404 |
Avoid [[/getTodos]] or [[/deleteTodo?id=7]]. Version public APIs ([[/api/v1/...]]) so old app versions keep working after you change things - phones don't all update on the same day.

**DTOs** (Data Transfer Objects) separate what the API exposes from your database entities - clients can't over-post fields like IsAdmin, and you can change the database without breaking the app.

**Controllers vs minimal APIs**: controllers ([[dotnet new webapi --use-controllers]]) group actions in classes with attributes like HttpGet and Route - familiar in big enterprise codebases. Minimal APIs are lighter and are Microsoft's default template. Both use the same routing, DI and middleware; know how to read both.
~~~
[ApiController]
[Route("api/[controller]")]
public class TodosController(AppDbContext db) : ControllerBase
{
    [HttpGet("{id:int}")]
    public async Task<ActionResult<Todo>> Get(int id) =>
        await db.Todos.FindAsync(id) is Todo t ? t : NotFound();
}
~~~
@terms
- Routing :: Matching a request's method and path to an endpoint
- Route parameter :: A variable segment such as {id} in /todos/{id}
- Route constraint :: Rule like {id:int} that a segment must satisfy
- Model binding :: Filling handler parameters from route, query, body, headers and DI
- MapGroup :: Groups endpoints under a shared prefix and settings
- DTO :: Data Transfer Object - the shape clients send/receive, separate from DB entities
- Over-posting :: Clients setting fields they shouldn't (e.g. IsAdmin) - prevented by DTOs
- Controller :: Class grouping related actions with attribute routing
- API versioning :: Keeping /v1 working while /v2 changes, so old clients don't break
@pro
- "Resources are nouns, HTTP methods are the verbs, and status codes tell the truth."
- "We bind requests to DTOs so clients can't over-post fields like IsAdmin."
@interview What status code should POST /todos return, and why include a Location header? :: 201 Created, because a new resource was created. The Location header gives the URL of the new item, for example /todos/42, so the client can fetch it directly without guessing ids, and the response body usually contains the created object including its server-generated id.
@lab dev:aspnet-api
@quiz
? Which route is the most RESTful way to delete order 9?
- POST /deleteOrder?id=9
- GET /orders/9/delete
+ DELETE /orders/9
- PUT /orders/delete/9
> Noun resource + HTTP verb.
? With MapGet("/todos/{id:int}"), what happens for GET /todos/abc?
+ No route matches, so 404
- 500 Internal Server Error
- id becomes 0
- The request goes to /todos
> The :int constraint rejects non-numbers.
? Why use a CreateTodo DTO instead of binding the database entity directly?
- DTOs are faster to type
+ Clients can only send allowed fields (no over-posting) and the DB can change independently
- Entities can't be serialized
- It is required by Kestrel
> Separation and safety.
? A successful PUT that returns no body should answer with:
- 200 OK with an empty array
+ 204 No Content
- 201 Created
- 404 Not Found
> 204 = done, nothing to return.

=== lesson d06-3 | Dependency Injection, Middleware and Configuration | 30
@analogy Dependency injection is a hotel concierge: guests (your classes) say "I need a taxi" (an interface) and the concierge supplies one, without the guest knowing which company. Middleware is airport security: every passenger (request) walks through the same checkpoints in order - and the order matters, you can't check boarding passes after people have boarded.
@objectives
- Register and inject services with the right lifetime
- Order the middleware pipeline correctly
- Read configuration from appsettings, environment variables and user-secrets
@body
**Dependency injection (DI)** - classes ask for what they need in their constructor; the container creates it:
~~~
public interface IPriceService { decimal WithVat(decimal price); }
public class PriceService : IPriceService { public decimal WithVat(decimal p) => Math.Round(p * 1.15m, 2); }

builder.Services.AddScoped<IPriceService, PriceService>();     // register

app.MapGet("/price/{p:decimal}", (decimal p, IPriceService prices) => prices.WithVat(p));   // inject
~~~
**Lifetimes:**
| Lifetime | One instance per... | Use for |
|---|---|---|
| **Singleton** | the whole app | caches, config, HttpClient factories |
| **Scoped** | HTTP request | DbContext, unit-of-work services |
| **Transient** | every injection | lightweight, stateless helpers |
Classic bug: injecting a **scoped** DbContext into a **singleton** ("captive dependency") - one DbContext ends up shared by all requests. ASP.NET Core detects this in Development and throws at start-up.

**Middleware pipeline** - each component can act on the request, call next(), then act on the response:
~~~
app.UseExceptionHandler();      // 1. catch errors -> ProblemDetails (first, so it wraps everything)
app.UseHttpsRedirection();      // 2. http -> https
app.UseCors("app");             // 3. browser cross-origin rules (before auth)
app.UseAuthentication();        // 4. WHO are you? (reads the JWT)
app.UseAuthorization();         // 5. are you ALLOWED? (needs authentication first)
app.MapControllers();           // 6. endpoints
~~~
Put UseAuthorization before UseAuthentication and every [Authorize] endpoint fails - order is everything.

**Configuration** merges sources in order; later ones win: appsettings.json -> appsettings.{Environment}.json -> **user-secrets** (Development only) -> **environment variables** -> command-line args. In Docker/Kubernetes you override with env vars: [[ConnectionStrings__Default=...]] (double underscore = nested key). **Bind config to classes** with the options pattern:
~~~
builder.Services.Configure<PaymentOptions>(builder.Configuration.GetSection("Payments"));
// inject IOptions<PaymentOptions> where needed
~~~
**Secrets** (API keys, DB passwords) never go in appsettings.json in Git: use [[dotnet user-secrets set "Payments:ApiKey" "..."]] locally, and Azure Key Vault / Kubernetes Secrets / CI secrets in deployed environments.

**Environments**: ASPNETCORE_ENVIRONMENT = Development, Staging or Production changes behaviour (detailed errors and OpenAPI only in Development).
@terms
- Dependency injection :: The framework creates and supplies a class's dependencies
- Service lifetime :: How long a DI instance lives: singleton, scoped or transient
- Scoped :: One instance per HTTP request (e.g. DbContext)
- Captive dependency :: A longer-lived service holding a shorter-lived one (scoped inside singleton)
- Middleware :: Pipeline component that handles a request and calls the next one
- Options pattern :: Binding configuration sections to strongly-typed classes
- User secrets :: Development-only secret store outside the project folder
- Environment variable override :: Setting config like ConnectionStrings__Default from the environment
- ASPNETCORE_ENVIRONMENT :: Selects Development, Staging or Production behaviour
@pro
- "DbContext is scoped - one per request - and I never inject it into a singleton."
- "Authentication must run before authorization in the pipeline."
@interview Explain singleton, scoped and transient with an example of each. :: Singleton is one instance for the app's lifetime, like an in-memory cache or configuration object. Scoped is one instance per HTTP request - EF Core's DbContext is the classic example, so all repository calls in one request share a unit of work. Transient creates a new instance every time it's injected, good for lightweight stateless helpers. The danger is a singleton capturing a scoped service, which then gets shared across requests and threads.
@quiz
? Which lifetime should EF Core's DbContext have in a web API?
- Singleton
+ Scoped
- Transient only
- Static
> One per request is the standard (AddDbContext registers it as scoped).
? What is wrong with this order: UseAuthorization(); then UseAuthentication();?
+ Authorization runs before the user is identified, so protected endpoints fail
- Nothing - order doesn't matter
- It disables HTTPS
- It breaks routing for anonymous endpoints only
> Who you are must be known before checking what you may do.
? In Kubernetes you set ConnectionStrings__Default as an env var. What does it override?
+ The ConnectionStrings:Default value from appsettings.json
- Nothing - env vars are ignored
- The Docker image name
- The log level
> Double underscore maps to the nested config key.
? Where should a payment API key live during local development?
- appsettings.json committed to Git
+ dotnet user-secrets
- A comment in Program.cs
- The .csproj file
> user-secrets keeps it out of the repo.

=== boss
? A Flutter app POSTs a new order. The API saves it. Best response?
+ 201 Created with a Location header and the created order
- 200 OK with an empty body
- 302 redirect to /orders
- 204 No Content with no id
> 201 + Location tells the client where the new resource lives.
? A singleton service injects AppDbContext. What's the problem?
- Singletons can't use DI
+ Captive dependency: one DbContext shared across all requests (not thread-safe)
- DbContext must be transient
- It only fails on Linux
> Keep DbContext scoped; use IServiceScopeFactory if a singleton truly needs it.
?? Which belong in Program.cs? (choose all)
+ Registering services with builder.Services
+ Configuring middleware like UseAuthentication
+ Mapping endpoints like MapGet
- Storing production passwords
> Secrets come from configuration providers, not code.
? GET /products?search=bread&page=2 - where does model binding get search and page from?
- The route
+ The query string
- The JSON body
- The DI container
> ? starts the query string.
? Which configuration source wins if the same key is set in all of them?
- appsettings.json
- appsettings.Production.json
+ Command-line arguments (then environment variables)
- launchSettings.json in production
> Later providers override earlier ones.
`;
