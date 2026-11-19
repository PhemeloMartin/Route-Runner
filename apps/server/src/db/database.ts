/**
 * Thin data-access layer over SQLite (compiled to WebAssembly via sql.js, so it runs on any
 * machine with zero native build tools - important for a learner's Windows laptop and for slim
 * container images).
 *
 * Durability: the in-memory database is flushed to disk after every write (debounced) using an
 * atomic write-to-temp-then-rename, plus a rolling daily backup on startup.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import { MIGRATIONS } from './migrations.js';

export type Row = Record<string, SqlValue>;
export type Params = SqlValue[] | Record<string, SqlValue>;

export interface DbOptions {
  file: string | null; // null = in-memory (tests)
  flushDelayMs?: number;
  backups?: number;
}

export class Db {
  private dirty = false;
  private timer: NodeJS.Timeout | null = null;
  private inTx = 0;

  private constructor(
    private db: Database,
    private opts: DbOptions,
  ) {}

  static async open(opts: DbOptions): Promise<Db> {
    const require = createRequire(import.meta.url);
    const wasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));
    const SQL = await initSqlJs({ locateFile: (f: string) => path.join(wasmDir, f) });
    let data: Uint8Array | undefined;
    if (opts.file && fs.existsSync(opts.file)) {
      data = fs.readFileSync(opts.file);
      backup(opts.file, opts.backups ?? 7);
    }
    const db = new Db(new SQL.Database(data), opts);
    db.pragmas();
    db.migrate();
    return db;
  }

  private pragmas() {
    this.db.run('PRAGMA foreign_keys = ON;');
  }

  private migrate() {
    this.db.run('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
    const applied = new Set(this.all<{ id: number }>('SELECT id FROM schema_migrations').map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (applied.has(m.id)) continue;
      this.tx(() => {
        this.db.exec(m.sql);
        this.run('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)', [m.id, m.name, new Date().toISOString()]);
      });
    }
  }

  all<T = Row>(sql: string, params: Params = []): T[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params as never);
      const out: T[] = [];
      while (stmt.step()) out.push(stmt.getAsObject() as T);
      return out;
    } finally {
      stmt.free();
    }
  }

  get<T = Row>(sql: string, params: Params = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  run(sql: string, params: Params = []): { changes: number; lastId: number } {
    this.db.run(sql, params as never);
    const changes = this.db.getRowsModified();
    const lastId = Number(this.db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] ?? 0);
    this.markDirty();
    return { changes, lastId };
  }

  /** Run fn atomically. Nested calls join the outer transaction. */
  tx<T>(fn: () => T): T {
    if (this.inTx > 0) {
      this.inTx++;
      try {
        return fn();
      } finally {
        this.inTx--;
      }
    }
    this.db.run('BEGIN IMMEDIATE');
    this.inTx = 1;
    try {
      const r = fn();
      this.db.run('COMMIT');
      return r;
    } catch (e) {
      this.db.run('ROLLBACK');
      throw e;
    } finally {
      this.inTx = 0;
      this.markDirty();
    }
  }

  private markDirty() {
    if (!this.opts.file || this.inTx > 0) return;
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.opts.flushDelayMs ?? 250);
  }

  /** Atomically write the database to disk. */
  flush() {
    if (!this.opts.file || !this.dirty) return;
    const data = this.db.export();
    this.pragmas(); // export() resets connection pragmas in sql.js
    const tmp = `${this.opts.file}.tmp`;
    fs.mkdirSync(path.dirname(this.opts.file), { recursive: true });
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, this.opts.file);
    this.dirty = false;
  }

  close() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.flush();
    this.db.close();
  }

  sizeBytes(): number {
    return this.db.export().length;
  }
}

function backup(file: string, keep: number) {
  try {
    const dir = path.join(path.dirname(file), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const target = path.join(dir, `${path.basename(file, '.db')}-${day}.db`);
    if (!fs.existsSync(target)) fs.copyFileSync(file, target);
    const all = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort();
    for (const old of all.slice(0, Math.max(0, all.length - keep))) fs.unlinkSync(path.join(dir, old));
  } catch {
    // a failed backup must never stop the game from starting
  }
}
