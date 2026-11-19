/**
 * Developer tool simulators for the App & DevOps stream:
 *   dotnet  - .NET 10 SDK: new / build / run / test / add package / ef migrations / publish
 *   flutter - create / pub add / analyze / test / run (ASCII phone preview) / build
 *   dart    - run / create / format
 *   helm    - repos, charts, install / upgrade / rollback / uninstall on the simulated cluster
 *   act     - helpers to read GitHub Actions workflows (the runner itself lives in the shell)
 *
 * They are teaching simulators: they model the real commands, files, messages and failure
 * modes closely, but they don't compile real code. Running ASP.NET APIs answer curl requests
 * by reading the routes in your Program.cs / controllers.
 */
import { parseYaml, yget, type Yaml } from '../shell/yaml.js';
import { reconcile } from '../cloud/k8s.js';
import { type CmdResult, type Handler, type K8sState, type ShellCtx, fail, ok, table } from '../cloud/types.js';

const C = { reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m', blue: '\x1b[34m' };

export interface Todo {
  id: number;
  title: string;
  isComplete: boolean;
}

export interface DotnetProject {
  name: string;
  dir: string;
  template: string;
  built: boolean;
  migrations: string[];
  dbUpdated: boolean;
  todos: Todo[];
  nextId: number;
}

export interface FlutterProject {
  name: string;
  dir: string;
  tested: boolean;
  ran?: string;
  builds: string[];
}

export interface HelmRevision {
  revision: number;
  chart: string;
  appVersion: string;
  values: Record<string, string>;
  status: 'deployed' | 'superseded' | 'failed';
  description: string;
  updated: number;
}

export interface HelmRelease {
  name: string;
  ns: string;
  chartName: string;
  chartRef: string;
  fullname: string;
  revisions: HelmRevision[];
}

export interface DevState {
  dotnet: { projects: DotnetProject[]; running?: { dir: string; port: number }; tools: string[] };
  flutter: { projects: FlutterProject[]; doctor: boolean };
  helm: { repos: { name: string; url: string }[]; releases: HelmRelease[] };
  ci: { runs: { workflow: string; ok: boolean; at: number }[] };
}

export function createDev(): DevState {
  return { dotnet: { projects: [], tools: [] }, flutter: { projects: [], doctor: false }, helm: { repos: [], releases: [] }, ci: { runs: [] } };
}

/* ------------------------------------------------------------------ file helpers */

function parentOf(p: string) {
  return p.slice(0, p.lastIndexOf('/')) || '/';
}

export function writeFile(ctx: ShellCtx, path: string, content: string) {
  ctx.vfs.mkdir(parentOf(path), ctx.s.user, true);
  ctx.write(path, content);
}

function isDir(ctx: ShellCtx, path: string) {
  return ctx.vfs.get(path)?.type === 'dir';
}

/** All files under a folder (skips build output and git internals). */
export function listFiles(ctx: ShellCtx, dir: string): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  const walk = (p: string) => {
    const n = ctx.vfs.get(p);
    if (!n) return;
    if (n.type === 'file') {
      out.push({ path: p, content: n.content ?? '' });
      return;
    }
    for (const [k] of Object.entries(n.children ?? {})) {
      if (['bin', 'obj', '.git', '.dart_tool', 'build', 'node_modules'].includes(k)) continue;
      walk(`${p === '/' ? '' : p}/${k}`);
    }
  };
  walk(dir);
  return out;
}

const rel = (base: string, p: string) => (p.startsWith(base + '/') ? p.slice(base.length + 1) : p);

/** Finds unbalanced brackets outside strings and comments - our stand-in for a compiler. */
export function checkBrackets(src: string): { line: number; col: number; msg: string } | null {
  const stack: { ch: string; line: number; col: number }[] = [];
  const pairs: Record<string, string> = { ')': '(', '}': '{', ']': '[' };
  let line = 1;
  let col = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    col++;
    if (c === '\n') {
      line++;
      col = 0;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      i--;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const chunk = src.slice(i, end < 0 ? src.length : end + 2);
      line += (chunk.match(/\n/g) ?? []).length;
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q && src[i] !== '\n') {
        if (src[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (c === '(' || c === '{' || c === '[') stack.push({ ch: c, line, col });
    else if (c === ')' || c === '}' || c === ']') {
      const top = stack.pop();
      if (!top || top.ch !== pairs[c]) return { line, col, msg: `Unexpected '${c}'` };
    }
  }
  const open = stack.pop();
  if (open) return { line: open.line, col: open.col, msg: `'${open.ch === '{' ? '}' : open.ch === '(' ? ')' : ']'}' expected (the '${open.ch}' opened here is never closed)` };
  return null;
}

/* ================================================================== dotnet */

const NUGET: Record<string, string> = {
  'Microsoft.EntityFrameworkCore': '10.0.0',
  'Microsoft.EntityFrameworkCore.Sqlite': '10.0.0',
  'Microsoft.EntityFrameworkCore.SqlServer': '10.0.0',
  'Microsoft.EntityFrameworkCore.InMemory': '10.0.0',
  'Microsoft.EntityFrameworkCore.Design': '10.0.0',
  'Microsoft.EntityFrameworkCore.Tools': '10.0.0',
  'Npgsql.EntityFrameworkCore.PostgreSQL': '10.0.0',
  'Microsoft.AspNetCore.OpenApi': '10.0.0',
  'Microsoft.AspNetCore.Authentication.JwtBearer': '10.0.0',
  'Microsoft.AspNetCore.Identity.EntityFrameworkCore': '10.0.0',
  'Microsoft.AspNetCore.Mvc.Testing': '10.0.0',
  'Microsoft.Extensions.Diagnostics.HealthChecks': '10.0.0',
  'Swashbuckle.AspNetCore': '9.0.6',
  'Scalar.AspNetCore': '2.9.0',
  'Serilog.AspNetCore': '9.0.0',
  'FluentValidation.AspNetCore': '11.3.1',
  'Dapper': '2.1.66',
  'Polly': '8.6.4',
  'xunit': '2.9.3',
  'xunit.runner.visualstudio': '3.1.5',
  'Moq': '4.20.72',
  'FluentAssertions': '8.8.0',
  'Microsoft.NET.Test.Sdk': '18.0.0',
  'OpenTelemetry.Extensions.Hosting': '1.13.1',
  'AspNetCore.HealthChecks.UI.Client': '9.0.0',
};

const TEMPLATES: [string, string, string][] = [
  ['ASP.NET Core Web API', 'webapi', 'C#/F#'],
  ['ASP.NET Core Web App (Razor Pages)', 'webapp,razor', 'C#'],
  ['ASP.NET Core Web App (Model-View-Controller)', 'mvc', 'C#/F#'],
  ['Blazor Web App', 'blazor', 'C#'],
  ['Console App', 'console', 'C#/F#/VB'],
  ['Class Library', 'classlib', 'C#/F#/VB'],
  ['Worker Service', 'worker', 'C#/F#'],
  ['xUnit Test Project', 'xunit', 'C#/F#/VB'],
  ['NUnit 3 Test Project', 'nunit', 'C#/F#/VB'],
  ['MSTest Test Project', 'mstest', 'C#/F#/VB'],
  ['Solution File', 'sln', ''],
  ['dotnet gitignore file', 'gitignore,.gitignore', ''],
];

const WEB_TEMPLATES = ['webapi', 'webapp', 'razor', 'mvc', 'blazor'];
const TEST_TEMPLATES = ['xunit', 'nunit', 'mstest'];

function opt(a: string[], ...names: string[]): string | undefined {
  for (const n of names) {
    const i = a.indexOf(n);
    if (i >= 0 && a[i + 1] && !a[i + 1].startsWith('-')) return a[i + 1];
    const eq = a.find((x) => x.startsWith(n + '='));
    if (eq) return eq.slice(n.length + 1);
  }
  return undefined;
}

function positional(a: string[], valueFlags: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('-')) {
      if (valueFlags.includes(a[i])) i++;
      continue;
    }
    out.push(a[i]);
  }
  return out;
}

function csproj(name: string, template: string): string {
  const sdk = WEB_TEMPLATES.includes(template) ? 'Microsoft.NET.Sdk.Web' : template === 'worker' ? 'Microsoft.NET.Sdk.Worker' : 'Microsoft.NET.Sdk';
  const refs =
    template === 'webapi'
      ? ['    <PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="10.0.0" />']
      : TEST_TEMPLATES.includes(template)
        ? ['    <PackageReference Include="coverlet.collector" Version="6.0.4" />', '    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="18.0.0" />', '    <PackageReference Include="xunit" Version="2.9.3" />', '    <PackageReference Include="xunit.runner.visualstudio" Version="3.1.5" />']
        : [];
  return [
    `<Project Sdk="${sdk}">`,
    '',
    '  <PropertyGroup>',
    template === 'console' ? '    <OutputType>Exe</OutputType>' : '',
    '    <TargetFramework>net10.0</TargetFramework>',
    '    <ImplicitUsings>enable</ImplicitUsings>',
    '    <Nullable>enable</Nullable>',
    TEST_TEMPLATES.includes(template) ? '    <IsPackable>false</IsPackable>' : '',
    '  </PropertyGroup>',
    '',
    refs.length ? '  <ItemGroup>\n' + refs.join('\n') + '\n  </ItemGroup>\n' : '',
    TEST_TEMPLATES.includes(template) ? '  <ItemGroup>\n    <Using Include="Xunit" />\n  </ItemGroup>\n' : '',
    '</Project>',
    '',
  ]
    .filter((l, i, arr) => l !== '' || arr[i - 1] !== '')
    .join('\n');
}

export const WEBAPI_PROGRAM = `var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

app.MapGet("/weatherforecast", () =>
{
    var forecast = Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)]
        ))
        .ToArray();
    return forecast;
})
.WithName("GetWeatherForecast");

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}
`;

const CONTROLLER = `using Microsoft.AspNetCore.Mvc;

namespace NAME.Controllers;

[ApiController]
[Route("[controller]")]
public class WeatherForecastController : ControllerBase
{
    private static readonly string[] Summaries =
    [
        "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
    ];

    [HttpGet(Name = "GetWeatherForecast")]
    public IEnumerable<WeatherForecast> Get()
    {
        return Enumerable.Range(1, 5).Select(index => new WeatherForecast
        {
            Date = DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            TemperatureC = Random.Shared.Next(-20, 55),
            Summary = Summaries[Random.Shared.Next(Summaries.Length)]
        })
        .ToArray();
    }
}
`;

function newProject(ctx: ShellCtx, dev: DevState, template: string, name: string, dir: string, useControllers: boolean): string[] {
  const files: [string, string][] = [[`${name}.csproj`, csproj(name, template)]];
  if (template === 'webapi') {
    files.push(
      ['Program.cs', useControllers ? 'var builder = WebApplication.CreateBuilder(args);\n\n// Add services to the container.\nbuilder.Services.AddControllers();\nbuilder.Services.AddOpenApi();\n\nvar app = builder.Build();\n\nif (app.Environment.IsDevelopment())\n{\n    app.MapOpenApi();\n}\n\napp.UseHttpsRedirection();\napp.UseAuthorization();\napp.MapControllers();\n\napp.Run();\n' : WEBAPI_PROGRAM],
      ['appsettings.json', '{\n  "Logging": {\n    "LogLevel": {\n      "Default": "Information",\n      "Microsoft.AspNetCore": "Warning"\n    }\n  },\n  "AllowedHosts": "*"\n}\n'],
      ['appsettings.Development.json', '{\n  "Logging": {\n    "LogLevel": {\n      "Default": "Information",\n      "Microsoft.AspNetCore": "Warning"\n    }\n  }\n}\n'],
      ['Properties/launchSettings.json', '{\n  "$schema": "https://json.schemastore.org/launchsettings.json",\n  "profiles": {\n    "http": {\n      "commandName": "Project",\n      "dotnetRunMessages": true,\n      "launchBrowser": false,\n      "applicationUrl": "http://localhost:5080",\n      "environmentVariables": {\n        "ASPNETCORE_ENVIRONMENT": "Development"\n      }\n    }\n  }\n}\n'],
      [`${name}.http`, `@${name}_HostAddress = http://localhost:5080\n\nGET {{${name}_HostAddress}}/weatherforecast/\nAccept: application/json\n\n###\n`],
    );
    if (useControllers) {
      files.push(['Controllers/WeatherForecastController.cs', CONTROLLER.replace('NAME', name)]);
      files.push(['WeatherForecast.cs', `namespace ${name};\n\npublic class WeatherForecast\n{\n    public DateOnly Date { get; set; }\n\n    public int TemperatureC { get; set; }\n\n    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);\n\n    public string? Summary { get; set; }\n}\n`]);
    }
  } else if (template === 'console') {
    files.push(['Program.cs', '// See https://aka.ms/new-console-template for more information\nConsole.WriteLine("Hello, World!");\n']);
  } else if (template === 'classlib') {
    files.push(['Class1.cs', `namespace ${name};\n\npublic class Class1\n{\n\n}\n`]);
  } else if (TEST_TEMPLATES.includes(template)) {
    files.push(['UnitTest1.cs', `namespace ${name};\n\npublic class UnitTest1\n{\n    [Fact]\n    public void Test1()\n    {\n\n    }\n}\n`]);
  } else if (template === 'worker') {
    files.push(['Program.cs', `using ${name};\n\nvar builder = Host.CreateApplicationBuilder(args);\nbuilder.Services.AddHostedService<Worker>();\n\nvar host = builder.Build();\nhost.Run();\n`], ['Worker.cs', `namespace ${name};\n\npublic class Worker(ILogger<Worker> logger) : BackgroundService\n{\n    protected override async Task ExecuteAsync(CancellationToken stoppingToken)\n    {\n        while (!stoppingToken.IsCancellationRequested)\n        {\n            logger.LogInformation("Worker running at: {time}", DateTimeOffset.Now);\n            await Task.Delay(1000, stoppingToken);\n        }\n    }\n}\n`]);
  } else {
    files.push(['Program.cs', 'var builder = WebApplication.CreateBuilder(args);\nvar app = builder.Build();\n\napp.MapGet("/", () => "Hello World!");\n\napp.Run();\n']);
  }
  for (const [f, c] of files) writeFile(ctx, `${dir}/${f}`, c);
  dev.dotnet.projects = dev.dotnet.projects.filter((p) => p.dir !== dir);
  dev.dotnet.projects.push({ name, dir, template, built: false, migrations: [], dbUpdated: false, todos: [], nextId: 1 });
  return files.map(([f]) => f);
}

/** Register projects that exist as files (e.g. seeded by a lab) but aren't tracked yet. */
function discover(ctx: ShellCtx, dev: DevState, dir: string): DotnetProject | undefined {
  const n = ctx.vfs.get(dir);
  if (!n?.children) return undefined;
  const proj = Object.keys(n.children).find((k) => k.endsWith('.csproj'));
  if (!proj) return undefined;
  const content = ctx.read(`${dir}/${proj}`) ?? '';
  const template = /Sdk\.Web/.test(content) ? 'webapi' : /xunit|Test\.Sdk/i.test(content) ? 'xunit' : /<OutputType>Exe/.test(content) ? 'console' : 'classlib';
  const p: DotnetProject = { name: proj.replace(/\.csproj$/, ''), dir, template, built: false, migrations: [], dbUpdated: false, todos: [], nextId: 1 };
  const mig = ctx.vfs.get(`${dir}/Migrations`);
  if (mig?.children) p.migrations = Object.keys(mig.children).filter((k) => /^\d{14}_.+\.cs$/.test(k) && !k.endsWith('.Designer.cs')).map((k) => k.replace(/\.cs$/, ''));
  dev.dotnet.projects.push(p);
  return p;
}

function projectAt(ctx: ShellCtx, dev: DevState, start: string): DotnetProject | undefined {
  let d = start;
  for (;;) {
    const p = dev.dotnet.projects.find((x) => x.dir === d && ctx.vfs.get(`${d}/${x.name}.csproj`));
    if (p) return p;
    const found = discover(ctx, dev, d);
    if (found) return found;
    if (d === '/' || d === '') return undefined;
    d = parentOf(d);
  }
}

/** Projects inside a folder (for solution-level build/test). */
function projectsUnder(ctx: ShellCtx, dev: DevState, dir: string): DotnetProject[] {
  for (const f of listFiles(ctx, dir)) if (f.path.endsWith('.csproj')) projectAt(ctx, dev, parentOf(f.path));
  return dev.dotnet.projects.filter((p) => (p.dir === dir || p.dir.startsWith(dir + '/')) && ctx.vfs.get(`${p.dir}/${p.name}.csproj`));
}

function packagesOf(ctx: ShellCtx, p: DotnetProject): { id: string; version: string }[] {
  const xml = ctx.read(`${p.dir}/${p.name}.csproj`) ?? '';
  return [...xml.matchAll(/<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g)].map((m) => ({ id: m[1], version: m[2] }));
}

function compile(ctx: ShellCtx, p: DotnetProject): string[] {
  const errors: string[] = [];
  const pkgs = packagesOf(ctx, p).map((x) => x.id);
  for (const f of listFiles(ctx, p.dir).filter((x) => x.path.endsWith('.cs'))) {
    const r = checkBrackets(f.content);
    const name = rel(p.dir, f.path);
    if (r) errors.push(`${name}(${r.line},${r.col}): error CS1513: ${r.msg} [${p.dir}/${p.name}.csproj]`);
    if (/using Microsoft\.EntityFrameworkCore/.test(f.content) && !pkgs.some((x) => x.startsWith('Microsoft.EntityFrameworkCore') || x.startsWith('Npgsql.EntityFrameworkCore')))
      errors.push(`${name}(1,17): error CS0234: The type or namespace name 'EntityFrameworkCore' does not exist in the namespace 'Microsoft' (are you missing an assembly reference?) [${p.dir}/${p.name}.csproj]`);
    if (/\.UseSqlite\(/.test(f.content) && !pkgs.includes('Microsoft.EntityFrameworkCore.Sqlite'))
      errors.push(`${name}: error CS1061: 'DbContextOptionsBuilder' does not contain a definition for 'UseSqlite' (add the Microsoft.EntityFrameworkCore.Sqlite package) [${p.dir}/${p.name}.csproj]`);
    if (/AddJwtBearer/.test(f.content) && !pkgs.includes('Microsoft.AspNetCore.Authentication.JwtBearer'))
      errors.push(`${name}: error CS1061: 'AuthenticationBuilder' does not contain a definition for 'AddJwtBearer' (add Microsoft.AspNetCore.Authentication.JwtBearer) [${p.dir}/${p.name}.csproj]`);
  }
  return errors;
}

function build(ctx: ShellCtx, p: DotnetProject, config = 'Debug'): { ok: boolean; lines: string[] } {
  const errors = compile(ctx, p);
  const t = (1 + p.name.length / 10).toFixed(1);
  if (errors.length) {
    ctx.emit('dotnet:build:fail');
    return { ok: false, lines: ['Restore complete (0.6s)', `  ${p.name} ${C.red}failed with ${errors.length} error(s)${C.reset} (${t}s)`, ...errors.map((e) => `    ${C.red}${e}${C.reset}`), '', `Build ${C.red}failed${C.reset} with ${errors.length} error(s) in ${t}s`] };
  }
  writeFile(ctx, `${p.dir}/bin/${config}/net10.0/${p.name}.dll`, `[compiled ${p.name} - IL bytecode]\n`);
  p.built = true;
  ctx.emit('dotnet:build:ok');
  return { ok: true, lines: ['Restore complete (0.6s)', `  ${p.name} ${C.green}succeeded${C.reset} (${t}s) → bin/${config}/net10.0/${p.name}.dll`] };
}

function portOf(ctx: ShellCtx, p: DotnetProject, a: string[]): number {
  const urls = opt(a, '--urls');
  const m1 = urls?.match(/:(\d+)/);
  if (m1) return Number(m1[1]);
  const ls = ctx.read(`${p.dir}/Properties/launchSettings.json`) ?? '';
  const m2 = ls.match(/"applicationUrl":\s*"http:\/\/localhost:(\d+)/);
  return m2 ? Number(m2[1]) : 5000;
}

/** dotnet test: count [Fact]/[Theory] tests; literal Assert.Equal mismatches, Assert.Fail and Assert.True(false) fail. */
function runTests(ctx: ShellCtx, p: DotnetProject): { total: number; failed: string[] } {
  let total = 0;
  const failed: string[] = [];
  for (const f of listFiles(ctx, p.dir).filter((x) => x.path.endsWith('.cs'))) {
    const parts = f.content.split(/\[(?:Fact|Theory)[^\]]*\]/);
    for (const body of parts.slice(1)) {
      const name = body.match(/public\s+(?:async\s+Task|void)\s+(\w+)/)?.[1] ?? 'Test';
      const cases = Math.max(1, (body.split(/public\s+(?:async\s+Task|void)\s/)[0].match(/\[InlineData/g) ?? []).length);
      total += cases;
      const method = body.slice(0, body.search(/\n\s*\[(?:Fact|Theory)|$/));
      const eq = [...method.matchAll(/Assert\.Equal\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g)].find((m) => Number(m[1]) !== Number(m[2]));
      if (/Assert\.Fail\(|Assert\.True\(\s*false\s*\)|Assert\.False\(\s*true\s*\)/.test(method) || eq) failed.push(`${rel(p.dir, f.path).replace(/\.cs$/, '')}.${name}${eq ? `\n      Assert.Equal() Failure: Values differ\n      Expected: ${eq[1]}\n      Actual:   ${eq[2]}` : ''}`);
    }
  }
  return { total, failed };
}

function efMigrationFiles(ctx: ShellCtx, p: DotnetProject, name: string, ctxName: string) {
  const stamp = `20261119${String(80000 + p.migrations.length * 1234).padStart(6, '0')}`;
  const id = `${stamp}_${name}`;
  const sets = listFiles(ctx, p.dir)
    .flatMap((f) => [...f.content.matchAll(/DbSet<(\w+)>\s+(\w+)/g)])
    .map((m) => [m[1], m[2]] as const);
  const tables = sets.length ? sets : ([['Todo', 'Todos']] as const);
  const up = tables
    .map(([, t]) => `            migrationBuilder.CreateTable(\n                name: "${t}",\n                columns: table => new\n                {\n                    Id = table.Column<int>(type: "INTEGER", nullable: false)\n                        .Annotation("Sqlite:Autoincrement", true),\n                    Title = table.Column<string>(type: "TEXT", nullable: false),\n                    IsComplete = table.Column<bool>(type: "INTEGER", nullable: false)\n                },\n                constraints: table =>\n                {\n                    table.PrimaryKey("PK_${t}", x => x.Id);\n                });`)
    .join('\n\n');
  writeFile(ctx, `${p.dir}/Migrations/${id}.cs`, `using Microsoft.EntityFrameworkCore.Migrations;\n\n#nullable disable\n\nnamespace ${p.name}.Migrations\n{\n    /// <inheritdoc />\n    public partial class ${name} : Migration\n    {\n        /// <inheritdoc />\n        protected override void Up(MigrationBuilder migrationBuilder)\n        {\n${up}\n        }\n\n        /// <inheritdoc />\n        protected override void Down(MigrationBuilder migrationBuilder)\n        {\n${tables.map(([, t]) => `            migrationBuilder.DropTable(name: "${t}");`).join('\n')}\n        }\n    }\n}\n`);
  writeFile(ctx, `${p.dir}/Migrations/${id}.Designer.cs`, `// <auto-generated />\n// Model snapshot for migration ${id}\n`);
  writeFile(ctx, `${p.dir}/Migrations/${ctxName}ModelSnapshot.cs`, `// <auto-generated />\n// Current model of ${ctxName}: ${tables.map(([e, t]) => `${e} -> table ${t}`).join(', ')}\n`);
  return id;
}

export const dotnet: Handler = (ctx, a) => {
  const dev = ctx.s.dev;
  if (!dev) return fail("Command 'dotnet' not found, but can be installed with:\nsudo apt install dotnet-sdk-10.0", 127);
  const sub = a[0];
  const rest = a.slice(1);
  const cwd = ctx.s.cwd;
  if (!sub || sub === '-h' || sub === '--help')
    return ok(`Usage: dotnet [sdk-options] [command] [command-options] [arguments]\n\nSDK commands:\n  new           Create a new .NET project or file.\n  build         Build a .NET project.\n  run           Build and run a .NET project output.\n  test          Run unit tests using the test runner specified in a .NET project.\n  add package   Add a NuGet package reference to the project.\n  list package  List the package references of the project.\n  ef            Entity Framework Core tools (install: dotnet tool install --global dotnet-ef)\n  publish       Publish a .NET project for deployment.\n  watch         Run with hot reload.\n  tool          Install or manage tools that extend the .NET experience.\n  sln           Modify Visual Studio solution files.\n\nRun 'dotnet [command] --help' for more information on a command.\n`);
  if (sub === '--version') return ok('10.0.100\n');
  if (sub === '--list-sdks') return ok('10.0.100 [/usr/lib/dotnet/sdk]\n');
  if (sub === '--info')
    return ok('.NET SDK:\n Version:           10.0.100\n Commit:            b0f34d51fc\n Workload version:  10.0.100-manifests.5fb86115\n\nRuntime Environment:\n OS Name:     ubuntu\n OS Version:  24.04\n OS Platform: Linux\n RID:         linux-x64\n Base Path:   /usr/lib/dotnet/sdk/10.0.100/\n\nHost:\n  Version:      10.0.0\n  Architecture: x64\n\n.NET SDKs installed:\n  10.0.100 [/usr/lib/dotnet/sdk]\n\n.NET runtimes installed:\n  Microsoft.AspNetCore.App 10.0.0 [/usr/lib/dotnet/shared/Microsoft.AspNetCore.App]\n  Microsoft.NETCore.App 10.0.0 [/usr/lib/dotnet/shared/Microsoft.NETCore.App]\n');

  if (sub === 'new') {
    const template = positional(rest, ['-n', '--name', '-o', '--output', '-f', '--framework'])[0];
    if (!template || template === 'list' || rest.includes('--list'))
      return ok('These templates matched your input:\n\n' + table([['Template Name', 'Short Name', 'Language'], ...TEMPLATES.map(([n, s, l]) => [n, s, l])]));
    if (template === 'sln') {
      const name = opt(rest, '-n', '--name') ?? cwd.split('/').pop()!;
      writeFile(ctx, `${cwd}/${name}.sln`, `\nMicrosoft Visual Studio Solution File, Format Version 12.00\n# Visual Studio Version 17\n# Projects:\n`);
      return ok(`The template "Solution File" was created successfully.\n`);
    }
    if (template === 'gitignore' || template === '.gitignore') {
      writeFile(ctx, `${cwd}/.gitignore`, '## .NET build output\n[Bb]in/\n[Oo]bj/\n*.user\n.vs/\n*.db\nout/\n');
      return ok('The template "dotnet gitignore file" was created successfully.\n');
    }
    const known = TEMPLATES.flatMap(([, s]) => s.split(','));
    if (!known.includes(template)) return fail(`No templates or subcommands found matching: '${template}'.\n\nTo list installed templates similar to '${template}', run:\n   dotnet new list ${template}\nTo search for the templates on NuGet.org, run:\n   dotnet new search ${template}`, 103);
    const name = opt(rest, '-n', '--name') ?? cwd.split('/').pop()!;
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name)) return fail(`Error: Invalid project name '${name}'. Use letters, digits, dots and underscores (PascalCase like TodoApi is the convention).`);
    const out = opt(rest, '-o', '--output');
    const dir = out ? ctx.abs(out) : opt(rest, '-n', '--name') ? `${cwd}/${name}` : cwd;
    if (ctx.vfs.get(`${dir}/${name}.csproj`)) return fail(`Creating this template will make changes to existing files:\n  Overwrite   ./${name}.csproj\n\nRerun the command and pass --force to accept and create.`, 73);
    const tname = TEMPLATES.find(([, s]) => s.split(',').includes(template))![0];
    newProject(ctx, dev, template === 'razor' ? 'webapp' : template, name, dir, rest.includes('--use-controllers') || rest.includes('-controllers'));
    ctx.emit(`dotnet:new:${template}`);
    return ok(`The template "${tname}" was created successfully.\n\nProcessing post-creation actions...\nRestoring ${dir}/${name}.csproj:\nRestore succeeded.\n\n`);
  }

  if (sub === 'tool') {
    if (rest[0] === 'install' && rest.includes('dotnet-ef')) {
      if (!dev.dotnet.tools.includes('dotnet-ef')) dev.dotnet.tools.push('dotnet-ef');
      return ok("You can invoke the tool using the following command: dotnet-ef\nTool 'dotnet-ef' (version '10.0.0') was successfully installed.\n");
    }
    if (rest[0] === 'list') return ok(table([['Package Id', 'Version', 'Commands'], ...dev.dotnet.tools.map((t) => [t, '10.0.0', t])]));
    if (rest[0] === 'install') return fail(`Unable to find package ${positional(rest.slice(1), [])[0] ?? ''}. (Route Runner knows: dotnet-ef)`);
    return fail('Usage: dotnet tool install --global dotnet-ef | dotnet tool list -g');
  }

  if (sub === 'sln') {
    const sln = Object.keys(ctx.vfs.get(cwd)?.children ?? {}).find((k) => k.endsWith('.sln'));
    if (!sln) return fail(`MSB1003: Specify a project or solution file. The current working directory does not contain a solution file.`);
    if (rest[0] === 'add') {
      const proj = rest.slice(1).find((x) => x.endsWith('.csproj'));
      if (!proj || !ctx.vfs.get(ctx.abs(proj))) return fail(`Project \`${proj ?? ''}\` could not be found.`);
      ctx.write(`${cwd}/${sln}`, `Project: ${proj}\n`, true);
      return ok(`Project \`${proj}\` added to the solution.\n`);
    }
    if (rest[0] === 'list') return ok('Project(s)\n----------\n' + (ctx.read(`${cwd}/${sln}`) ?? '').split('\n').filter((l) => l.startsWith('Project: ')).map((l) => l.slice(9)).join('\n') + '\n');
    return fail('Usage: dotnet sln add <path.csproj> | dotnet sln list');
  }

  if (sub === 'dev-certs') return ok('Trusting the HTTPS development certificate was requested.\nSuccessfully trusted the existing HTTPS certificate.\n');

  // ---- commands that need a project
  const multi = sub === 'test' || sub === 'build' ? projectsUnder(ctx, dev, cwd) : [];
  const p = projectAt(ctx, dev, cwd);
  if (!p && !multi.length) return fail('MSBUILD : error MSB1003: Specify a project or solution file. The current working directory does not contain a project or solution file.\n[Route Runner hint] cd into the folder that contains the .csproj file (ls to look).');

  switch (sub) {
    case 'restore':
      return ok(`Restore complete (0.7s)\n\nRestore succeeded in 0.8s\n`);
    case 'build': {
      const list = p && !multi.includes(p) ? [p] : multi.length ? multi : [p!];
      const lines: string[] = [];
      let good = true;
      for (const x of list) {
        const r = build(ctx, x, opt(rest, '-c', '--configuration') ?? 'Debug');
        lines.push(...r.lines.filter((l, i) => i > 0 || !lines.length));
        good &&= r.ok;
      }
      lines.push('', good ? `Build ${C.green}succeeded${C.reset} in 2.4s` : '');
      return good ? ok(lines.join('\n') + '\n') : { out: '', err: lines.join('\n'), code: 1 };
    }
    case 'run':
    case 'watch': {
      const r = build(ctx, p!);
      if (!r.ok) return { out: '', err: r.lines.join('\n') + '\n\nThe build failed. Fix the build errors and run again.', code: 1 };
      const program = ctx.read(`${p!.dir}/Program.cs`) ?? '';
      if (!WEB_TEMPLATES.includes(p!.template)) {
        const outLines = [...program.matchAll(/Console\.WriteLine\(\$?"([^"]*)"\)/g)].map((m) => m[1]);
        ctx.emit('dotnet:run:console');
        return ok((outLines.join('\n') || '(the program printed nothing)') + '\n');
      }
      if (!/app\.Run\(\)|app\.RunAsync\(\)/.test(program)) return ok(`${r.lines.join('\n')}\n${C.yellow}warn:${C.reset} The app built but never calls app.Run(), so it exits immediately.\n`);
      const port = portOf(ctx, p!, rest);
      dev.dotnet.running = { dir: p!.dir, port };
      ctx.emit('dotnet:run');
      return ok(
        `${sub === 'watch' ? `dotnet watch 🔥 Hot reload enabled. For a list of supported edits, see https://aka.ms/dotnet/hot-reload.\n  💡 Press "Ctrl + R" to restart.\n` : 'Using launch settings from Properties/launchSettings.json...\n'}Building...\n${C.green}info${C.reset}: Microsoft.Hosting.Lifetime[14]\n      Now listening on: http://localhost:${port}\n${C.green}info${C.reset}: Microsoft.Hosting.Lifetime[0]\n      Application started. Press Ctrl+C to shut down.\n${C.green}info${C.reset}: Microsoft.Hosting.Lifetime[0]\n      Hosting environment: Development\n${C.green}info${C.reset}: Microsoft.Hosting.Lifetime[0]\n      Content root path: ${p!.dir}\n\n${C.dim}[Route Runner] The API keeps running in the background of this simulator, so you can curl it from this terminal.\n               (On a real PC you would open a second terminal.) Run "dotnet run" again after editing code.${C.reset}\n`,
      );
    }
    case 'test': {
      const list = (multi.length ? multi : [p!]).filter((x) => TEST_TEMPLATES.includes(x.template));
      if (!list.length) return ok(`${p?.name ?? 'Solution'}: no test projects found here. (Create one with: dotnet new xunit -n ${p?.name ?? 'My'}.Tests)\n`);
      let total = 0;
      const failed: string[] = [];
      const lines: string[] = ['Restore complete (0.6s)'];
      for (const x of list) {
        const b = build(ctx, x);
        if (!b.ok) return { out: '', err: b.lines.join('\n'), code: 1 };
        lines.push(b.lines[1]);
        const r = runTests(ctx, x);
        total += r.total;
        failed.push(...r.failed);
      }
      if (!total) lines.push(`${C.yellow}No test is available.${C.reset} Add methods marked [Fact].`);
      for (const f of failed) lines.push(`  ${C.red}[FAIL]${C.reset} ${f}`);
      lines.push('', `Test summary: total: ${total}, failed: ${failed.length}, succeeded: ${total - failed.length}, skipped: 0, duration: 1.1s`);
      lines.push(failed.length ? `Build ${C.red}failed${C.reset} with ${failed.length} error(s) in 3.0s` : `Build ${C.green}succeeded${C.reset} in 3.0s`);
      ctx.emit(failed.length ? 'dotnet:test:fail' : 'dotnet:test:pass');
      return failed.length ? { out: '', err: lines.join('\n'), code: 1 } : ok(lines.join('\n') + '\n');
    }
    case 'add':
    case 'remove': {
      const pos = positional(rest, ['-v', '--version']);
      const i = pos.indexOf('package');
      const id = i >= 0 ? pos[i + 1] : undefined;
      if (!id) return fail(`Usage: dotnet ${sub} package <PACKAGE_NAME> [--version <VERSION>]`);
      const path = `${p!.dir}/${p!.name}.csproj`;
      let xml = ctx.read(path) ?? '';
      if (sub === 'remove') {
        xml = xml.replace(new RegExp(`\\s*<PackageReference Include="${id.replace(/\./g, '\\.')}"[^>]*/>`), '');
        ctx.write(path, xml);
        return ok(`info : Removing PackageReference for package '${id}' from project '${path}'.\n`);
      }
      const known = Object.keys(NUGET).find((k) => k.toLowerCase() === id.toLowerCase());
      if (!known) return fail(`error: NU1101: Unable to find package ${id}. No packages exist with this id in source(s): nuget.org\nerror: Package '${id}' is incompatible with 'all' frameworks in project '${path}'.`);
      const version = opt(rest, '-v', '--version') ?? NUGET[known];
      const line = `    <PackageReference Include="${known}" Version="${version}" />`;
      if (xml.includes(`Include="${known}"`)) xml = xml.replace(new RegExp(`<PackageReference Include="${known.replace(/\./g, '\\.')}" Version="[^"]+" />`), line.trim());
      else if (/<ItemGroup>\s*\n\s*<PackageReference/.test(xml)) xml = xml.replace(/(<ItemGroup>\s*\n)(\s*<PackageReference)/, `$1${line}\n$2`);
      else xml = xml.replace('</Project>', `  <ItemGroup>\n${line}\n  </ItemGroup>\n\n</Project>`);
      ctx.write(path, xml);
      ctx.emit(`dotnet:package:${known}`);
      return ok(`\nBuild succeeded in 0.5s\ninfo : Adding PackageReference for package '${known}' into project '${path}'.\ninfo : Restoring packages for ${path}...\ninfo :   GET https://api.nuget.org/v3-flatcontainer/${known.toLowerCase()}/index.json\ninfo :   OK https://api.nuget.org/v3-flatcontainer/${known.toLowerCase()}/index.json 120ms\ninfo : Package '${known}' is compatible with all the specified frameworks in project '${path}'.\ninfo : PackageReference for package '${known}' version '${version}' added to file '${path}'.\ninfo : Writing assets file to disk. Path: ${p!.dir}/obj/project.assets.json\nlog  : Restored ${path} (in 1.2 sec).\n`);
    }
    case 'list': {
      if (rest[0] !== 'package') return fail('Usage: dotnet list package');
      const pk = packagesOf(ctx, p!);
      return ok(`Project '${p!.name}' has the following package references\n   [net10.0]: \n${table([['   Top-level Package', 'Requested', 'Resolved'], ...pk.map((x) => [`   > ${x.id}`, x.version, x.version])])}`);
    }
    case 'publish': {
      const r = build(ctx, p!, 'Release');
      if (!r.ok) return { out: '', err: r.lines.join('\n'), code: 1 };
      const out = ctx.abs(opt(rest, '-o', '--output') ?? `${p!.dir}/bin/Release/net10.0/publish`);
      for (const f of [`${p!.name}.dll`, `${p!.name}.deps.json`, `${p!.name}.runtimeconfig.json`, 'appsettings.json']) writeFile(ctx, `${out}/${f}`, `[published ${f}]\n`);
      ctx.emit('dotnet:publish');
      return ok(`Restore complete (0.6s)\n  ${p!.name} ${C.green}succeeded${C.reset} (2.0s) → ${out}/\n\nBuild succeeded in 2.6s\n`);
    }
    case 'ef': {
      if (!dev.dotnet.tools.includes('dotnet-ef'))
        return fail(`Could not execute because the specified command or file was not found.\nPossible reasons for this include:\n  * You misspelled a built-in dotnet command.\n  * You intended to execute a .NET program, but dotnet-ef does not exist.\n  * You intended to run a global tool, but a dotnet-prefixed executable with this name could not be found on the PATH.\n[Route Runner hint] Install the EF Core CLI first: dotnet tool install --global dotnet-ef`);
      const pk = packagesOf(ctx, p!).map((x) => x.id);
      const files = listFiles(ctx, p!.dir);
      const ctxName = files.map((f) => f.content.match(/class\s+(\w+)\s*(?:\([^)]*\))?\s*:\s*DbContext/)?.[1]).find(Boolean);
      const [what, action, name] = rest;
      const head = 'Build started...\nBuild succeeded.\n';
      if (!pk.includes('Microsoft.EntityFrameworkCore.Design'))
        return fail(`Build started...\nBuild succeeded.\nYour startup project '${p!.name}' doesn't reference Microsoft.EntityFrameworkCore.Design. This package is required for the Entity Framework Core Tools to work. Ensure your startup project is correct, install the package, and try again.`);
      const b = build(ctx, p!);
      if (!b.ok) return { out: '', err: 'Build started...\nBuild failed. Use dotnet build to see the errors.', code: 1 };
      if (!ctxName) return fail(`${head}No DbContext was found in assembly '${p!.name}'. Ensure that you're using the correct assembly and that the type is neither abstract nor generic.`);
      if (what === 'migrations' && action === 'add') {
        if (!name) return fail("Missing required argument '<NAME>'. Example: dotnet ef migrations add InitialCreate");
        const id = efMigrationFiles(ctx, p!, name, ctxName);
        p!.migrations.push(id);
        ctx.emit('dotnet:ef:migration');
        return ok(`${head}Done. To undo this action, use 'ef migrations remove'\n`);
      }
      if (what === 'migrations' && action === 'list') return ok(head + (p!.migrations.map((m) => m + (p!.dbUpdated ? '' : ' (Pending)')).join('\n') || 'No migrations were found.') + '\n');
      if (what === 'migrations' && action === 'remove') {
        const last = p!.migrations.pop();
        if (!last) return fail(`${head}No migrations were found.`);
        ctx.vfs.remove(`${p!.dir}/Migrations/${last}.cs`);
        return ok(`${head}Removing migration '${last}'.\nReverting the model snapshot.\nDone.\n`);
      }
      if (what === 'database' && action === 'update') {
        if (!p!.migrations.length) return fail(`${head}No migrations were found. Create one first: dotnet ef migrations add InitialCreate`);
        const cs = files.map((f) => f.content.match(/Data Source=([\w.]+)/)?.[1]).find(Boolean) ?? 'app.db';
        writeFile(ctx, `${p!.dir}/${cs}`, 'SQLite format 3\u0000 [simulated database file]\n');
        const already = p!.dbUpdated;
        p!.dbUpdated = true;
        ctx.emit('dotnet:ef:update');
        return ok(`${head}${already ? 'No migrations were applied. The database is already up to date.\n' : p!.migrations.map((m) => `Applying migration '${m}'.`).join('\n') + '\n'}Done.\n`);
      }
      if (what === 'database' && action === 'drop') {
        p!.dbUpdated = false;
        return ok(`${head}Dropping database 'main' on server 'app.db'.\nSuccessfully dropped database 'main' on server 'app.db'.\n`);
      }
      if (what === 'dbcontext' && action === 'info') return ok(`${head}Type: ${p!.name}.Data.${ctxName}\nProvider name: Microsoft.EntityFrameworkCore.Sqlite\nDatabase name: main\nData source: app.db\nOptions: None\n`);
      return fail('Usage: dotnet ef migrations add <NAME> | migrations list | migrations remove | database update | database drop | dbcontext info');
    }
    default:
      return fail(`Could not execute because the specified command or file was not found.\nPossible reasons for this include:\n  * You misspelled a built-in dotnet command.\n  * You intended to execute a .NET program, but dotnet-${sub} does not exist.\n  * You intended to run a global tool, but a dotnet-prefixed executable with this name could not be found on the PATH.`);
  }
};

/* ------------------------------------------------------------------ the running API answers HTTP */

interface Route {
  method: string;
  template: string;
  source: string;
}

function routesOf(ctx: ShellCtx, p: DotnetProject): Route[] {
  const out: Route[] = [];
  for (const f of listFiles(ctx, p.dir).filter((x) => x.path.endsWith('.cs') && !x.path.includes('/Migrations/'))) {
    const src = f.content;
    const groups: Record<string, string> = { app: '' };
    for (const m of src.matchAll(/(?:var|RouteGroupBuilder)\s+(\w+)\s*=\s*app\.MapGroup\(\s*"([^"]*)"\s*\)/g)) groups[m[1]] = m[2].replace(/\/$/, '');
    for (const m of src.matchAll(/(\w+)\.Map(Get|Post|Put|Delete|Patch)\(\s*"([^"]*)"/g)) {
      const prefix = groups[m[1]] ?? '';
      const lineEnd = src.indexOf(');', m.index ?? 0);
      out.push({ method: m[2].toUpperCase(), template: (prefix + (m[3] === '/' ? '' : m[3].startsWith('/') ? m[3] : '/' + m[3])) || '/', source: src.slice(m.index ?? 0, lineEnd < 0 ? undefined : lineEnd + 2) });
    }
    // controllers
    const cls = src.match(/\[Route\("([^"]+)"\)\][\s\S]*?class\s+(\w+)Controller/);
    if (cls) {
      const base = '/' + cls[1].replace('[controller]', cls[2].toLowerCase()).replace(/^\//, '');
      for (const m of src.matchAll(/\[Http(Get|Post|Put|Delete|Patch)(?:\(\s*"([^"]*)"[^)]*\)|\([^)"]*\))?\]/g)) out.push({ method: m[1].toUpperCase(), template: m[2] ? `${base}/${m[2]}` : base, source: src.slice(m.index ?? 0, (m.index ?? 0) + 400) });
    }
  }
  return out;
}

function matchRoute(template: string, path: string): Record<string, string> | null {
  const t = template.split('/').filter(Boolean);
  const p = path.split('?')[0].split('/').filter(Boolean);
  if (t.length !== p.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < t.length; i++) {
    const m = t[i].match(/^\{(\w+)(?::\w+)?\}$/);
    if (m) params[m[1]] = p[i];
    else if (t[i].toLowerCase() !== p[i].toLowerCase()) return null;
  }
  return params;
}

export interface HttpReply {
  status: number;
  body: string;
  events: string[];
}

const json = (v: unknown) => JSON.stringify(v, null, 2);

/** What the running ASP.NET Core app returns for a request (used by curl). */
export function devHttp(ctx: ShellCtx, port: number, method: string, path: string, body: string): HttpReply | null {
  const run = ctx.s.dev?.dotnet.running;
  if (!run || run.port !== port) return null;
  const p = ctx.s.dev!.dotnet.projects.find((x) => x.dir === run.dir);
  if (!p) return null;
  const routes = routesOf(ctx, p);
  const program = ctx.read(`${p.dir}/Program.cs`) ?? '';
  if (path.startsWith('/openapi/v1.json') && /MapOpenApi/.test(program))
    return { status: 200, events: ['dotnet:openapi'], body: json({ openapi: '3.1.1', info: { title: `${p.name} | v1`, version: '1.0.0' }, paths: Object.fromEntries(routes.map((r) => [r.template, { [r.method.toLowerCase()]: { tags: [p.name] } }])) }) };
  const candidates = routes.map((r) => ({ r, params: matchRoute(r.template, path) })).filter((x) => x.params);
  const hit = candidates.find((x) => x.r.method === method);
  if (!hit) return candidates.length ? { status: 405, body: '', events: [] } : { status: 404, body: '', events: [`dotnet:http:404`] };
  const { r, params } = hit;
  const ev = [`dotnet:http:${method}:${r.template.toLowerCase()}`];
  if (/weatherforecast/i.test(r.template)) {
    const s = ['Freezing', 'Bracing', 'Chilly', 'Cool', 'Mild', 'Warm', 'Balmy', 'Hot', 'Sweltering', 'Scorching'];
    return { status: 200, events: ev, body: json([1, 2, 3, 4, 5].map((d) => ({ date: new Date(Date.now() + d * 86400000).toISOString().slice(0, 10), temperatureC: (d * 17) % 40 - 5, summary: s[(d * 3) % s.length], temperatureF: 32 + Math.trunc(((d * 17) % 40 - 5) / 0.5556) }))) };
  }
  if (/todo/i.test(r.template)) {
    const id = params!.id !== undefined ? Number(params!.id) : undefined;
    let data: Partial<Todo> = {};
    try {
      data = body ? (JSON.parse(body) as Partial<Todo>) : {};
    } catch {
      return { status: 400, events: ev, body: json({ type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1', title: 'One or more validation errors occurred.', status: 400, errors: { $: ['The JSON value could not be converted. Check your quotes: -d \'{"title":"Buy airtime"}\''] } }) };
    }
    const find = () => p.todos.find((t) => t.id === id);
    if (method === 'GET' && id === undefined) return { status: 200, events: ev, body: json(p.todos) };
    if (method === 'GET') return find() ? { status: 200, events: ev, body: json(find()) } : { status: 404, events: ev, body: '' };
    if (method === 'POST') {
      if (!data.title) return { status: 400, events: ev, body: json({ title: 'One or more validation errors occurred.', status: 400, errors: { Title: ['The Title field is required.'] } }) };
      const t: Todo = { id: p.nextId++, title: String(data.title), isComplete: !!data.isComplete };
      p.todos.push(t);
      return { status: 201, events: [...ev, 'dotnet:todo:created'], body: json(t) };
    }
    if (method === 'PUT') {
      const t = find();
      if (!t) return { status: 404, events: ev, body: '' };
      if (data.title !== undefined) t.title = String(data.title);
      if (data.isComplete !== undefined) t.isComplete = !!data.isComplete;
      return { status: 204, events: [...ev, 'dotnet:todo:updated'], body: '' };
    }
    if (method === 'DELETE') {
      const before = p.todos.length;
      p.todos = p.todos.filter((t) => t.id !== id);
      return { status: before === p.todos.length ? 404 : 204, events: [...ev, 'dotnet:todo:deleted'], body: '' };
    }
  }
  const lit = r.source.match(/=>\s*\$?"([^"]*)"/) ?? r.source.match(/Results\.Ok\(\s*\$?"([^"]*)"/) ?? r.source.match(/return\s+\$?"([^"]*)"/);
  if (lit) {
    const text = lit[1].replace(/\{(\w+)\}/g, (_, k) => params![k] ?? `{${k}}`);
    if (/phemelo/i.test(text)) ev.push('dotnet:hello');
    return { status: 200, events: ev, body: text };
  }
  return { status: 200, events: ev, body: '"OK" (Route Runner shows string results; this endpoint returned an object)' };
}

