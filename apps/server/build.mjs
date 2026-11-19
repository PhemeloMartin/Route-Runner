// Bundles the server + engine + content into one ESM file. sql.js stays external (it loads its .wasm at runtime).
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  external: ['sql.js', 'fastify', '@fastify/static', 'zod'],
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
