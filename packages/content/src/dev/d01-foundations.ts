import { chapter } from '../dsl.js';


export default chapter`
@chapter dev.d01 | Code Foundations: How Apps Are Really Built | 1
@sources Microsoft Learn - .NET fundamentals and C# guide; dart.dev language tour; Flutter docs - architectural overview; your OS module (processes, memory) and Big Data module (data formats)
@story
Lindiwe runs a small spaza-shop network in Galeshewe. She wants an app where customers order bread and airtime, and a back office that tracks stock. "Phemelo, I hear you're learning to build apps. Where do we even start?" Before any framework, you need to know what code actually IS, how it becomes a running program, and the two languages this stream uses: C# (for the ASP.NET Core back end) and Dart (for the Flutter app). Good news: they look like cousins.

=== lesson d01-1 | From Source Code to Running App | 20
@analogy Source code is a recipe written in English. The compiler is a chef who rewrites it into exact kitchen steps the staff (the CPU) can follow without thinking. The runtime is the kitchen manager that hands out ingredients (memory), cleans up afterwards (garbage collection) and stops anyone using a knife wrongly (safety checks).
@objectives
- Explain compiled vs interpreted vs JIT/AOT code
- Describe what the .NET runtime and the Dart VM do
- Explain packages, package managers and why versions matter
@body
A computer only runs **machine code** (the CPU instructions you met in the PC Workshop). Everything else is a way to *produce* machine code.

| Approach | How it works | Example |
|---|---|---|
| **Compiled ahead-of-time (AOT)** | Turned into machine code before you ship | C, Go, Dart in a release app |
| **Interpreted** | A program reads your code line by line while running | Bash scripts, classic Python |
| **Just-in-time (JIT)** | Compiled to an in-between form, then to machine code *while running* | C# on .NET, Dart in debug mode |

**C# and .NET.** You write C#. The compiler turns it into **IL** (Intermediate Language) inside a [[.dll]]. When you run it, the **.NET runtime (CLR)** JIT-compiles IL into machine code for that exact CPU, and its **garbage collector** frees memory you no longer use. One [[.dll]] runs on Windows, Linux and macOS. **.NET 10** (November 2025) is an **LTS** release - supported for 3 years - which is why companies standardise on it.

**Dart and Flutter.** During development Dart runs on a VM with **JIT**, which is what makes Flutter's **hot reload** possible (swap code into the running app in under a second). For a release build Dart is compiled **AOT** to native ARM/x64 code, so the app starts fast on a cheap phone - important in Mzansi where many users have entry-level Androids.

**Packages.** Nobody writes everything from scratch. C# libraries come from **NuGet** ([[dotnet add package ...]]); Dart/Flutter libraries come from **pub.dev** ([[flutter pub add http]]). A **version** like 2.9.3 follows **semantic versioning**: MAJOR.MINOR.PATCH - a MAJOR bump may break your code, MINOR adds features, PATCH fixes bugs. Lock files (packages.lock.json, pubspec.lock) record the exact versions so every developer and the CI server build the *same* thing.

**The SDK vs the runtime.** The **SDK** is the toolbox for *building* (compiler, CLI, templates). The **runtime** is what is needed to *run* the result. Your laptop needs the SDK; the production server only needs the runtime - that is why the Docker image for an API is built in an SDK image and shipped in a much smaller runtime image.
@terms
- Machine code :: The only instructions a CPU can execute directly
- Compiler :: Program that translates source code into another form (IL or machine code) before it runs
- JIT (just-in-time) :: Compiling to machine code while the program runs
- AOT (ahead-of-time) :: Compiling to machine code before shipping - fast start-up
- IL (Intermediate Language) :: The CPU-independent code inside a .NET .dll
- CLR :: The .NET runtime: JIT, garbage collector, type safety
- Garbage collector :: Runtime service that automatically frees memory no longer in use
- Semantic versioning :: MAJOR.MINOR.PATCH - major may break, minor adds, patch fixes
- SDK :: Software Development Kit - tools to build apps (compiler, CLI, templates)
- LTS :: Long-Term Support release - security fixes for years, preferred in production
@pro
- "In .NET, C# compiles to IL and the CLR JIT-compiles it at run time; Flutter uses JIT in debug for hot reload and AOT in release for fast start-up."
- "We pin dependency versions with a lock file so CI builds exactly what we tested."
@interview What is the difference between the .NET SDK and the .NET runtime, and why does it matter for Docker images? :: The SDK contains the compiler, CLI and templates needed to build; the runtime only contains what is needed to execute the compiled .dll. In a multi-stage Dockerfile I build in the large sdk image and copy the published output into the small aspnet runtime image, so production images are smaller, faster to pull and have fewer tools an attacker could abuse.
@quiz
? Why does Flutter use JIT compilation while you are developing?
- It makes the release app smaller
+ It allows hot reload - new code is swapped into the running app instantly
- Phones can only run JIT code
- JIT code is more secure
> JIT in debug gives hot reload; release builds are AOT-compiled for speed.
? What is inside a compiled .NET .dll?
- Machine code for one specific CPU only
+ IL (Intermediate Language) that the CLR JIT-compiles when it runs
- The original C# source code
- A Docker image
> IL is CPU-independent; the runtime turns it into machine code on the target machine.
? A package goes from version 3.4.1 to 4.0.0. What should you expect?
- Only bug fixes
- Only new features, nothing breaks
+ Possibly breaking changes - read the release notes before upgrading
- Nothing - versions are cosmetic
> Under semantic versioning a MAJOR bump signals breaking changes.
?? Which statements about SDKs and runtimes are true? (choose all)
+ Your dev laptop needs the SDK to build
+ A production server only needs the runtime to run a published app
- The runtime includes the compiler and project templates
+ Docker multi-stage builds use the SDK image to build and the runtime image to run
> Build with the SDK, run with the runtime - smaller and safer images.

=== lesson d01-2 | C# and Dart Side by Side: Types, Classes and Null Safety | 30
@analogy Types are labelled containers in a warehouse. A crate labelled "eggs" must only hold eggs - the forklift (compiler) refuses to load bricks into it, so you discover the mistake in the warehouse, not when a customer opens the box. Null safety is a label that says "this crate is never empty" - if it might be empty, the label must say so.
@objectives
- Read variables, functions and classes in both C# and Dart
- Explain static typing, type inference and null safety
- Recognise records/data classes and collections
@body
Both languages are **statically typed** (types are checked before the program runs), **object-oriented**, and **null-safe**. Learn one and the other feels familiar.

~~~
// ----- C# -----                          // ----- Dart -----
int stock = 12;                            int stock = 12;
var name = "Brown bread";   // inferred    var name = 'Brown bread';   // inferred
decimal price = 17.99m;     // money!      double price = 17.99;
string? note = null;        // may be null String? note;               // may be null
const decimal Vat = 0.15m;                 const vat = 0.15;

decimal WithVat(decimal p) => p * (1 + Vat);     double withVat(double p) => p * (1 + vat);

public class Product                       class Product {
{                                            final String name;
    public required string Name { get; init; }   final double price;
    public decimal Price { get; set; }       Product({required this.name, required this.price});
}                                          }

public record Order(int Id, decimal Total);      // Dart 3: records and classes with const constructors

var items = new List<string> { "bread", "milk" };    var items = <String>['bread', 'milk'];
var stockBy = new Dictionary<string, int>();         var stockBy = <String, int>{};
~~~

Key ideas:
- **Type inference** ([[var]]) - the compiler works out the type; it is still static.
- **Null safety** - a plain [[string]]/[[String]] can never be null; you must write [[string?]]/[[String?]] to allow it. The compiler then forces you to check before use ([[note?.Length]], [[note ?? "none"]]). This kills the classic NullReferenceException crash.
- **Money**: C# has [[decimal]] (exact base-10) - use it for rands and cents. Floating point ([[double]]) can't store 0.1 exactly. In Dart, store money as integer **cents** to avoid rounding errors.
- **Classes** bundle data + behaviour; **properties** ({ get; set; }) in C#, **fields** with [[final]] in Dart (final = set once).
- **Records** ([[record Order(...)]] in C#) are compact immutable data types with value equality - perfect for DTOs sent over an API.
- **Collections**: List/List, Dictionary/Map, plus LINQ in C# ([[items.Where(x => x.Price > 10)]]) and similar methods in Dart ([[items.where((x) => x.price > 10)]]).
- **Naming conventions**: C# uses PascalCase for classes, methods and properties; Dart uses lowerCamelCase for members and lower_snake_case for files and package names. Following them is part of writing professional code.
@terms
- Static typing :: Types are checked at compile time, catching mistakes before the app runs
- Type inference :: The compiler deduces the type (var) - still statically typed
- Null safety :: Types are non-nullable by default; nullable ones must be marked with ?
- Null-coalescing operator (??) :: Use the right-hand value when the left is null
- decimal :: C# base-10 number type - exact, used for money
- Record :: Compact immutable data type with value equality (C# record, Dart record)
- Property :: C# member with get/set accessors that controls access to data
- final (Dart) :: A variable that can be assigned only once
- LINQ :: Language Integrated Query - C# methods like Where, Select, OrderBy over collections
@pro
- "Both C# and Dart are sound null-safe, so a missing value is a compile error, not a 2 a.m. crash."
- "I never use double for money - decimal in C#, integer cents in Dart."
@interview Why should money never be stored in a double? :: Floating-point numbers are stored in binary and cannot represent many decimal fractions exactly - 0.1 + 0.2 is not exactly 0.3 - so totals drift by fractions of a cent and reports don't balance. I use decimal in C#, integer cents in Dart and a NUMERIC/DECIMAL column in the database, and only format to rands for display.
@quiz
? In C#, what does string? mean?
+ A string that is allowed to be null
- A string that must be checked at run time only
- An optional parameter
- A string of unknown length
> The ? marks a nullable reference type; plain string means never null.
? Which type should hold a price of R17.99 in a C# API?
- double
- float
+ decimal
- int
> decimal is exact base-10 arithmetic - correct for currency.
? What does var mean in C# and Dart?
- The variable has no type
+ The compiler infers the type from the value; it is still static
- The type can change later
- The variable is global
> Type inference, not dynamic typing.
? What does the ?? operator return in note ?? "none"?
+ note if it is not null, otherwise "none"
- Always "none"
- true or false
- An exception if note is null
> Null-coalescing: a safe default.

=== lesson d01-3 | Async, JSON and HTTP - How an App Talks to a Server | 30
@analogy Ordering at a busy fast-food counter: you place your order, get a slip with a number (a Future/Task), and step aside so the next customer can order - you don't block the counter. When your number is called you collect the food (await). JSON is the standard order slip format everyone in the kitchen understands.
@objectives
- Explain async/await, Task and Future
- Read and write JSON and map it to classes
- Describe an HTTP request and response end to end
@body
**Why async?** A phone app has one **UI thread** that draws the screen 60+ times a second. If it waits 2 seconds for the network, the app freezes ("jank"). A web server has a limited pool of threads; if each one sits waiting for the database, the server runs out. **Asynchronous** code starts slow work (network, disk, database) and frees the thread until the result is ready.

~~~
// C# (ASP.NET Core)                                 // Dart (Flutter)
public async Task<List<Todo>> GetTodos()            Future<List<Todo>> fetchTodos() async {
{                                                     final res = await http.get(Uri.parse(url));
    return await db.Todos.ToListAsync();               final data = jsonDecode(res.body) as List;
}                                                     return data.map((j) => Todo.fromJson(j)).toList();
                                                    }
~~~
- C# **Task<T>** = Dart **Future<T>**: "a value that will arrive later".
- **await** pauses *this function* (not the whole thread) until the value arrives.
- Forgetting await is a classic bug: you get a Task/Future object instead of the data.

**JSON** (JavaScript Object Notation) is the language APIs speak:
~~~
{ "id": 7, "title": "Buy airtime", "isComplete": false, "tags": ["urgent"] }
~~~
Objects in braces, arrays in square brackets, strings in double quotes, numbers, true/false and null. ASP.NET Core **serializes** your C# objects to JSON automatically (property names become camelCase); in Dart you **deserialize** with [[jsonDecode]] and a [[fromJson]] factory (or generate one with json_serializable).

**HTTP** - one request, one response:
~~~
POST /todos HTTP/1.1                 HTTP/1.1 201 Created
Host: api.kasimarket.co.za           Content-Type: application/json
Content-Type: application/json       Location: /todos/7
Authorization: Bearer eyJhbGciOi...
                                     { "id": 7, "title": "Buy airtime", ... }
{ "title": "Buy airtime" }
~~~
Methods: **GET** (read), **POST** (create), **PUT** (replace/update), **PATCH** (partial update), **DELETE**. Status codes: **2xx** success (200 OK, 201 Created, 204 No Content), **3xx** redirect, **4xx** client mistake (400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found), **5xx** server bug (500). Headers carry metadata such as Content-Type and Authorization.

You met TCP ports and DNS in the Network stream: an HTTP request is just TCP to port 80/443 after a DNS lookup - the app and network worlds are one world.
@terms
- Asynchronous code :: Starting slow work and freeing the thread until the result is ready
- Task / Future :: An object representing a value that will be available later
- await :: Pause this function until the Task/Future completes, without blocking the thread
- UI thread :: The single thread that draws a mobile app's screen - never block it
- JSON :: Text data format of objects, arrays, strings, numbers, true/false and null
- Serialization :: Converting objects to JSON (or another format) and back
- HTTP method :: The action of a request - GET, POST, PUT, PATCH, DELETE
- Status code :: 3-digit result of a request - 2xx success, 4xx client error, 5xx server error
- Header :: Name/value metadata on a request or response (Content-Type, Authorization)
@pro
- "Network and database calls are async so we never block the UI thread or exhaust the server's thread pool."
- "A 4xx means the client sent something wrong; a 5xx means our server has a bug - that distinction drives our alerts."
@interview What happens, step by step, when a Flutter app loads a list of orders from an API? :: The app calls an async function that sends an HTTP GET; DNS resolves the API's name, TCP and TLS connect to port 443, the request travels with an Authorization header. ASP.NET Core routes it to an endpoint, which awaits a database query through EF Core and serializes the result to JSON with a 200 status. Back in Flutter, await resumes, jsonDecode turns the body into maps, fromJson builds Dart objects, and setState or the state manager rebuilds the list - while the UI thread stayed responsive the whole time.
@quiz
? What is the Dart equivalent of C#'s Task<T>?
+ Future<T>
- Stream<T>
- List<T>
- Isolate<T>
> Both represent a value that will arrive later.
? Your API created a new order successfully. Which status code fits best?
- 200 OK
+ 201 Created
- 204 No Content
- 302 Found
> 201 Created (usually with a Location header pointing at the new resource).
? A user calls an endpoint without logging in. Which status code should the API return?
+ 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- 500 Internal Server Error
> 401 = not authenticated. 403 = authenticated but not allowed.
? Why must network calls in a Flutter app be asynchronous?
- HTTP only works asynchronously
+ Waiting on the UI thread would freeze the screen
- Dart has no threads at all
- It makes the APK smaller
> Blocking the UI thread causes jank and "app not responding" dialogs.
?= Which HTTP method is used to delete a resource? (one word)
= DELETE
> DELETE /todos/7 removes item 7.

=== boss
? A junior dev forgets await before an async database call in C#. What usually happens?
- Nothing - the compiler adds it
+ The code gets a Task object instead of the data (and may return before the query finishes)
- The query runs twice
- The program refuses to start
> Missing await is a classic bug; the compiler warns you (CS4014) - read warnings!
? Which C# type is right for VAT calculations in rands?
- float
- double
+ decimal
- long double
> decimal avoids binary rounding errors.
? The CI server builds a different package version than your laptop did. What prevents this?
- Using var everywhere
+ A lock file recording exact dependency versions
- AOT compilation
- Restarting the server
> Lock files make builds reproducible.
?? Which are true about null safety? (choose all)
+ String (Dart) and string (C#, nullable context) cannot hold null
+ You opt in to null with ?
- It slows the app down at run time
+ It turns many crashes into compile-time errors
> Null safety is checked by the compiler.
? A Flutter release build starts quickly on a cheap phone mainly because:
- It uses JIT
+ Dart is compiled AOT to native code for release
- It skips the UI thread
- Phones cache Dart source code
> AOT = no compile step at start-up.
`;
