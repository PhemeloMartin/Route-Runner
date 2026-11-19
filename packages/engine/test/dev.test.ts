import { describe, expect, it } from 'vitest';
import { ShellSession } from '../src/shell/shell.js';

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const run = (sh: ShellSession, ...lines: string[]) => lines.map((l) => strip(sh.exec(l).output)).join('');
const dev = () => ShellSession.create({ profile: 'dev' });

describe('ASP.NET Core (dotnet) simulator', () => {
  it('creates, runs and calls a Web API, then serves a new endpoint after an edit', () => {
    const sh = dev();
    expect(run(sh, 'dotnet --version')).toBe('10.0.100\n');
    expect(run(sh, 'dotnet new webapi -n TodoApi')).toMatch(/ASP.NET Core Web API" was created successfully/);
    expect(run(sh, 'ls TodoApi')).toMatch(/Program\.cs/);
    expect(run(sh, 'dotnet run')).toMatch(/MSB1003/); // not inside the project folder yet
    run(sh, 'cd TodoApi');
    expect(run(sh, 'dotnet run')).toMatch(/Now listening on: http:\/\/localhost:5080/);
    const weather = JSON.parse(run(sh, 'curl localhost:5080/weatherforecast'));
    expect(weather).toHaveLength(5);
    expect(weather[0]).toHaveProperty('temperatureF');
    expect(run(sh, 'curl -i localhost:5080/nope')).toMatch(/HTTP\/1.1 404 Not Found/);
    // add an endpoint by editing Program.cs, then restart
    sh.saveFromEditor('/home/phemelo/TodoApi/Program.cs', sh.vfs.read('/home/phemelo/TodoApi/Program.cs')!.replace('app.Run();', 'app.MapGet("/hello/{name}", (string name) => $"Sawubona {name}, from Phemelo\'s API");\n\napp.Run();'));
    run(sh, 'dotnet run');
    expect(run(sh, 'curl localhost:5080/hello/Thabo')).toBe("Sawubona Thabo, from Phemelo's API\n");
  });

  it('reports compile errors with file, line and column', () => {
    const sh = dev();
    run(sh, 'dotnet new webapi -n Broken', 'cd Broken');
    sh.saveFromEditor('/home/phemelo/Broken/Program.cs', 'var app = WebApplication.Create(args);\napp.MapGet("/", () => "hi";\napp.Run();\n');
    const out = run(sh, 'dotnet build');
    expect(out).toMatch(/Program\.cs\(2,\d+\): error CS1513/);
    expect(out).toMatch(/Build failed/);
  });

  it('walks the EF Core workflow with realistic failures first', () => {
    const sh = dev();
    run(sh, 'cd ~/labs/ef-core/TodoApi');
    expect(run(sh, 'dotnet build')).toMatch(/error CS0234: .*EntityFrameworkCore/);
    expect(run(sh, 'dotnet ef migrations add InitialCreate')).toMatch(/dotnet tool install --global dotnet-ef/);
    run(sh, 'dotnet tool install --global dotnet-ef');
    expect(run(sh, 'dotnet ef migrations add InitialCreate')).toMatch(/doesn't reference Microsoft\.EntityFrameworkCore\.Design/);
    expect(run(sh, 'dotnet add package Microsoft.EntityFrameworkCore.Sqlite')).toMatch(/added to file/);
    run(sh, 'dotnet add package Microsoft.EntityFrameworkCore.Design');
    expect(run(sh, 'dotnet add package Not.A.Real.Package')).toMatch(/NU1101/);
    expect(run(sh, 'dotnet ef migrations add InitialCreate')).toMatch(/Done\. To undo this action/);
    expect(run(sh, 'ls Migrations')).toMatch(/_InitialCreate\.cs/);
    expect(run(sh, 'cat Migrations/*_InitialCreate.cs')).toMatch(/CreateTable\(\s+name: "Todos"/);
    expect(run(sh, 'dotnet ef database update')).toMatch(/Applying migration '\d+_InitialCreate'/);
    expect(run(sh, 'ls')).toMatch(/app\.db/);
    run(sh, 'dotnet run');
    expect(run(sh, `curl -X POST localhost:5080/todos -H "Content-Type: application/json" -d '{"title":"Buy airtime"}'`)).toMatch(/"id": 1/);
    expect(run(sh, `curl -i -X POST localhost:5080/todos -d '{}'`)).toMatch(/400 Bad Request[\s\S]*Title field is required/);
    expect(JSON.parse(run(sh, 'curl localhost:5080/todos'))).toEqual([{ id: 1, title: 'Buy airtime', isComplete: false }]);
    run(sh, `curl -X PUT localhost:5080/todos/1 -d '{"title":"Buy airtime","isComplete":true}'`);
    expect(JSON.parse(run(sh, 'curl localhost:5080/todos/1')).isComplete).toBe(true);
    run(sh, 'curl -X DELETE localhost:5080/todos/1');
    expect(run(sh, 'curl localhost:5080/todos')).toBe('[]\n');
  });
});

describe('Flutter simulator', () => {
  it('validates names, creates, adds packages, tests, runs and builds', () => {
    const sh = dev();
    expect(run(sh, 'flutter create KasiMarket')).toMatch(/is not a valid Dart package name[\s\S]*flutter create kasi_market/);
    expect(run(sh, 'flutter create kasi_market')).toMatch(/All done!/);
    run(sh, 'cd kasi_market');
    expect(run(sh, 'flutter pub add http')).toMatch(/\+ http/);
    expect(run(sh, 'cat pubspec.yaml')).toMatch(/^ {2}http: \^/m);
    expect(run(sh, 'flutter test')).toMatch(/All tests passed!/);
    sh.saveFromEditor('/home/phemelo/kasi_market/lib/main.dart', sh.vfs.read('/home/phemelo/kasi_market/lib/main.dart')!.replace("title: 'Flutter Demo Home Page'", "title: 'Kasi Market'"));
    const runOut = run(sh, 'flutter run -d chrome');
    expect(runOut).toMatch(/Kasi Market/);
    expect(runOut).toMatch(/Hot reload/);
    expect(run(sh, 'flutter build apk')).toMatch(/app-release\.apk/);
    // break the code -> analyzer and run fail
    sh.saveFromEditor('/home/phemelo/kasi_market/lib/main.dart', "import 'package:flutter/material.dart';\nvoid main() {\n  runApp(const MyApp();\n}\n");
    expect(run(sh, 'flutter analyze')).toMatch(/issue/);
  });
});

describe('GitHub Actions (act) and Helm on the simulated cluster', () => {
  it('runs a workflow: steps really execute, a failing test turns the pipeline red', () => {
    const sh = dev();
    run(sh, 'cd ~/labs/pipeline');
    expect(run(sh, 'act -l')).toMatch(/build[\s\S]*docker/);
    expect(run(sh, 'act')).toMatch(/Pipeline green/);
    const wf = sh.vfs.read('/home/phemelo/labs/pipeline/.github/workflows/ci.yml')!;
    sh.saveFromEditor('/home/phemelo/labs/pipeline/.github/workflows/ci.yml', wf.replace('      # TODO (your mission): add a step named "Test" that runs: dotnet test\n', '      - name: Test\n        run: dotnet test\n'));
    const green = run(sh, 'act');
    expect(green).toMatch(/Test summary: total: 4, failed: 0/);
    expect(green).toMatch(/Pipeline green/);
    const tests = sh.vfs.read('/home/phemelo/labs/pipeline/TodoApi.Tests/PriceCalculatorTests.cs')!;
    sh.saveFromEditor('/home/phemelo/labs/pipeline/TodoApi.Tests/PriceCalculatorTests.cs', tests.replace('[Fact]\n    public void Adds_15_percent_VAT()\n    {', '[Fact]\n    public void Adds_15_percent_VAT()\n    {\n        Assert.Equal(115, 114);'));
    const red = run(sh, 'act');
    expect(red).toMatch(/Failure - Main Test/);
    expect(red).toMatch(/Skipped \(needs: build/);
    expect(red).toMatch(/Pipeline red/);
  });

  it('installs, scales, breaks and rolls back a release', () => {
    const sh = dev();
    run(sh, 'cd ~/labs/helm');
    expect(run(sh, 'helm install web bitnami/nginx')).toMatch(/repo bitnami not found[\s\S]*helm repo add bitnami/);
    expect(run(sh, 'helm install todo ./charts/todo-api')).toMatch(/STATUS: deployed[\s\S]*REVISION: 1/);
    expect(run(sh, 'kubectl get pods')).toMatch(/todo-todo-api-.*Running/);
    run(sh, 'helm upgrade todo ./charts/todo-api --set replicaCount=4');
    expect(run(sh, 'kubectl get pods').match(/todo-todo-api.*Running/g)).toHaveLength(4);
    run(sh, 'helm upgrade todo ./charts/todo-api --reuse-values --set image.tag=9.9');
    expect(run(sh, 'kubectl get pods')).toMatch(/ImagePullBackOff/);
    expect(run(sh, 'helm history todo')).toMatch(/3\s.*deployed/);
    expect(run(sh, 'helm rollback todo 2')).toMatch(/Rollback was a success/);
    const pods = run(sh, 'kubectl get pods');
    expect(pods).not.toMatch(/ImagePullBackOff/);
    expect(pods.match(/Running/g)).toHaveLength(4);
    expect(run(sh, 'helm uninstall todo')).toMatch(/uninstalled/);
  });
});