/* ================================================================== flutter & dart */

const PUB: Record<string, string> = {
  http: '1.5.0',
  dio: '5.9.0',
  provider: '6.1.5',
  flutter_riverpod: '3.0.3',
  riverpod: '3.0.3',
  flutter_bloc: '9.1.1',
  go_router: '16.3.0',
  shared_preferences: '2.5.3',
  sqflite: '2.4.2',
  hive: '2.2.3',
  intl: '0.20.2',
  firebase_core: '4.2.0',
  firebase_auth: '6.1.1',
  cloud_firestore: '6.0.3',
  json_annotation: '4.9.0',
  freezed_annotation: '3.1.0',
  url_launcher: '6.3.2',
  google_fonts: '6.3.2',
  flutter_lints: '6.0.0',
  mocktail: '1.0.4',
  equatable: '2.0.7',
};

const DART_KEYWORDS = ['abstract', 'as', 'assert', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'do', 'else', 'enum', 'extends', 'false', 'final', 'finally', 'for', 'if', 'import', 'in', 'is', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'var', 'void', 'while', 'with', 'flutter', 'test'];

export const FLUTTER_MAIN = `import 'package:flutter/material.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  // This widget is the root of your application.
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter Demo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
      ),
      home: const MyHomePage(title: 'Flutter Demo Home Page'),
    );
  }
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key, required this.title});

  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  int _counter = 0;

  void _incrementCounter() {
    setState(() {
      // setState tells Flutter that something changed, so build() runs again.
      _counter++;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        title: Text(widget.title),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            const Text('You have pushed the button this many times:'),
            Text(
              '$_counter',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _incrementCounter,
        tooltip: 'Increment',
        child: const Icon(Icons.add),
      ),
    );
  }
}
`;

