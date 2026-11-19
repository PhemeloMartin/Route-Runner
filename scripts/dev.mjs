// npm run dev - runs the API (tsx watch) and the Vite dev server together.
import { spawn } from 'node:child_process';

const procs = [
  spawn('npm', ['run', 'dev', '-w', '@route-runner/server'], { stdio: 'inherit', shell: true, env: { ...process.env, MARKET_REFRESH: 'off' } }),
  spawn('npm', ['run', 'dev', '-w', '@route-runner/client'], { stdio: 'inherit', shell: true }),
];
const stop = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
