#!/usr/bin/env node
/**
 * Route Runner command-line launcher.
 *
 *   route-runner play      start the game server and open it in your browser (default)
 *   route-runner status    print your progress in the terminal
 *   route-runner backup    copy your save database to the current folder
 *   route-runner where     show where your save file lives
 *   route-runner help
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = path.join(root, 'apps', 'server', 'dist', 'index.js');
const clientIndex = path.join(root, 'apps', 'client', 'dist', 'index.html');
const PORT = Number(process.env.PORT ?? 7420);
const URL = `http://localhost:${PORT}`;

const c = { cyan: (s) => `\x1b[36m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m` };

function dataDir() {
  if (process.env.ROUTE_RUNNER_DATA) return process.env.ROUTE_RUNNER_DATA;
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'RouteRunner');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'RouteRunner');
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'), 'route-runner');
}

function banner() {
  console.log(c.cyan(String.raw`
  ____             _         ____
 |  _ \ ___  _   _| |_ ___  |  _ \ _   _ _ __  _ __   ___ _ __
 | |_) / _ \| | | | __/ _ \ | |_) | | | | '_ \| '_ \ / _ \ '__|
 |  _ < (_) | |_| | ||  __/ |  _ <| |_| | | | | | | |  __/ |
 |_| \_\___/ \__,_|\__\___| |_| \_\\__,_|_| |_|_| |_|\___|_|
`));
  console.log(c.dim('  Network Engineer · Cloud Engineer · Forex Trader - a 3D learning game\n'));
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true, shell: false }).unref();
  } catch {
    console.log(`Open ${url} in your browser.`);
  }
}

async function isRunning() {
  try {
    const r = await fetch(`${URL}/healthz`, { signal: AbortSignal.timeout(800) });
    return r.ok;
  } catch {
    return false;
  }
}

async function play() {
  banner();
  if (!fs.existsSync(serverEntry) || !fs.existsSync(clientIndex)) {
    console.log(c.yellow('The game has not been built yet. Run this once (needs internet):'));
    console.log(`   ${c.bold('npm install')}\n   ${c.bold('npm run build')}\n`);
    console.log(`or simply double-click ${c.bold('setup.cmd')}.`);
    process.exit(1);
  }
  if (await isRunning()) {
    console.log(c.green(`Route Runner is already running → opening ${URL}`));
    openBrowser(URL);
    return;
  }
  console.log(`Starting the game server on ${c.bold(URL)} ...`);
  console.log(c.dim(`Save file: ${path.join(dataDir(), 'route-runner.db')} (daily backups in the "backups" folder)`));
  const child = spawn(process.execPath, [serverEntry], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: String(PORT), LOG_LEVEL: process.env.LOG_LEVEL ?? 'warn' } });
  child.stdout.on('data', (d) => process.stdout.write(c.dim(d.toString())));
  child.stderr.on('data', (d) => process.stderr.write(d));
  for (let i = 0; i < 60; i++) {
    if (await isRunning()) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!(await isRunning())) {
    console.error('The server did not start. See the messages above.');
    process.exit(1);
  }
  console.log(c.green(`\n✔ Ready! Opening ${URL}`));
  console.log(c.dim('Keep this window open while you play. Press Ctrl+C to save and quit.\n'));
  openBrowser(URL);
  const stop = () => {
    console.log('\nSaving your progress and shutting down... Sharp, see you tomorrow! 🔥');
    child.kill('SIGTERM');
    setTimeout(() => process.exit(0), 1500);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', (code) => process.exit(code ?? 0));
}

async function status() {
  banner();
  let p;
  try {
    p = await (await fetch(`${URL}/api/profile`)).json();
  } catch {
    console.log(c.yellow('The game server is not running. Start it with: route-runner play'));
    return;
  }
  const bar = (v, color) => color('█'.repeat(Math.round(v * 20)).padEnd(20, '░'));
  console.log(`${c.bold(p.name)}  ·  Level ${p.overall.level}  ·  ${p.totalXp} XP  ·  Day ${p.dayNumber}  ·  🔥 ${p.streak.current}-day streak (best ${p.streak.longest})\n`);
  for (const s of p.streams) console.log(`  ${s.stream.padEnd(8)} Lv ${String(s.level).padStart(2)}  ${bar(s.progress, s.stream === 'forex' ? c.green : c.cyan)}  ${s.rank.title}`);
  const q = await (await fetch(`${URL}/api/daily`)).json();
  console.log(`\n${c.bold("Today's quest:")}`);
  for (const l of q.lessons) console.log(`  • [${l.stream}] ${l.title} (${l.minutes} min)`);
  console.log(`  • ${q.flashcards} flashcards · drills: ${q.drills}\n`);
  console.log(p.activeToday ? c.green('Streak safe for today ✔') : c.yellow('Learn something today to keep your streak!'));
}

function backup() {
  const src = path.join(dataDir(), 'route-runner.db');
  if (!fs.existsSync(src)) return console.log('No save file yet - play first!');
  const dst = path.resolve(`route-runner-backup-${new Date().toISOString().slice(0, 10)}.db`);
  fs.copyFileSync(src, dst);
  console.log(c.green(`Backed up to ${dst}`));
}

const cmd = process.argv[2] ?? 'play';
switch (cmd) {
  case 'play':
  case 'start':
    await play();
    break;
  case 'status':
    await status();
    break;
  case 'backup':
    backup();
    break;
  case 'where':
    console.log(path.join(dataDir(), 'route-runner.db'));
    break;
  default:
    banner();
    console.log('Usage: route-runner [play | status | backup | where | help]');
}