const FLUTTER_TEST = (pkg: string) => `// This is a basic Flutter widget test.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:${pkg}/main.dart';

void main() {
  testWidgets('Counter increments smoke test', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const MyApp());

    // Verify that our counter starts at 0.
    expect(find.text('0'), findsOneWidget);
    expect(find.text('1'), findsNothing);

    // Tap the '+' icon and trigger a frame.
    await tester.tap(find.byIcon(Icons.add));
    await tester.pump();

    // Verify that our counter has incremented.
    expect(find.text('0'), findsNothing);
    expect(find.text('1'), findsOneWidget);
  });
}
`;

function pubspec(name: string) {
  return `name: ${name}\ndescription: "A new Flutter project."\npublish_to: 'none'\n\nversion: 1.0.0+1\n\nenvironment:\n  sdk: ^3.10.0\n\ndependencies:\n  flutter:\n    sdk: flutter\n  cupertino_icons: ^1.0.8\n\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\n  flutter_lints: ^6.0.0\n\nflutter:\n  uses-material-design: true\n`;
}

function flutterProjectAt(ctx: ShellCtx, dev: DevState, start: string): FlutterProject | undefined {
  let d = start;
  for (;;) {
    const spec = ctx.read(`${d}/pubspec.yaml`);
    if (spec !== undefined) {
      let p = dev.flutter.projects.find((x) => x.dir === d);
      if (!p) {
        p = { name: spec.match(/^name:\s*(\S+)/m)?.[1] ?? d.split('/').pop()!, dir: d, tested: false, builds: [] };
        dev.flutter.projects.push(p);
      }
      return p;
    }
    if (d === '/' || d === '') return undefined;
    d = parentOf(d);
  }
}

