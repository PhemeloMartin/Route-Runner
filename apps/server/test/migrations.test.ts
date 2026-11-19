import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../src/db/migrations.js';
import { Db } from '../src/db/database.js';

/** A save file from before the App & DevOps stream existed must upgrade without losing anything. */
describe('schema migration 2 (App & DevOps stream)', () => {
  it('keeps existing progress and then accepts the new stream and lab kind', async () => {
    const require = createRequire(import.meta.url);
    const wasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));
    const SQL = await initSqlJs({ locateFile: (f: string) => path.join(wasmDir, f) });
    const db = new SQL.Database();
    db.run('PRAGMA foreign_keys = ON;');
    db.exec(MIGRATIONS[0].sql);
    db.exec(`
      INSERT INTO players (id, name) VALUES (1, 'Phemelo');
      INSERT INTO lesson_progress (player_id, lesson_id, stream, chapter_id, status, best_score, attempts) VALUES (1, 'n01-1', 'network', 'n01', 'completed', 0.9, 2);
      INSERT INTO chapter_progress (player_id, chapter_id, stream, boss_best) VALUES (1, 'n01', 'network', 0.8);
      INSERT INTO xp_events (player_id, stream, amount, reason, ref_id) VALUES (1, 'network', 50, 'lesson', 'n01-1'), (1, NULL, 20, 'achievement', 'welcome');
      INSERT INTO lab_states (player_id, kind, lab_id, state_json, completed_at) VALUES (1, 'linux', 'first-steps', '{}', '2026-11-19T10:00:00Z');
    `);
    // the old schema rejects the new stream
    expect(() => db.run("INSERT INTO xp_events (player_id, stream, amount, reason) VALUES (1, 'dev', 5, 'test')")).toThrow(/CHECK/);

    db.exec('BEGIN;' + MIGRATIONS[1].sql + 'COMMIT;');

    const one = (sql: string) => db.exec(sql)[0]?.values ?? [];
    expect(one("SELECT lesson_id, best_score, attempts FROM lesson_progress")).toEqual([['n01-1', 0.9, 2]]);
    expect(one("SELECT chapter_id, boss_best FROM chapter_progress")).toEqual([['n01', 0.8]]);
    expect(one("SELECT stream, xp FROM v_xp_by_stream ORDER BY stream")).toEqual([['general', 20], ['network', 50]]);
    expect(one("SELECT kind, lab_id FROM lab_states")).toEqual([['linux', 'first-steps']]);
    // one-time rewards are still protected after the rebuild
    expect(() => db.run("INSERT INTO xp_events (player_id, stream, amount, reason, ref_id) VALUES (1, 'network', 50, 'lesson', 'n01-1')")).toThrow(/UNIQUE/);
    // and the new stream / lab kind are accepted
    db.run("INSERT INTO xp_events (player_id, stream, amount, reason, ref_id) VALUES (1, 'dev', 40, 'lab', 'dev:aspnet-api')");
    db.run("INSERT INTO lab_states (player_id, kind, lab_id, state_json) VALUES (1, 'dev', 'aspnet-api', '{}')");
    expect(one("SELECT xp FROM v_xp_by_stream WHERE stream = 'dev'")).toEqual([[40]]);
    expect(one('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('a fresh database applies every migration in order', async () => {
    const db = await Db.open({ file: null });
    const ids = db.all<{ id: number }>('SELECT id FROM schema_migrations ORDER BY id').map((r) => r.id);
    expect(ids).toEqual(MIGRATIONS.map((m) => m.id));
  });
});
