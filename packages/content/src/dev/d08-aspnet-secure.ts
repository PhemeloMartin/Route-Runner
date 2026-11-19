import { chapter } from '../dsl.js';

export default chapter`
@chapter dev.d08 | ASP.NET Core 3: Security, Testing and Production Readiness | 8
@sources Microsoft Learn - Authentication and authorization in ASP.NET Core, JWT bearer, Identity API endpoints, CORS, rate limiting, health checks, logging, integration tests with WebApplicationFactory; OWASP Top 10 and OWASP API Security Top 10; RFC 7519 (JWT); your Information Security module; POPIA
@story
Kasi Market goes live in three townships. On day one, someone discovers they can change another customer's order by guessing its id. Lindiwe is furious - and worried about POPIA. Phemelo learns the hard lesson every developer learns: a working API is not a finished API. It must know WHO is calling, what they're ALLOWED to do, prove it works with tests, and tell you when it is sick.

=== lesson d08-1 | Authentication and Authorization with JWT | 30
@analogy Authentication is the bouncer checking your ID at the door and stamping your hand (the token). Authorization is the VIP-area guard who looks at the stamp and decides whether you may go upstairs. A JWT is that hand stamp: anyone can READ it, but only the club can make a valid one, because it's signed.
@objectives
- Distinguish authentication from authorization (401 vs 403)
- Explain how a JWT is structured, signed and validated
- Protect endpoints with policies, roles and ownership checks
@body
- **Authentication (authN)** - *who are you?* -> failure = **401 Unauthorized**.
- **Authorization (authZ)** - *what may you do?* -> failure = **403 Forbidden**.

**Token-based flow** used by mobile apps:
1. App sends email + password to POST /login (over HTTPS!).
2. API verifies the password **hash** (never store plain passwords - ASP.NET Core Identity uses salted PBKDF2 hashes).
3. API returns a short-lived **access token** (JWT, e.g. 15 min) and a long-lived **refresh token**.
4. App sends [[Authorization: Bearer eyJ...]] on every request; when it expires, it uses the refresh token to get a new one.

**A JWT** = three Base64Url parts: **header.payload.signature**
~~~
{ "alg": "HS256", "typ": "JWT" }                                   <- header
{ "sub": "42", "name": "Lindiwe", "role": "manager", "exp": 1795000000 }  <- payload (claims)
HMACSHA256(base64(header) + "." + base64(payload), secretKey)      <- signature
~~~
The payload is **encoded, not encrypted** - never put secrets or ID numbers in it. The **signature** proves it wasn't tampered with; the API validates signature, **issuer**, **audience** and **expiry** on every request.
~~~
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o => o.TokenValidationParameters = new()
    {
        ValidIssuer = cfg["Jwt:Issuer"], ValidAudience = cfg["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(cfg["Jwt:Key"]!)),
    });
builder.Services.AddAuthorization(o => o.AddPolicy("Managers", p => p.RequireRole("manager")));

app.MapGet("/reports/sales", ...).RequireAuthorization("Managers");
~~~
**The day-one bug** was **Broken Object Level Authorization (BOLA)** - number one on the OWASP API Security Top 10: the API checked that you were logged in, but not that order 57 was *yours*. Always filter by the caller:
~~~
var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == id && o.CustomerId == userId);
~~~
Don't build login yourself if you can avoid it: **ASP.NET Core Identity** (with its API endpoints) or an identity provider such as **Microsoft Entra ID**, **Auth0** or **Keycloak** (OAuth 2.0 / OpenID Connect) handles passwords, MFA and lockouts properly.
@terms
- Authentication :: Proving who the caller is - failure returns 401
- Authorization :: Deciding what the caller may do - failure returns 403
- JWT :: JSON Web Token: signed header.payload.signature carrying claims
- Claim :: A statement about the user inside a token (sub, role, exp)
- Bearer token :: Token sent in the Authorization header: Bearer <token>
- Refresh token :: Long-lived token used to obtain new short-lived access tokens
- Password hashing :: Storing a slow, salted one-way hash instead of the password
- BOLA :: Broken Object Level Authorization - accessing other users' objects by changing an id
- OpenID Connect :: Standard login protocol on top of OAuth 2.0 used by identity providers
@pro
- "A JWT is signed, not encrypted - nothing sensitive goes in the payload."
- "Every query for user data is scoped to the caller's id - that's how we prevent BOLA."
@interview A logged-in customer can view other customers' orders by changing the id in the URL. What is this and how do you fix it? :: That's Broken Object Level Authorization (an IDOR), the top OWASP API risk. Authentication works, but the endpoint doesn't check ownership. I'd get the caller's id from the validated token claims and include it in every query - order id AND customer id - returning 404 when it doesn't match, add policy-based authorization for staff roles, and write integration tests proving user A cannot read user B's data.
@quiz
? A request has a valid token but the user lacks the "manager" role. Correct status?
- 401 Unauthorized
+ 403 Forbidden
- 404 Not Found
- 400 Bad Request
> Identified (authenticated) but not allowed (authorization).
? What protects a JWT from being edited by the client?
- Base64 encoding
+ The signature, verified with the server's key
- HTTPS alone
- The exp claim
> Change one character of the payload and the signature check fails.
? Which is safe to store in a JWT payload?
+ The user id and role
- The user's password
- A South African ID number
- The database connection string
> The payload is readable by anyone holding the token.
?? Which help prevent BOLA? (choose all)
+ Filtering queries by the caller's id from the token
+ Integration tests that try to read another user's data
- Using sequential ids and hiding them in the app UI
- Returning 500 for every error
> Enforce ownership on the server and test it.

=== lesson d08-2 | Hardening the API: CORS, Validation, Rate Limiting and OWASP | 25
@analogy Securing an API is like securing a shop: CORS is the sign saying which websites may send customers in from the street, validation is checking every banknote at the till, rate limiting stops one person clearing the shelves in a minute, and logging is the CCTV you'll be glad you had.
@objectives
- Configure CORS correctly for a Flutter web front end
- Validate input and return ProblemDetails
- Apply rate limiting, HTTPS/HSTS and secret management
- Map common risks to the OWASP Top 10
@body
**CORS** - browsers block a page from https://app.kasimarket.co.za calling https://api.kasimarket.co.za unless the API says that origin is allowed:
~~~
builder.Services.AddCors(o => o.AddPolicy("app", p => p
    .WithOrigins("https://app.kasimarket.co.za", "http://localhost:5173")
    .AllowAnyHeader().AllowAnyMethod()));
app.UseCors("app");
~~~
Never use AllowAnyOrigin together with credentials. CORS is **not** an authentication mechanism - curl ignores it completely.

**Validation & errors** - reject bad input with **400** and a standard **ProblemDetails** body (RFC 9457) so the Flutter app can show field errors:
~~~
public record CreateOrder([Required, StringLength(80)] string Item, [Range(1, 50)] int Qty);
builder.Services.AddProblemDetails();
app.UseExceptionHandler();      // unhandled exceptions -> 500 ProblemDetails, no stack traces to clients
~~~
**Rate limiting** (built in since .NET 7) - stop brute-force logins and abuse:
~~~
builder.Services.AddRateLimiter(o => o.AddFixedWindowLimiter("login", w => { w.PermitLimit = 5; w.Window = TimeSpan.FromMinutes(1); }));
app.UseRateLimiter();
app.MapPost("/login", ...).RequireRateLimiting("login");      // 6th try in a minute -> 429
~~~
**Transport & secrets**: HTTPS everywhere (UseHttpsRedirection + HSTS in production), secrets from user-secrets / Key Vault / Kubernetes Secrets, never in Git.

**OWASP Top 10 in plain English** (the web risks every developer must know):
| Risk | Example in our app | Defence |
|---|---|---|
| Broken access control | BOLA on /orders/57 | Ownership checks, policies |
| Cryptographic failures | Passwords stored in plain text | Hashing, TLS |
| Injection | SQL built with string concatenation | Parameterised queries / EF Core |
| Security misconfiguration | Detailed errors and OpenAPI in production | Environment-specific config |
| Vulnerable components | Old NuGet package with a CVE | Dependabot, dotnet list package --vulnerable |
| Authentication failures | No lockout, unlimited login tries | Identity, MFA, rate limiting |
| Logging & monitoring failures | Breach discovered months later | Structured logs, alerts |
**POPIA** adds legal teeth: personal information must be secured, and a breach must be reported to the Information Regulator and affected people.
@terms
- CORS :: Browser rule letting an API declare which other origins may call it
- Origin :: Scheme + host + port of a web page, e.g. https://app.kasimarket.co.za
- ProblemDetails :: Standard JSON error format (RFC 9457) for HTTP APIs
- Rate limiting :: Capping requests per client/time window; excess gets 429
- HSTS :: Header telling browsers to only use HTTPS for a site
- OWASP Top 10 :: The ten most critical web application security risks
- Injection :: Untrusted input executed as code/SQL - prevented by parameterisation
- Vulnerable dependency :: A package version with a known security flaw (CVE)
@pro
- "CORS protects browsers' users; it is not authentication - the API still checks every token."
- "Unhandled exceptions become ProblemDetails with no stack traces leaked to clients."
@interview The Flutter web build gets "blocked by CORS policy" but the Android app works. Explain and fix. :: CORS is enforced by browsers only: the web app runs on a different origin from the API, and the API isn't returning Access-Control-Allow-Origin for it, so the browser blocks the response. The Android app isn't a browser, so it's unaffected. I'd add a named CORS policy in ASP.NET Core with the exact web origins (dev and production), allow the needed headers and methods, and call UseCors before authentication - never AllowAnyOrigin with credentials.
@quiz
? Which client enforces CORS?
+ Web browsers
- The ASP.NET Core server
- Android apps
- curl
> CORS is a browser security policy.
? A user tries 200 passwords in a minute. Which control stops it fastest?
- CORS
+ Rate limiting (429 Too Many Requests) plus lockout
- AsNoTracking
- Hot reload
> Limit attempts per window.
? Which practice prevents SQL injection?
+ Parameterised queries (EF Core or Dapper parameters)
- Escaping quotes by hand
- Using GET instead of POST
- Hiding the API URL
> Data is never executed as SQL.
? What should a production API return for an unhandled exception?
- The full stack trace
+ A generic 500 ProblemDetails, with details only in server logs
- 200 OK with an error message
- Nothing - close the connection
> Don't leak internals.

=== lesson d08-3 | Testing, Logging and Health Checks | 30
@analogy Unit tests check each instrument is tuned; integration tests make the whole band play a song in rehearsal; logs are the recording of every concert; health checks are the sound engineer tapping the mic before the doors open - if there's no sound, nobody is let in.
@objectives
- Write xUnit unit tests and API integration tests with WebApplicationFactory
- Add structured logging with ILogger (and Serilog)
- Expose liveness/readiness health checks for Kubernetes
@body
**Unit tests (xUnit)** - fast, no web server, no database:
~~~
public class PriceCalculatorTests
{
    [Fact]
    public void Adds_15_percent_VAT() => Assert.Equal(115.00m, PriceCalculator.WithVat(100m));

    [Theory]
    [InlineData(0)] [InlineData(99.99)]
    public void Never_less_than_price(decimal p) => Assert.True(PriceCalculator.WithVat(p) >= p);
}
~~~
**Integration tests** spin up the real app in memory with **WebApplicationFactory** (package Microsoft.AspNetCore.Mvc.Testing) and call it with an HttpClient - routing, DI, middleware, serialization all exercised:
~~~
public class TodoApiTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task Post_then_get_returns_the_todo()
    {
        var client = factory.CreateClient();
        var created = await client.PostAsJsonAsync("/todos", new { title = "Buy airtime" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
    }
}
~~~
Swap the database for SQLite in-memory or a real PostgreSQL in a container (**Testcontainers**) so tests are realistic. Run [[dotnet test]] locally and in CI on every PR.

**Structured logging** - log *events with properties*, not glued strings:
~~~
logger.LogInformation("Order {OrderId} placed by {CustomerId} for {Total}", order.Id, user.Id, order.Total);
~~~
Log levels: Trace < Debug < Information < Warning < Error < Critical. **Serilog** or **OpenTelemetry** ship logs to Seq, Elastic, Azure Monitor or Grafana Loki, where you can search "all orders by customer 42". Never log passwords, tokens or full ID numbers (POPIA!).

**Health checks** - endpoints that orchestrators call:
~~~
builder.Services.AddHealthChecks().AddDbContextCheck<AppDbContext>();
app.MapHealthChecks("/healthz/live", new() { Predicate = _ => false });   // process is alive
app.MapHealthChecks("/healthz/ready");                                     // DB reachable -> ready for traffic
~~~
Kubernetes **liveness** probes restart a stuck container; **readiness** probes stop sending traffic to a pod whose database is down. You'll wire these in the Kubernetes chapters.
@terms
- xUnit :: Popular .NET testing framework using Fact and Theory attributes
- Fact / Theory :: A single test / a test run with several InlineData cases
- WebApplicationFactory :: Hosts the real ASP.NET Core app in memory for integration tests
- Testcontainers :: Library that starts real dependencies (e.g. PostgreSQL) in Docker for tests
- Structured logging :: Logging events with named properties that can be searched
- Log level :: Severity of a log entry: Trace, Debug, Information, Warning, Error, Critical
- Health check :: Endpoint reporting whether the app (and its dependencies) are healthy
- Liveness vs readiness :: Alive (restart if not) vs ready to receive traffic
@pro
- "Our integration tests boot the real pipeline with WebApplicationFactory, so routing and auth are tested too."
- "Logs are structured: OrderId and CustomerId are properties we can query, not words in a sentence."
@interview What's the difference between a unit test and an integration test for an API, and why do you need both? :: A unit test checks one class in isolation with dependencies faked - it's fast and pinpoints logic bugs, like VAT rounding. An integration test runs the real ASP.NET Core pipeline in memory with WebApplicationFactory, so routing, model binding, DI, middleware, auth and serialization are tested together, ideally against a real database in a container. Unit tests give speed and precision; integration tests catch wiring mistakes that unit tests can't see.
@quiz
? Which package lets you host your API in memory for integration tests?
- xunit.runner.console
+ Microsoft.AspNetCore.Mvc.Testing (WebApplicationFactory)
- Swashbuckle.AspNetCore
- Serilog.Sinks.Console
> WebApplicationFactory<Program>.
? Which log line is best?
- logger.LogInformation("Order " + id + " placed")
+ logger.LogInformation("Order {OrderId} placed by {CustomerId}", id, customerId)
- Console.WriteLine("it worked")
- logger.LogInformation("Password was " + password)
> Structured properties, and never secrets.
? The database is down. Which probe should fail so Kubernetes stops sending traffic to the pod?
- Liveness
+ Readiness
- Startup
- None
> Not ready = removed from Service endpoints; no restart loop.
? An xUnit [Theory] with three [InlineData] lines runs how many test cases?
- 1
+ 3
- 0
- 6
> One case per InlineData.

=== boss
? Which status code means "you are logged in but not allowed"?
- 401
+ 403
- 404
- 429
> 403 Forbidden.
? Changing /orders/57 to /orders/58 shows another customer's order. Which OWASP API risk?
+ Broken Object Level Authorization (BOLA)
- Injection
- CORS misconfiguration
- Insufficient logging
> Check ownership on every object access.
?? Which keep secrets out of trouble? (choose all)
+ dotnet user-secrets in development
+ Azure Key Vault / Kubernetes Secrets / CI secrets in deployed environments
- appsettings.Production.json committed to Git
- Putting the signing key in the JWT payload
> Secrets live outside source control.
? Which middleware turns unhandled exceptions into a safe 500 ProblemDetails?
+ UseExceptionHandler (with AddProblemDetails)
- UseCors
- UseRouting
- UseStaticFiles
> Register it early in the pipeline.
? Why test the API against a real PostgreSQL container instead of only an in-memory fake?
- It is required by xUnit
+ Real SQL behaviour (constraints, translation, case sensitivity) is tested, catching bugs fakes hide
- Containers are faster than memory
- In-memory databases can't store strings
> Testcontainers give realistic integration tests.
`;