function analyze(ctx: ShellCtx, p: FlutterProject): string[] {
  const issues: string[] = [];
  for (const f of listFiles(ctx, `${p.dir}/lib`).filter((x) => x.path.endsWith('.dart'))) {
    const r = checkBrackets(f.content);
    if (r) issues.push(`  error • ${r.msg} • ${rel(p.dir, f.path)}:${r.line}:${r.col} • expected_token`);
    if (f.path.endsWith('/main.dart') && !/void\s+main\s*\(/.test(f.content)) issues.push(`  error • The library 'main.dart' doesn't have a main() function • lib/main.dart:1:1 • missing_main`);
    for (const m of f.content.matchAll(/import\s+'package:(\w+)\//g)) {
      if (['flutter', p.name].includes(m[1])) continue;
      if (!new RegExp(`^\\s+${m[1]}:`, 'm').test(ctx.read(`${p.dir}/pubspec.yaml`) ?? '')) issues.push(`  error • Target of URI doesn't exist: 'package:${m[1]}/...' (run: flutter pub add ${m[1]}) • ${rel(p.dir, f.path)} • uri_does_not_exist`);
    }
  }
  return issues;
}

/** Draws the app's first screen as ASCII art from main.dart (title, texts, button). */
function phonePreview(src: string, device: string): string {
  const appTitle = src.match(/MyHomePage\(\s*title:\s*'([^']*)'/)?.[1] ?? src.match(/appBar:\s*AppBar\([\s\S]*?title:\s*(?:const\s+)?Text\(\s*'([^']*)'/)?.[1] ?? src.match(/title:\s*'([^']*)'/)?.[1] ?? 'My App';
  const body = src.slice(src.indexOf('body:') >= 0 ? src.indexOf('body:') : 0);
  const texts = [...body.matchAll(/Text\(\s*'([^']*)'/g)].map((m) => m[1].replace(/\$_?(\w+)/g, (_, v) => (v === 'counter' ? '0' : `<${v}>`)).replace('\\$', '$')).slice(0, 6);
  if (/'\$_counter'/.test(body) && !texts.includes('0')) texts.push('0');
  const cards = [...body.matchAll(/ListTile\([\s\S]*?title:\s*(?:const\s+)?Text\(\s*'([^']*)'/g)].map((m) => m[1]);
  const fab = /FloatingActionButton/.test(src);
  const W = 30;
  const pad = (s: string) => {
    const t = s.length > W - 4 ? s.slice(0, W - 7) + '...' : s;
    const left = Math.floor((W - 2 - t.length) / 2);
    return '│' + ' '.repeat(left) + t + ' '.repeat(W - 2 - left - t.length) + '│';
  };
  const lines = ['╭' + '─'.repeat(W - 2) + '╮', pad('9:41        ▂▄▆ 5G  ▮▮▮'), '├' + '─'.repeat(W - 2) + '┤', pad(appTitle), '├' + '─'.repeat(W - 2) + '┤', pad('')];
  for (const c of cards.length ? cards : texts) lines.push(pad(cards.length ? `▸ ${c}` : c), pad(''));
  while (lines.length < 15) lines.push(pad(''));
  lines.push(fab ? '│' + ' '.repeat(W - 8) + '( + ) │' : pad(''), pad(''), '╰' + '─'.repeat(W - 2) + '╯');
  return `${C.dim}What ${device} shows (Route Runner preview):${C.reset}\n${lines.join('\n')}\n`;
}

export const flutter: Handler = (ctx, a) => {
  const dev = ctx.s.dev;
  if (!dev) return fail("Command 'flutter' not found, but can be installed with:\nsudo snap install flutter --classic", 127);
  const [sub, ...rest] = a;
  const cwd = ctx.s.cwd;
  if (!sub || sub === '-h' || sub === '--help')
    return ok('Manage your Flutter app development.\n\nCommon commands:\n\n  flutter create <output directory>\n    Create a new Flutter project in the specified directory.\n\n  flutter run [options]\n    Run your Flutter application on an attached device or in an emulator.\n\nAvailable commands:\n  analyze   Analyze the project\'s Dart code.\n  build     Build an executable app or install bundle (apk, appbundle, web, linux).\n  create    Create a new Flutter project.\n  devices   List all connected devices.\n  doctor    Show information about the installed tooling.\n  pub       Commands for managing Flutter packages (get, add, outdated).\n  run       Run your Flutter app on an attached device.\n  test      Run Flutter unit tests for the current project.\n');
  if (sub === '--version')
    return ok('Flutter 3.38.5 • channel stable • https://github.com/flutter/flutter.git\nFramework • revision 9f455d2486 • 2025-12-11\nEngine • hash 1527ae0ec5 • revision 4f8b5ac9ba\nTools • Dart 3.10.4 • DevTools 2.51.1\n');
  if (sub === 'doctor') {
    dev.flutter.doctor = true;
    ctx.emit('flutter:doctor');
    return ok(`Doctor summary (to see all details, run flutter doctor -v):\n[${C.green}✓${C.reset}] Flutter (Channel stable, 3.38.5, on Ubuntu 24.04.3 LTS 6.8.0-48-generic, locale en_ZA.UTF-8)\n[${C.green}✓${C.reset}] Android toolchain - develop for Android devices (Android SDK version 36.0.0)\n[${C.green}✓${C.reset}] Chrome - develop for the web\n[${C.green}✓${C.reset}] Linux toolchain - develop for Linux desktop\n[${C.yellow}!${C.reset}] Android Studio (not installed)\n    • Optional: VS Code with the Flutter extension works just as well.\n[${C.green}✓${C.reset}] VS Code (version 1.106.0)\n[${C.green}✓${C.reset}] Connected device (3 available)\n[${C.green}✓${C.reset}] Network resources\n\n${C.yellow}!${C.reset} Doctor found issues in 1 category.\n`);
  }
  if (sub === 'devices')
    return ok('Found 3 connected devices:\n  Pixel 8 (mobile)  • emulator-5554 • android-x64    • Android 15 (API 35) (emulator)\n  Linux (desktop)   • linux         • linux-x64      • Ubuntu 24.04.3 LTS\n  Chrome (web)      • chrome        • web-javascript • Google Chrome 142.0\n');
  if (sub === 'create') {
    const target = positional(rest, ['--org', '--platforms', '-t', '--template'])[0];
    if (!target) return fail('No option specified for the output directory.\nUsage: flutter create <output directory>');
    const name = target.split('/').pop()!;
    if (!/^[a-z][a-z0-9_]*$/.test(name) || DART_KEYWORDS.includes(name))
      return fail(`"${name}" is not a valid Dart package name.\n\nThe name should be all lowercase, with underscores to separate words, "just_like_this".\nUse only basic Latin letters and Arabic digits: [a-z0-9_].\nAlso, make sure the name is a valid Dart identifier—that is, it doesn't start with digits and isn't a reserved word.\nSee https://dart.dev/tools/pub/pubspec#name for more information.\n[Route Runner hint] Try: flutter create ${name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9_]/g, '_')}`, 64);
    const dir = ctx.abs(target);
    const files: [string, string][] = [
      ['pubspec.yaml', pubspec(name)],
      ['lib/main.dart', FLUTTER_MAIN],
      ['test/widget_test.dart', FLUTTER_TEST(name)],
      ['analysis_options.yaml', 'include: package:flutter_lints/flutter.yaml\n'],
      ['README.md', `# ${name}\n\nA new Flutter project.\n`],
      ['.gitignore', '.dart_tool/\nbuild/\n.flutter-plugins-dependencies\n'],
      ['android/app/build.gradle.kts', `android {\n    namespace = "com.example.${name}"\n    defaultConfig { minSdk = 24 }\n}\n`],
      ['android/app/src/main/AndroidManifest.xml', `<manifest>\n  <application android:label="${name}" />\n</manifest>\n`],
      ['ios/Runner/Info.plist', `<plist><dict><key>CFBundleName</key><string>${name}</string></dict></plist>\n`],
      ['web/index.html', `<!DOCTYPE html>\n<html><head><title>${name}</title></head><body><script src="flutter_bootstrap.js" async></script></body></html>\n`],
      ['linux/CMakeLists.txt', `set(BINARY_NAME "${name}")\n`],
    ];
    for (const [f, c] of files) writeFile(ctx, `${dir}/${f}`, c);
    dev.flutter.projects = dev.flutter.projects.filter((x) => x.dir !== dir);
    dev.flutter.projects.push({ name, dir, tested: false, builds: [] });
    ctx.emit('flutter:create');
    return ok(`Creating project ${target}...\nResolving dependencies in \`${target}\`...\nDownloading packages...\nGot dependencies in \`${target}\`.\nWrote 130 files.\n\nAll done!\nYou can find general documentation for Flutter at: https://docs.flutter.dev/\nDetailed API documentation is available at: https://api.flutter.dev/\n\nIn order to run your application, type:\n\n  $ cd ${target}\n  $ flutter run\n\nYour application code is in ${target}/lib/main.dart.\n`);
  }
  const p = flutterProjectAt(ctx, dev, cwd);
  if (!p) return fail('Error: No pubspec.yaml file found.\nThis command should be run from the root of your Flutter project.\n[Route Runner hint] cd into your project folder first (the one with pubspec.yaml).');
  switch (sub) {
    case 'pub': {
      const [action, ...pkgs] = rest;
      if (action === 'get' || action === 'upgrade') return ok(`Resolving dependencies...\nDownloading packages...\nGot dependencies!\n`);
      if (action === 'outdated') return ok('Showing outdated packages.\n\nall dependencies are up-to-date.\n');
      if (action === 'add') {
        if (!pkgs.length) return fail('Must specify at least one package to be added.\nUsage: flutter pub add <package>[:<constraint>]');
        let spec = ctx.read(`${p.dir}/pubspec.yaml`) ?? '';
        const added: string[] = [];
        for (const raw of pkgs.filter((x) => !x.startsWith('-'))) {
          const pkg = raw.split(':')[0];
          if (!PUB[pkg]) return fail(`Because ${p.name} depends on ${pkg} any which doesn't exist (could not find package ${pkg} at https://pub.dev), version solving failed.`);
          if (new RegExp(`^\\s+${pkg}:`, 'm').test(spec)) continue;
          const dev2 = rest.includes('--dev') || rest.includes('-d');
          spec = dev2 ? spec.replace(/(dev_dependencies:\n)/, `$1  ${pkg}: ^${PUB[pkg]}\n`) : spec.replace(/(dependencies:\n  flutter:\n    sdk: flutter\n)/, `$1  ${pkg}: ^${PUB[pkg]}\n`);
          added.push(`+ ${pkg} ${PUB[pkg]}`);
          ctx.emit(`flutter:pub:${pkg}`);
        }
        ctx.write(`${p.dir}/pubspec.yaml`, spec);
        return ok(`Resolving dependencies...\nDownloading packages...\n${added.join('\n')}\nChanged ${added.length} dependenc${added.length === 1 ? 'y' : 'ies'}!\n`);
      }
      return fail('Usage: flutter pub get | add <package> | outdated');
    }
    case 'analyze': {
      const issues = analyze(ctx, p);
      ctx.emit(issues.length ? 'flutter:analyze:issues' : 'flutter:analyze:ok');
      return issues.length ? { out: '', err: `Analyzing ${p.name}...\n\n${issues.join('\n')}\n\n${issues.length} issue${issues.length > 1 ? 's' : ''} found. (ran in 1.4s)`, code: 1 } : ok(`Analyzing ${p.name}...\nNo issues found! (ran in 1.3s)\n`);
    }
    case 'test': {
      const issues = analyze(ctx, p);
      if (issues.length) return { out: '', err: `lib/main.dart: Error: Compilation failed.\n${issues.join('\n')}\n00:02 +0 -1: Some tests failed.`, code: 1 };
      const tests = listFiles(ctx, `${p.dir}/test`).filter((f) => f.path.endsWith('_test.dart'));
      const main = ctx.read(`${p.dir}/lib/main.dart`) ?? '';
      let passed = 0;
      const failed: string[] = [];
      for (const t of tests) {
        for (const m of t.content.matchAll(/(?:testWidgets|test)\(\s*'([^']+)'/g)) {
          const counter = /Counter increments/.test(m[1]);
          if (counter && !(/_counter\+\+|_counter \+= 1/.test(main) && /Icons\.add/.test(main))) failed.push(`${rel(p.dir, t.path)}: ${m[1]} [E]\n  Expected: exactly one matching candidate\n  Actual: _TextWidgetFinder:<Found 0 widgets with text "1">\n  [Route Runner hint] You changed the counter screen - update test/widget_test.dart to test your new UI.`);
          else passed++;
        }
      }
      p.tested = !failed.length && passed > 0;
      ctx.emit(failed.length ? 'flutter:test:fail' : 'flutter:test:pass');
      const summary = failed.length ? `00:04 +${passed} -${failed.length}: Some tests failed.` : `00:03 +${passed}: All tests passed!`;
      return failed.length ? { out: '', err: failed.join('\n\n') + '\n' + summary, code: 1 } : ok(summary + '\n');
    }
    case 'run': {
      const device = opt(rest, '-d', '--device-id') ?? 'emulator-5554';
      const issues = analyze(ctx, p);
      if (issues.length) return { out: '', err: `Launching lib/main.dart on ${device} in debug mode...\nlib/main.dart: Error: Compilation failed.\n${issues.join('\n')}\nError: Failed to compile application.`, code: 1 };
      const name = device === 'chrome' ? 'Chrome' : device === 'linux' ? 'Linux' : 'Pixel 8 (emulator)';
      p.ran = device;
      ctx.emit('flutter:run');
      ctx.emit(`flutter:run:${device}`);
      const main = ctx.read(`${p.dir}/lib/main.dart`) ?? '';
      return ok(`Launching lib/main.dart on ${name} in debug mode...\n${device === 'chrome' ? 'Waiting for connection from debug service on Chrome...             9.8s' : '✓ Built build/app/outputs/flutter-apk/app-debug.apk'}\nSyncing files to device ${name}...                                   112ms\n\nFlutter run key commands.\nr Hot reload. 🔥🔥🔥\nR Hot restart.\nh List all available interactive commands.\nq Quit (terminate the application on the device).\n\n${phonePreview(main, name)}${C.dim}[Route Runner] Edit lib/main.dart (nano lib/main.dart) and run flutter run again to "hot reload".${C.reset}\n`);
    }
    case 'build': {
      const target = rest[0] ?? 'apk';
      const issues = analyze(ctx, p);
      if (issues.length) return { out: '', err: `Compilation failed.\n${issues.join('\n')}`, code: 1 };
      const outputs: Record<string, string> = { apk: 'build/app/outputs/flutter-apk/app-release.apk (19.8MB)', appbundle: 'build/app/outputs/bundle/release/app-release.aab (21.2MB)', web: 'build/web', linux: 'build/linux/x64/release/bundle/' + p.name, ios: 'build/ios/iphoneos/Runner.app' };
      if (!outputs[target]) return fail(`Could not find a subcommand named "${target}" for "flutter build". Try: apk, appbundle, web, linux.`);
      if (target === 'ios') return fail('Building for iOS is only supported on macOS. (That is why many teams use a Mac runner in CI for iOS builds.)');
      p.builds.push(target);
      writeFile(ctx, `${p.dir}/${outputs[target].split(' ')[0]}${target === 'web' ? '/index.html' : ''}`, `[release build of ${p.name}]\n`);
      ctx.emit(`flutter:build:${target}`);
      return ok(`${target === 'apk' || target === 'appbundle' ? "Running Gradle task 'assembleRelease'...                          41.7s\n" : 'Compiling lib/main.dart for the Web...                              18.2s\n'}${C.green}✓${C.reset} Built ${outputs[target]}\n`);
    }
    case 'clean':
      return ok('Deleting build...                                                    5ms\nDeleting .dart_tool...                                               3ms\n');
    default:
      return fail(`Could not find a command named "${sub}".\nRun 'flutter -h' (or 'flutter <command> -h') for available flutter commands and options.`, 64);
  }
};

export const dart: Handler = (ctx, a) => {
  if (!ctx.s.dev) return fail("Command 'dart' not found, but can be installed with:\nsudo snap install flutter --classic", 127);
  const [sub, ...rest] = a;
  if (!sub || sub === '--version') return ok('Dart SDK version: 3.10.4 (stable) on "linux_x64"\n');
  if (sub === 'create') {
    const name = positional(rest, ['-t', '--template'])[0];
    if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) return fail(`"${name ?? ''}" is not a valid Dart package name (use lower_case_with_underscores).`);
    const dir = ctx.abs(name);
    writeFile(ctx, `${dir}/pubspec.yaml`, `name: ${name}\ndescription: A sample command-line application.\nversion: 1.0.0\n\nenvironment:\n  sdk: ^3.10.0\n`);
    writeFile(ctx, `${dir}/bin/${name}.dart`, `void main(List<String> arguments) {\n  print('Hello world!');\n}\n`);
    return ok(`Creating ${name} using template console...\n\n  .gitignore\n  bin/${name}.dart\n  pubspec.yaml\n\nCreated project ${name}! In order to get started, run the following commands:\n\n  cd ${name}\n  dart run\n`);
  }
  if (sub === 'run') {
    let file = rest.find((x) => x.endsWith('.dart'));
    if (!file) {
      const spec = ctx.read(`${ctx.s.cwd}/pubspec.yaml`);
      const name = spec?.match(/^name:\s*(\S+)/m)?.[1];
      if (!name) return fail('Could not find a pubspec.yaml or a .dart file to run.');
      file = `bin/${name}.dart`;
    }
    const src = ctx.read(ctx.abs(file));
    if (src === undefined) return fail(`Error when reading '${file}': No such file or directory`, 254);
    const r = checkBrackets(src);
    if (r) return fail(`${file}:${r.line}:${r.col}: Error: ${r.msg}`, 254);
    const vars: Record<string, string> = {};
    for (const m of src.matchAll(/(?:var|final|String|const)\s+(\w+)\s*=\s*'([^']*)'/g)) vars[m[1]] = m[2];
    for (const m of src.matchAll(/(?:var|final|int|double|const)\s+(\w+)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/g)) vars[m[1]] = m[2];
    const out = [...src.matchAll(/print\(\s*'([^']*)'\s*\)/g)].map((m) => m[1].replace(/\$\{?(\w+)\}?/g, (_, v) => vars[v] ?? `$${v}`));
    ctx.emit('dart:run');
    return ok(out.join('\n') + (out.length ? '\n' : ''));
  }
  if (sub === 'format') return ok('Formatted 3 files (0 changed) in 0.12 seconds.\n');
  if (sub === 'analyze') return ok('Analyzing...\nNo issues found!\n');
  return fail(`Could not find a command named "${sub}".`, 64);
};

/* ================================================================== helm */

interface ChartInfo {
  name: string;
  version: string;
  appVersion: string;
  values: Record<string, string>;
  description: string;
}

const REPO_CHARTS: Record<string, ChartInfo[]> = {
  bitnami: [
    { name: 'nginx', version: '22.3.2', appVersion: '1.29.3', values: { replicaCount: '1', 'image.repository': 'nginx', 'image.tag': '1.29', 'service.type': 'LoadBalancer', 'service.port': '80' }, description: 'NGINX Open Source is a web server that can be also used as a reverse proxy' },
    { name: 'redis', version: '23.2.1', appVersion: '8.2.2', values: { replicaCount: '1', 'image.repository': 'redis', 'image.tag': '8.2', 'service.type': 'ClusterIP', 'service.port': '6379' }, description: 'Redis(R) is an open source, advanced key-value store' },
    { name: 'postgresql', version: '18.1.4', appVersion: '18.0.0', values: { replicaCount: '1', 'image.repository': 'postgres', 'image.tag': '18', 'service.type': 'ClusterIP', 'service.port': '5432' }, description: 'PostgreSQL is an object-relational database' },
  ],
  'prometheus-community': [{ name: 'kube-prometheus-stack', version: '79.5.0', appVersion: 'v0.86.2', values: { replicaCount: '1', 'image.repository': 'prom/prometheus', 'image.tag': 'v3.7', 'service.type': 'ClusterIP', 'service.port': '9090' }, description: 'Prometheus, Grafana and Alertmanager in one chart' }],
  grafana: [{ name: 'grafana', version: '10.1.4', appVersion: '12.2.1', values: { replicaCount: '1', 'image.repository': 'grafana/grafana', 'image.tag': '12.2', 'service.type': 'ClusterIP', 'service.port': '3000' }, description: 'The leading tool for querying and visualizing time series and metrics' }],
  'ingress-nginx': [{ name: 'ingress-nginx', version: '4.14.0', appVersion: '1.14.0', values: { replicaCount: '1', 'image.repository': 'nginx', 'image.tag': '1.29', 'service.type': 'LoadBalancer', 'service.port': '80' }, description: 'Ingress controller for Kubernetes using NGINX' }],
  argo: [{ name: 'argo-cd', version: '9.1.3', appVersion: 'v3.2.0', values: { replicaCount: '1', 'image.repository': 'nginx', 'image.tag': '1.29', 'service.type': 'ClusterIP', 'service.port': '80' }, description: 'A declarative, GitOps continuous delivery tool for Kubernetes' }],
};
const REPO_URLS: Record<string, string> = {
  bitnami: 'https://charts.bitnami.com/bitnami',
  'prometheus-community': 'https://prometheus-community.github.io/helm-charts',
  grafana: 'https://grafana.github.io/helm-charts',
  'ingress-nginx': 'https://kubernetes.github.io/ingress-nginx',
  argo: 'https://argoproj.github.io/argo-helm',
};

/** Flatten a parsed values.yaml into "a.b.c" keys. */
function flatten(y: Yaml | undefined, prefix = '', out: Record<string, string> = {}) {
  if (y && typeof y === 'object' && !Array.isArray(y)) for (const [k, v] of Object.entries(y)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  else if (prefix && y !== undefined && !Array.isArray(y)) out[prefix] = y === null ? '' : String(y);
  return out;
}

function loadChart(ctx: ShellCtx, dev: DevState, ref: string): ChartInfo | string {
  const dir = ctx.abs(ref);
  const chartYaml = ctx.read(`${dir}/Chart.yaml`);
  if (chartYaml !== undefined) {
    let meta: Yaml;
    let vals: Yaml = {};
    try {
      meta = parseYaml(chartYaml);
      const v = ctx.read(`${dir}/values.yaml`);
      if (v) vals = parseYaml(v);
    } catch (e) {
      return `Error: YAML parse error in chart ${ref}: ${(e as Error).message}`;
    }
    if (!isDir(ctx, `${dir}/templates`)) return `Error: chart ${ref} has no templates/ folder`;
    return { name: String(yget(meta, 'name') ?? 'chart'), version: String(yget(meta, 'version') ?? '0.1.0'), appVersion: String(yget(meta, 'appVersion') ?? '1.0.0'), values: flatten(vals), description: String(yget(meta, 'description') ?? '') };
  }
  const [repo, name] = ref.split('/');
  if (!name) return `Error: INSTALLATION FAILED: repo ${ref} not found (local charts need a path like ./charts/${ref})`;
  if (!dev.helm.repos.some((r) => r.name === repo)) return `Error: INSTALLATION FAILED: repo ${repo} not found\n[Route Runner hint] helm repo add ${repo} ${REPO_URLS[repo] ?? '<url>'}`;
  const c = REPO_CHARTS[repo]?.find((x) => x.name === name);
  return c ? { ...c, values: { ...c.values } } : `Error: INSTALLATION FAILED: chart "${name}" not found in ${repo} index. (try "helm search repo ${repo}")`;
}

function parseSets(a: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  a.forEach((x, i) => {
    if (x === '--set' && a[i + 1]) for (const kv of a[i + 1].split(',')) {
      const j = kv.indexOf('=');
      if (j > 0) out[kv.slice(0, j)] = kv.slice(j + 1);
    }
  });
  return out;
}

function valuesFile(ctx: ShellCtx, a: string[]): Record<string, string> | string {
  const f = opt(a, '-f', '--values');
  if (!f) return {};
  const txt = ctx.read(ctx.abs(f));
  if (txt === undefined) return `Error: open ${f}: no such file or directory`;
  try {
    return flatten(parseYaml(txt));
  } catch (e) {
    return `Error: failed to parse ${f}: ${(e as Error).message}`;
  }
}

function fullnameOf(release: string, chart: string, values: Record<string, string>) {
  if (values.fullnameOverride) return values.fullnameOverride;
  return release.includes(chart) ? release : `${release}-${chart}`;
}

/** Make the cluster match a release revision: one Deployment + one Service. */
function applyRelease(k: K8sState, rel: HelmRelease, rev: HelmRevision) {
  const v = rev.values;
  const image = `${v['image.repository'] ?? 'nginx'}:${v['image.tag'] || rev.appVersion}`;
  const replicas = Math.max(0, Number(v.replicaCount ?? 1) || 0);
  const port = Number(v['service.port'] ?? 80) || 80;
  let d = k.deployments.find((x) => x.name === rel.fullname && x.ns === rel.ns);
  if (!d) {
    d = { name: rel.fullname, ns: rel.ns, image, replicas, revision: 1, history: [image], port, created: Date.now() };
    k.deployments.push(d);
  } else if (d.image !== image || d.replicas !== replicas) {
    if (d.image !== image) {
      d.revision++;
      d.history.push(image);
    }
    d.image = image;
    d.replicas = replicas;
  }
  const type = (v['service.type'] as 'ClusterIP' | 'NodePort' | 'LoadBalancer') ?? 'ClusterIP';
  let s = k.services.find((x) => x.name === rel.fullname && x.ns === rel.ns);
  if (!s) {
    s = { name: rel.fullname, ns: rel.ns, type, selector: `app=${rel.fullname}`, port, targetPort: port, clusterIp: `10.96.${40 + k.services.length}.${10 + k.seq % 200}` };
    k.services.push(s);
  }
  s.type = ['ClusterIP', 'NodePort', 'LoadBalancer'].includes(type) ? type : 'ClusterIP';
  s.port = port;
  if (s.type !== 'ClusterIP' && !s.nodePort) s.nodePort = 30000 + (k.services.length * 137) % 2767;
  if (s.type === 'LoadBalancer') s.externalIp = s.externalIp ?? `102.65.${10 + k.services.length}.${20 + k.seq % 200}`;
  if (!k.namespaces.includes(rel.ns)) k.namespaces.push(rel.ns);
  reconcile(k);
}

const helmDate = (t: number) => new Date(t).toUTCString().replace('GMT', '+0000');

export const helm: Handler = (ctx, a) => {
  const dev = ctx.s.dev;
  const k = ctx.s.k8s;
  const [sub, ...rest] = a;
  if (!sub || sub === '-h' || sub === '--help')
    return ok('The Kubernetes package manager\n\nCommon actions for Helm:\n- helm search:    search for charts\n- helm pull:      download a chart to your local directory to view\n- helm install:   upload the chart to Kubernetes\n- helm list:      list releases of charts\n\nUsage:\n  helm [command]\n\nAvailable Commands:\n  create, history, install, lint, list, repo, rollback, search, status, template, uninstall, upgrade, get, version\n');
  if (sub === 'version') return ok('version.BuildInfo{Version:"v3.19.0", GitCommit:"3d8990f0836691f0229297773f3524598f46bda6", GitTreeState:"clean", GoVersion:"go1.24.7"}\n');
  if (!dev || !k) return fail('Error: Kubernetes cluster unreachable: Get "http://localhost:8080/version": dial tcp 127.0.0.1:8080: connect: connection refused');
  const ns = opt(rest, '-n', '--namespace') ?? k.currentNs;
  const pos = positional(rest, ['-n', '--namespace', '--set', '-f', '--values', '--version', '-o', '--output']);
  switch (sub) {
    case 'repo': {
      const [action, name, url] = pos;
      if (action === 'add') {
        if (!name || !url) return fail('Error: "helm repo add" requires 2 arguments\n\nUsage:  helm repo add [NAME] [URL] [flags]');
        if (!REPO_URLS[name]) return fail(`Error: looks like "${url}" is not a valid chart repository or cannot be reached (Route Runner knows: ${Object.keys(REPO_URLS).join(', ')})`);
        if (!dev.helm.repos.some((r) => r.name === name)) dev.helm.repos.push({ name, url });
        ctx.emit(`helm:repo:${name}`);
        return ok(`"${name}" has been added to your repositories\n`);
      }
      if (action === 'list' || action === 'ls') return dev.helm.repos.length ? ok(table([['NAME', 'URL'], ...dev.helm.repos.map((r) => [r.name, r.url])])) : fail('Error: no repositories to show');
      if (action === 'update') return ok(`Hang tight while we grab the latest from your chart repositories...\n${dev.helm.repos.map((r) => `...Successfully got an update from the "${r.name}" chart repository`).join('\n')}\nUpdate Complete. ⎈Happy Helming!⎈\n`);
      if (action === 'remove' || action === 'rm') {
        dev.helm.repos = dev.helm.repos.filter((r) => r.name !== name);
        return ok(`"${name}" has been removed from your repositories\n`);
      }
      return fail('Usage: helm repo add|list|update|remove');
    }
    case 'search': {
      const term = (pos[1] ?? '').toLowerCase();
      const rows = dev.helm.repos.flatMap((r) => (REPO_CHARTS[r.name] ?? []).map((c) => [`${r.name}/${c.name}`, c.version, c.appVersion, c.description])).filter((r) => r[0].toLowerCase().includes(term));
      return rows.length ? ok(table([['NAME', 'CHART VERSION', 'APP VERSION', 'DESCRIPTION'], ...rows])) : ok('No results found\n');
    }
    case 'create': {
      const name = pos[0];
      if (!name) return fail('Error: "helm create" requires 1 argument');
      const dir = ctx.abs(name);
      const n = name.split('/').pop()!;
      writeFile(ctx, `${dir}/Chart.yaml`, `apiVersion: v2\nname: ${n}\ndescription: A Helm chart for Kubernetes\ntype: application\nversion: 0.1.0\nappVersion: "1.16.0"\n`);
      writeFile(ctx, `${dir}/values.yaml`, `# Default values for ${n}.\nreplicaCount: 1\n\nimage:\n  repository: nginx\n  tag: ""\n  pullPolicy: IfNotPresent\n\nservice:\n  type: ClusterIP\n  port: 80\n\nresources: {}\n`);
      writeFile(ctx, `${dir}/templates/deployment.yaml`, `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {{ include "${n}.fullname" . }}\nspec:\n  replicas: {{ .Values.replicaCount }}\n  selector:\n    matchLabels:\n      app: {{ include "${n}.fullname" . }}\n  template:\n    metadata:\n      labels:\n        app: {{ include "${n}.fullname" . }}\n    spec:\n      containers:\n        - name: {{ .Chart.Name }}\n          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"\n          ports:\n            - containerPort: {{ .Values.service.port }}\n`);
      writeFile(ctx, `${dir}/templates/service.yaml`, `apiVersion: v1\nkind: Service\nmetadata:\n  name: {{ include "${n}.fullname" . }}\nspec:\n  type: {{ .Values.service.type }}\n  ports:\n    - port: {{ .Values.service.port }}\n  selector:\n    app: {{ include "${n}.fullname" . }}\n`);
      writeFile(ctx, `${dir}/templates/_helpers.tpl`, `{{- define "${n}.fullname" -}}\n{{- if contains .Chart.Name .Release.Name }}{{ .Release.Name }}{{- else }}{{ printf "%s-%s" .Release.Name .Chart.Name }}{{- end }}\n{{- end }}\n`);
      writeFile(ctx, `${dir}/templates/NOTES.txt`, 'Thank you for installing {{ .Chart.Name }}. Release: {{ .Release.Name }}\n');
      return ok(`Creating ${name}\n`);
    }
    case 'lint': {
      const c = loadChart(ctx, dev, pos[0] ?? '.');
      if (typeof c === 'string') return fail(`==> Linting ${pos[0] ?? '.'}\n[ERROR] ${c}\n\nError: 1 chart(s) linted, 1 chart(s) failed`);
      return ok(`==> Linting ${pos[0] ?? '.'}\n[INFO] Chart.yaml: icon is recommended\n\n1 chart(s) linted, 0 chart(s) failed\n`);
    }
    case 'template':
    case 'install':
    case 'upgrade': {
      const [relName, chartRef] = pos;
      if (!relName || !chartRef) return fail(`Error: "helm ${sub}" requires 2 arguments\n\nUsage:  helm ${sub} [NAME] [CHART] [flags]`);
      const existing = dev.helm.releases.find((r) => r.name === relName && r.ns === ns);
      if (sub === 'upgrade' && !existing && !rest.includes('--install') && !rest.includes('-i')) return fail(`Error: UPGRADE FAILED: "${relName}" has no deployed releases`);
      if (sub === 'install' && existing) return fail(`Error: INSTALLATION FAILED: cannot re-use a name that is still in use\n[Route Runner hint] Use helm upgrade ${relName} ${chartRef} to change an existing release.`);
      const c = loadChart(ctx, dev, chartRef);
      if (typeof c === 'string') return fail(c);
      const vf = valuesFile(ctx, rest);
      if (typeof vf === 'string') return fail(vf);
      const reuse = rest.includes('--reuse-values') && existing ? existing.revisions[existing.revisions.length - 1].values : {};
      const values = { ...c.values, ...reuse, ...vf, ...parseSets(rest) };
      const fullname = fullnameOf(relName, c.name, values);
      if (sub === 'template') {
        return ok(`---\n# Source: ${c.name}/templates/service.yaml\napiVersion: v1\nkind: Service\nmetadata:\n  name: ${fullname}\nspec:\n  type: ${values['service.type'] ?? 'ClusterIP'}\n  ports:\n    - port: ${values['service.port'] ?? 80}\n  selector:\n    app: ${fullname}\n---\n# Source: ${c.name}/templates/deployment.yaml\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${fullname}\nspec:\n  replicas: ${values.replicaCount ?? 1}\n  selector:\n    matchLabels:\n      app: ${fullname}\n  template:\n    metadata:\n      labels:\n        app: ${fullname}\n    spec:\n      containers:\n        - name: ${c.name}\n          image: "${values['image.repository'] ?? 'nginx'}:${values['image.tag'] || c.appVersion}"\n          ports:\n            - containerPort: ${values['service.port'] ?? 80}\n`);
      }
      if (rest.includes('--dry-run')) return ok(`NAME: ${relName}\nSTATUS: pending-install\nREVISION: 1\nTEST SUITE: None\n(dry run - nothing was sent to the cluster)\n`);
      const rel = existing ?? { name: relName, ns, chartName: c.name, chartRef, fullname, revisions: [] };
      if (!existing) dev.helm.releases.push(rel);
      for (const r of rel.revisions) if (r.status === 'deployed') r.status = 'superseded';
      const rev: HelmRevision = { revision: rel.revisions.length + 1, chart: `${c.name}-${c.version}`, appVersion: c.appVersion, values, status: 'deployed', description: existing ? 'Upgrade complete' : 'Install complete', updated: Date.now() };
      rel.revisions.push(rev);
      applyRelease(k, rel, rev);
      ctx.emit(existing ? 'helm:upgrade' : 'helm:install');
      return ok(`${existing ? `Release "${relName}" has been upgraded. Happy Helming!\n` : ''}NAME: ${relName}\nLAST DEPLOYED: ${helmDate(rev.updated)}\nNAMESPACE: ${ns}\nSTATUS: deployed\nREVISION: ${rev.revision}\nTEST SUITE: None\nNOTES:\n1. Get the application URL by running these commands:\n  kubectl get svc ${fullname} -n ${ns}\n  kubectl get pods -l app=${fullname} -n ${ns}\n`);
    }
    case 'list':
    case 'ls': {
      const all = rest.includes('-A') || rest.includes('--all-namespaces');
      const rows = dev.helm.releases.filter((r) => all || r.ns === ns).map((r) => {
        const cur = r.revisions[r.revisions.length - 1];
        return [r.name, r.ns, String(cur.revision), helmDate(cur.updated), 'deployed', cur.chart, cur.appVersion];
      });
      return ok(table([['NAME', 'NAMESPACE', 'REVISION', 'UPDATED', 'STATUS', 'CHART', 'APP VERSION'], ...rows]));
    }
    case 'history':
    case 'status':
    case 'get':
    case 'rollback':
    case 'uninstall':
    case 'delete': {
      const relName = sub === 'get' ? pos[1] : pos[0];
      const rel = dev.helm.releases.find((r) => r.name === relName && r.ns === ns);
      if (!rel) return fail(`Error: release: not found${relName ? '' : ' (give the release name)'}`);
      const cur = rel.revisions[rel.revisions.length - 1];
      if (sub === 'history') return ok(table([['REVISION', 'UPDATED', 'STATUS', 'CHART', 'APP VERSION', 'DESCRIPTION'], ...rel.revisions.map((r) => [String(r.revision), helmDate(r.updated), r.status, r.chart, r.appVersion, r.description])]));
      if (sub === 'status') return ok(`NAME: ${rel.name}\nLAST DEPLOYED: ${helmDate(cur.updated)}\nNAMESPACE: ${rel.ns}\nSTATUS: deployed\nREVISION: ${cur.revision}\n`);
      if (sub === 'get') return ok(`USER-SUPPLIED VALUES:\n${Object.entries(cur.values).map(([kk, vv]) => `${kk}: ${vv}`).join('\n')}\n`);
      if (sub === 'rollback') {
        const target = pos[1] ? Number(pos[1]) : cur.revision - 1;
        const from = rel.revisions.find((r) => r.revision === target);
        if (!from) return fail(`Error: release has no ${target} version`);
        for (const r of rel.revisions) if (r.status === 'deployed') r.status = 'superseded';
        const rev: HelmRevision = { ...from, revision: cur.revision + 1, status: 'deployed', description: `Rollback to ${target}`, updated: Date.now() };
        rel.revisions.push(rev);
        applyRelease(k, rel, rev);
        ctx.emit('helm:rollback');
        return ok('Rollback was a success! Happy Helming!\n');
      }
      k.deployments = k.deployments.filter((d) => !(d.name === rel.fullname && d.ns === rel.ns));
      k.services = k.services.filter((s) => !(s.name === rel.fullname && s.ns === rel.ns));
      k.pods = k.pods.filter((p) => !(p.owner === rel.fullname && p.ns === rel.ns));
      dev.helm.releases = dev.helm.releases.filter((r) => r !== rel);
      ctx.emit('helm:uninstall');
      return ok(`release "${rel.name}" uninstalled\n`);
    }
    default:
      return fail(`Error: unknown command "${sub}" for "helm"\nRun 'helm --help' for usage.`);
  }
};

/* ================================================================== GitHub Actions (act) */

export interface WorkflowStep {
  name: string;
  uses?: string;
  run?: string;
  workdir?: string;
}
export interface WorkflowJob {
  id: string;
  name: string;
  runsOn: string;
  needs: string[];
  steps: WorkflowStep[];
}
export interface Workflow {
  file: string;
  name: string;
  events: string[];
  jobs: WorkflowJob[];
}

const KNOWN_ACTIONS = ['actions/checkout', 'actions/setup-dotnet', 'actions/setup-node', 'actions/setup-java', 'actions/upload-artifact', 'actions/download-artifact', 'actions/cache', 'subosito/flutter-action', 'docker/login-action', 'docker/setup-buildx-action', 'docker/build-push-action', 'docker/metadata-action', 'azure/login', 'azure/webapps-deploy', 'azure/k8s-deploy', 'azure/setup-kubectl', 'azure/setup-helm', 'aws-actions/configure-aws-credentials', 'hashicorp/setup-terraform', 'github/codeql-action/init', 'github/codeql-action/analyze'];

/** Read and validate every workflow in .github/workflows (returns problems as readable errors). */
export function loadWorkflows(ctx: ShellCtx, root: string): { workflows: Workflow[]; errors: string[] } {
  const dir = `${root}/.github/workflows`;
  const node = ctx.vfs.get(dir);
  const errors: string[] = [];
  const workflows: Workflow[] = [];
  if (!node?.children) return { workflows, errors: [`Error: open ${dir}: no such file or directory\n[Route Runner hint] Workflows live in .github/workflows/*.yml at the root of the repo.`] };
  for (const f of Object.keys(node.children).filter((x) => /\.ya?ml$/.test(x))) {
    const path = `${dir}/${f}`;
    let y: Yaml;
    try {
      y = parseYaml(ctx.read(path) ?? '');
    } catch (e) {
      errors.push(`${f}: ${(e as Error).message}`);
      continue;
    }
    const onV = yget(y, 'on') ?? yget(y, 'true');
    const events = onV === undefined ? [] : typeof onV === 'string' ? [onV] : Array.isArray(onV) ? onV.map(String) : typeof onV === 'object' && onV ? Object.keys(onV) : [];
    if (!events.length) errors.push(`${f}: missing "on:" - a workflow must say WHEN it runs (e.g. on: push)`);
    const jobsY = yget(y, 'jobs');
    if (!jobsY || typeof jobsY !== 'object' || Array.isArray(jobsY)) {
      errors.push(`${f}: missing "jobs:" section`);
      continue;
    }
    const jobs: WorkflowJob[] = [];
    for (const [id, j] of Object.entries(jobsY)) {
      const runsOn = yget(j, 'runs-on');
      if (!runsOn) errors.push(`${f}: job "${id}" is missing "runs-on:" (e.g. runs-on: ubuntu-latest)`);
      const stepsY = yget(j, 'steps');
      if (!Array.isArray(stepsY) || !stepsY.length) {
        errors.push(`${f}: job "${id}" has no "steps:" list`);
        continue;
      }
      const needsY = yget(j, 'needs');
      const steps: WorkflowStep[] = stepsY.map((s, i) => {
        const uses = yget(s, 'uses');
        const run = yget(s, 'run');
        const name = yget(s, 'name');
        const wd = yget(s, 'working-directory');
        if (!uses && !run) errors.push(`${f}: job "${id}" step ${i + 1} needs either "uses:" or "run:"`);
        if (uses && !/^[\w.-]+\/[\w./-]+@[\w.-]+$/.test(String(uses))) errors.push(`${f}: step ${i + 1}: "uses: ${uses}" should look like owner/repo@version (e.g. actions/checkout@v4)`);
        return { name: name ? String(name) : uses ? `Run ${uses}` : `Run ${String(run).split('\n')[0]}`, uses: uses ? String(uses) : undefined, run: run !== undefined ? String(run) : undefined, workdir: wd ? String(wd) : undefined };
      });
      jobs.push({ id, name: String(yget(j, 'name') ?? id), runsOn: String(runsOn ?? ''), needs: Array.isArray(needsY) ? needsY.map(String) : needsY ? [String(needsY)] : [], steps });
    }
    workflows.push({ file: f, name: String(yget(y, 'name') ?? f), events, jobs });
  }
  if (!workflows.length && !errors.length) errors.push(`No workflow files (*.yml) found in ${dir}`);
  return { workflows, errors };
}

export function actionKnown(uses: string) {
  return KNOWN_ACTIONS.some((k) => uses.startsWith(k + '@'));
}

export function emptyHelp(): CmdResult {
  return ok();
}
