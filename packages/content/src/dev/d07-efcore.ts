import { chapter } from '../dsl.js';

export default chapter`
@chapter dev.d07 | ASP.NET Core 2: Data with Entity Framework Core | 7
@sources Microsoft Learn - EF Core overview, DbContext lifetime, Migrations, Querying (tracking, loading related data, performance), Relationships; your Big Data and database modules; the Route Runner server itself (sql.js, migrations, append-only ledger)
@story
The API forgets every order when it restarts - it only kept them in memory. Lindiwe nearly lost a day's sales. A real app needs a real database. Entity Framework Core lets Phemelo work with C# classes while EF Core writes the SQL - and migrations version the database schema just like Git versions code. (Fun fact: the game you're playing stores your progress with the same idea - versioned migrations.)
@lab dev:aspnet-ef | ASP.NET Mission 2 - give the Todo API a real SQLite database

=== lesson d07-1 | ORM Basics: Entities, DbContext and Providers | 25
@analogy EF Core is a translator at a meeting between a C# developer and a database administrator who only speaks SQL. You say "give me all unfinished todos"; the translator says SELECT ... WHERE IsComplete = 0, then turns the rows that come back into C# objects you can use.
@objectives
- Explain what an ORM does and its trade-offs
- Define entities, a DbContext and DbSets
- Register a provider (SQLite, SQL Server, PostgreSQL) with DI
@body
An **ORM** (Object-Relational Mapper) maps **classes <-> tables**, **properties <-> columns**, **objects <-> rows**.
~~~
public class Todo                        // entity -> table "Todos"
{
    public int Id { get; set; }          // primary key by convention ("Id" or "TodoId")
    public required string Title { get; set; }
    public bool IsComplete { get; set; }
    public int? CustomerId { get; set; }          // foreign key
    public Customer? Customer { get; set; }       // navigation property
}

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Todo> Todos => Set<Todo>();
    public DbSet<Customer> Customers => Set<Customer>();
}

// Program.cs - pick a provider
builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite("Data Source=app.db"));
// o.UseSqlServer(conn) | o.UseNpgsql(conn) (PostgreSQL) | o.UseInMemoryDatabase("test")
~~~
Packages: **Microsoft.EntityFrameworkCore.Sqlite** (or .SqlServer / Npgsql.EntityFrameworkCore.PostgreSQL) for the provider, **Microsoft.EntityFrameworkCore.Design** for the tooling.

**Conventions over configuration**: EF Core guesses table names, keys and relationships from your classes. Override with **data annotations** (MaxLength(120), Required) or the **Fluent API** in [[OnModelCreating]] ([[b.Entity<Todo>().Property(t => t.Title).HasMaxLength(120)]]).

**Choosing a database**: SQLite (a file, great for dev, tests and small apps - the Route Runner game uses it!), SQL Server / Azure SQL (Microsoft shops, banks), PostgreSQL (open source favourite, great on Linux and Kubernetes).

**ORM trade-offs**: huge productivity, type safety and protection from SQL injection (queries are parameterised) - but you must understand the SQL it generates, or you'll write slow queries without noticing. Micro-ORMs like **Dapper** run hand-written SQL fast when you need full control.
@terms
- ORM :: Object-Relational Mapper - maps classes and objects to tables and rows
- Entity :: A class mapped to a database table
- DbContext :: EF Core session with the database: queries, change tracking, saving
- DbSet<T> :: A queryable collection representing one table
- Provider :: The package that lets EF Core talk to a specific database (SQLite, SQL Server, PostgreSQL)
- Navigation property :: A property pointing to related entities (todo.Customer)
- Fluent API :: Configuring the model in code inside OnModelCreating
- Dapper :: Lightweight micro-ORM for running hand-written SQL quickly
@pro
- "EF Core parameterises every query, so ORM code is safe from SQL injection by default."
- "I always look at the SQL EF Core generates for hot paths."
@interview When would you choose Dapper over EF Core? :: EF Core is my default for CRUD and business logic because of change tracking, migrations and LINQ. For a performance-critical read path - a big reporting query or a hot endpoint where I want precise control over the SQL - I'd use Dapper, possibly alongside EF Core in the same app. Both use parameterised queries, so neither has to be vulnerable to injection.
@lab dev:aspnet-ef
@quiz
? What does a DbSet<Todo> represent?
+ The Todos table, which you can query and add to
- A single row
- A database connection string
- A migration file
> One DbSet per table.
? Which package do the dotnet ef tools require in the startup project?
- Microsoft.EntityFrameworkCore.InMemory
+ Microsoft.EntityFrameworkCore.Design
- Swashbuckle.AspNetCore
- xunit
> Without Design the tools refuse to run.
? Which database runs as a single file and is ideal for development and small apps?
+ SQLite
- SQL Server
- PostgreSQL
- Redis
> SQLite is an embedded, file-based database.
? Why are EF Core LINQ queries safe from classic SQL injection?
- LINQ encrypts the database
+ Values are sent as parameters, not concatenated into SQL text
- EF Core blocks all user input
- SQLite has no SQL
> Parameterised queries.

=== lesson d07-2 | Migrations: Version Control for Your Database | 25
@analogy Migrations are the renovation plans for a house. You never knock down the whole house to add a room - you write a plan ("add a garage on the east side"), give it a number and date, and builders apply the plans in order. Anyone can rebuild the same house by following the plans from number one.
@objectives
- Create and apply migrations with dotnet ef
- Read a migration's Up and Down methods
- Apply migrations safely in CI/CD and production
@body
~~~
dotnet tool install --global dotnet-ef           # once per machine
dotnet add package Microsoft.EntityFrameworkCore.Design
dotnet ef migrations add InitialCreate           # compares model vs snapshot -> new migration
dotnet ef database update                        # applies pending migrations
dotnet ef migrations list                        # what exists / what's pending
dotnet ef migrations remove                      # undo the LAST, unapplied migration
~~~
A migration file has **Up** (apply) and **Down** (revert):
~~~
public partial class AddDueDate : Migration
{
    protected override void Up(MigrationBuilder mb) =>
        mb.AddColumn<DateTime>(name: "DueDate", table: "Todos", nullable: true);

    protected override void Down(MigrationBuilder mb) =>
        mb.DropColumn(name: "DueDate", table: "Todos");
}
~~~
EF Core keeps a **model snapshot** to know what changed, and the database has a **__EFMigrationsHistory** table recording which migrations ran - so update only applies new ones.

**Workflow**: change entity -> [[migrations add AddDueDate]] -> **review the generated code** (renames can look like drop + add = data loss!) -> commit the migration with the code -> apply.

**Production rules:**
- Never run [[database update]] by hand from your laptop against production.
- Generate an **idempotent SQL script** ([[dotnet ef migrations script --idempotent]]) and run it in the pipeline, or use a **migration bundle** ([[dotnet ef migrations bundle]]) as a deploy step - not "migrate on app start-up" when you run several replicas (they'd race each other).
- Make changes **backwards-compatible** (expand/contract): add a nullable column, deploy code that writes both, backfill, then remove the old column in a later release. That's how you deploy with zero downtime.
- Take a backup first. Always.
@terms
- Migration :: A versioned, code-generated change to the database schema
- Up / Down :: Methods that apply / revert a migration
- Model snapshot :: EF Core's record of the current model used to detect changes
- __EFMigrationsHistory :: Table recording which migrations have been applied
- dotnet ef :: The EF Core command-line tool (installed as a .NET tool)
- Idempotent script :: SQL that can run safely more than once, applying only missing migrations
- Migration bundle :: A self-contained executable that applies migrations during deployment
- Expand/contract :: Making schema changes in backward-compatible steps for zero downtime
@pro
- "Migrations are code: generated, reviewed in the PR, and applied by the pipeline."
- "We use expand/contract so schema changes never need downtime."
@interview A migration renamed a column but EF generated DropColumn + AddColumn. Why is that dangerous and what do you do? :: Dropping the column deletes its data in production. EF couldn't tell a rename from a delete-and-add. I'd edit the migration to use RenameColumn (or configure the rename) before committing, test it on a copy of production data, and apply it through the pipeline with a backup taken first. Reviewing generated migrations in every PR is the habit that catches this.
@lab dev:aspnet-ef
@quiz
? Which command applies pending migrations to the database?
- dotnet ef migrations add
+ dotnet ef database update
- dotnet build
- dotnet ef dbcontext info
> add creates the migration; database update applies it.
? Where does EF Core record which migrations have already run?
+ The __EFMigrationsHistory table in the database
- appsettings.json
- The .csproj file
- Git tags
> So update only applies what's missing.
? Why is "migrate automatically on start-up" risky with 5 replicas?
- It is slower than SQL
+ Several instances may try to migrate at the same time
- EF Core can't run on start-up
- Migrations need a GUI
> Run migrations once, as a deployment step.
? You add a required column to a busy production table. Safest approach?
+ Expand/contract: add it nullable, backfill, then make it required in a later release
- Add it as required and redeploy at peak time
- Drop and recreate the table
- Edit the database by hand
> Backward-compatible steps avoid downtime and failures.

=== lesson d07-3 | Querying Well: LINQ, Tracking, Related Data and Performance | 30
@analogy Fetching related data badly is like a delivery driver who drives to the warehouse once for the list of 100 orders, then drives back 100 more times to fetch each customer's address. Eager loading is taking the list AND the addresses in one trip.
@objectives
- Write LINQ queries that translate to efficient SQL
- Explain change tracking and AsNoTracking
- Avoid the N+1 problem with Include/projection and paginate results
@body
~~~
// filter, sort, page, project - EF Core turns this into ONE SQL query
var page = await db.Todos
    .Where(t => !t.IsComplete && t.Title.Contains(search))
    .OrderBy(t => t.Id)
    .Skip((pageNo - 1) * 20).Take(20)
    .Select(t => new TodoDto(t.Id, t.Title))      // projection: only the columns you need
    .AsNoTracking()                                // read-only: skip change tracking
    .ToListAsync();
~~~
- LINQ builds an **expression tree**; nothing hits the database until you **materialise** it ([[ToListAsync]], [[FirstOrDefaultAsync]], [[CountAsync]]). Calling ToList() too early pulls the whole table into memory - then filtering in C# is slow.
- **Change tracking**: entities loaded normally are tracked; edit properties and [[SaveChangesAsync()]] writes only the changed columns in a **transaction**. For read-only queries use **AsNoTracking()** - faster and less memory.
- **The N+1 problem**: loading 100 orders and then touching order.Customer inside a loop can fire 101 queries. Fix with **Include**:
~~~
var orders = await db.Orders.Include(o => o.Customer).Include(o => o.Lines).ToListAsync();
~~~
  or better, **project** straight into a DTO with Select so EF Core writes one JOIN.
- **Pagination** with Skip/Take (or keyset pagination for big tables) - never return 50 000 rows to a phone.
- **Indexes** make WHERE and ORDER BY fast - add them in OnModelCreating ([[HasIndex(t => t.CustomerId)]]) and they become part of a migration.
- See the SQL: enable logging (Microsoft.EntityFrameworkCore.Database.Command at Information) or call [[ToQueryString()]].
- **Concurrency**: two staff edit the same stock count -> add a concurrency token (RowVersion); the second save gets a DbUpdateConcurrencyException instead of silently overwriting.
@terms
- LINQ :: C# query syntax that EF Core translates into SQL
- Materialisation :: Executing the query (ToListAsync, FirstAsync) and creating objects
- Change tracking :: EF Core remembers loaded entities and saves only what changed
- AsNoTracking :: Read-only query without change tracking - faster
- N+1 problem :: One query for a list plus one extra query per item
- Include :: Eager-loads related entities in the same query
- Projection :: Selecting only needed fields into a DTO with Select
- Index :: Database structure that speeds up lookups and sorting on a column
- Concurrency token :: Column (e.g. RowVersion) used to detect conflicting updates
@pro
- "Read-only endpoints use AsNoTracking and project into DTOs."
- "I check for N+1 queries in the logs before any endpoint goes live."
@interview An endpoint listing 200 orders takes 4 seconds. How do you investigate? :: Turn on EF Core command logging or use ToQueryString to see the SQL. A classic cause is N+1 - one query for orders plus one per order for customer or lines - which I fix with Include or, better, a Select projection into a DTO. I'd also add AsNoTracking for read-only data, paginate instead of returning everything, check the execution plan and add missing indexes, then measure again.
@quiz
? Which query reads data most efficiently for a read-only list screen?
- db.Orders.ToList() then filter in C#
+ db.Orders.Where(...).Select(o => new OrderDto(...)).AsNoTracking().ToListAsync()
- A loop calling db.Orders.Find(id) for each id
- db.Orders.Include(everything).ToList()
> Filter and project in SQL, no tracking.
? 100 orders are loaded, then order.Customer is read inside a loop, causing 101 queries. Name of the problem?
+ N+1 queries
- Deadlock
- Over-posting
- Cold start
> Fix with Include or projection.
? When does an EF Core LINQ query actually hit the database?
- When you write .Where(...)
+ When it is materialised, e.g. ToListAsync() or CountAsync()
- When the DbContext is created
- Every second
> Queries are deferred until materialisation.
? What does SaveChangesAsync() do?
+ Writes all tracked changes to the database in a transaction
- Creates a migration
- Clears the database
- Only validates entities
> Inserts, updates and deletes in one transaction.

=== boss
? dotnet ef migrations add fails: "doesn't reference Microsoft.EntityFrameworkCore.Design". Fix?
+ dotnet add package Microsoft.EntityFrameworkCore.Design
- Reinstall Windows
- Delete the DbContext
- Run dotnet test
> The tools need the Design package.
?? Which practices make production migrations safe? (choose all)
+ Review the generated migration in the PR
+ Apply via the pipeline with an idempotent script or bundle
+ Take a backup first
- Run database update from a developer laptop against production
> Migrations are deployments.
? An API returns the whole Orders table (80 000 rows) to the Flutter app. Best fix?
- Increase phone RAM
+ Paginate with Skip/Take (or keyset) and return only needed fields
- Add more Include calls
- Cache the whole table on the phone
> Small pages of projected data.
? Two clerks update the same stock row; one update is silently lost. What helps?
+ A concurrency token such as RowVersion
- AsNoTracking
- Turning off migrations
- A singleton DbContext
> EF Core detects the conflict and throws DbUpdateConcurrencyException.
? What is the default lifetime of a DbContext registered with AddDbContext?
- Singleton
+ Scoped (one per request)
- Transient
- Static
> One unit of work per request.
`;
