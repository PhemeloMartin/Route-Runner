/**
 * Game rules that touch the database: XP ledger, levels, streaks, achievements,
 * lesson/boss/lab completion, flashcards and drills.
 */
import { ACHIEVEMENTS, FLASHCARDS, lessonById, chapterById } from '@route-runner/content';
import { XP, levelFromXp, quizXp, rankFor, review, sastDate, streak, type Card, type StreamId } from '@route-runner/engine';
import type { Db } from '../db/database.js';

export interface Reward {
  xp: number;
  achievements: { id: string; title: string; icon: string; xp: number }[];
  levelUp?: { stream: string; from: number; to: number };
}

export class Game {
  constructor(private db: Db) {}

  // ---------------------------------------------------------------- players
  ensurePlayer(): number {
    const row = this.db.get<{ id: number }>('SELECT id FROM players ORDER BY id LIMIT 1');
    if (row) return row.id;
    return this.db.tx(() => {
      const { lastId } = this.db.run("INSERT INTO players (name, avatar_json) VALUES ('Phemelo', ?)", [JSON.stringify({ skin: '#8d5524', shirt: '#2563eb', pants: '#1f2937', hair: '#1a1a1a', shoes: '#f5f5f5' })]);
      this.db.run('INSERT INTO world_state (player_id) VALUES (?)', [lastId]);
      this.db.run("INSERT INTO trading_accounts (player_id, name, currency, start_balance, balance, leverage) VALUES (?, 'Demo USD', 'USD', 10000, 10000, 30)", [lastId]);
      this.db.run("INSERT INTO trading_accounts (player_id, name, currency, start_balance, balance, leverage) VALUES (?, 'Demo ZAR', 'ZAR', 50000, 50000, 30)", [lastId]);
      this.unlock(lastId, 'welcome');
      return lastId;
    });
  }

  profile(pid: number) {
    const p = this.db.get<{ id: number; name: string; avatar_json: string; settings_json: string; created_at: string }>('SELECT * FROM players WHERE id = ?', [pid])!;
    const xp = this.xpByStream(pid);
    const days = this.db.all<{ day: string }>('SELECT day FROM activity_days WHERE player_id = ? ORDER BY day', [pid]).map((r) => r.day);
    const firstDay = p.created_at.slice(0, 10);
    const dayNumber = Math.floor((Date.parse(sastDate()) - Date.parse(firstDay)) / 86400000) + 1;
    const streams = (['network', 'cloud', 'forex', 'dev'] as StreamId[]).map((s) => ({ stream: s, xp: xp[s] ?? 0, ...levelFromXp(xp[s] ?? 0), rank: rankFor(s, xp[s] ?? 0) }));
    const total = Object.values(xp).reduce((a, b) => a + b, 0);
    return {
      id: p.id,
      name: p.name,
      avatar: JSON.parse(p.avatar_json),
      settings: JSON.parse(p.settings_json),
      createdAt: p.created_at,
      dayNumber,
      totalXp: total,
      overall: levelFromXp(total),
      streams,
      streak: streak(days),
      activeToday: days.includes(sastDate()),
    };
  }

  updateProfile(pid: number, patch: { name?: string; avatar?: unknown; settings?: unknown }) {
    if (patch.name !== undefined) this.db.run('UPDATE players SET name = ? WHERE id = ?', [patch.name, pid]);
    if (patch.avatar !== undefined) this.db.run('UPDATE players SET avatar_json = ? WHERE id = ?', [JSON.stringify(patch.avatar), pid]);
    if (patch.settings !== undefined) this.db.run('UPDATE players SET settings_json = ? WHERE id = ?', [JSON.stringify(patch.settings), pid]);
  }

  xpByStream(pid: number): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of this.db.all<{ stream: string; xp: number }>('SELECT stream, xp FROM v_xp_by_stream WHERE player_id = ?', [pid])) out[r.stream] = r.xp;
    return out;
  }

  // ---------------------------------------------------------------- XP ledger
  /** Award XP; returns false if a one-time reward was already claimed. */
  award(pid: number, stream: StreamId | null, amount: number, reason: string, ref: string | null, minutes = 0): boolean {
    const r = this.db.run('INSERT OR IGNORE INTO xp_events (player_id, stream, amount, reason, ref_id) VALUES (?, ?, ?, ?, ?)', [pid, stream, Math.round(amount), reason, ref]);
    if (!r.changes) return false;
    this.db.run(
      `INSERT INTO activity_days (player_id, day, xp, minutes) VALUES (?, ?, ?, ?)
       ON CONFLICT (player_id, day) DO UPDATE SET xp = xp + excluded.xp, minutes = minutes + excluded.minutes`,
      [pid, sastDate(), Math.round(amount), minutes],
    );
    return true;
  }

  unlock(pid: number, id: string): Reward['achievements'][number] | undefined {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return undefined;
    const r = this.db.run('INSERT OR IGNORE INTO achievements (player_id, achievement_id) VALUES (?, ?)', [pid, id]);
    if (!r.changes) return undefined;
    this.award(pid, null, a.xp, 'achievement', id);
    return { id: a.id, title: a.title, icon: a.icon, xp: a.xp };
  }

  private withReward(pid: number, stream: StreamId | null, fn: () => number): Reward {
    return this.db.tx(() => {
      const before = stream ? levelFromXp(this.xpByStream(pid)[stream] ?? 0).level : 0;
      const xp = fn();
      const achievements = this.evaluateAchievements(pid);
      const after = stream ? levelFromXp(this.xpByStream(pid)[stream] ?? 0).level : 0;
      return { xp, achievements, levelUp: stream && after > before ? { stream, from: before, to: after } : undefined };
    });
  }

  /** Check every rule-based achievement. Cheap enough to run after each reward. */
  evaluateAchievements(pid: number): Reward['achievements'] {
    const got: Reward['achievements'] = [];
    const n = (sql: string, p: unknown[] = [pid]) => Number(Object.values(this.db.get(sql, p as never) ?? { c: 0 })[0] ?? 0);
    const lessons = n("SELECT COUNT(*) FROM lesson_progress WHERE player_id = ? AND status = 'completed'");
    const streamsDone = n("SELECT COUNT(DISTINCT stream) FROM lesson_progress WHERE player_id = ? AND status = 'completed'");
    const labs = n('SELECT COUNT(*) FROM lab_states WHERE player_id = ? AND completed_at IS NOT NULL');
    const bosses = n('SELECT COUNT(*) FROM chapter_progress WHERE player_id = ? AND boss_defeated_at IS NOT NULL');
    const perfect = n("SELECT COUNT(*) FROM quiz_attempts WHERE player_id = ? AND scope IN ('lesson','boss') AND correct = total");
    const subnet = n("SELECT COALESCE(SUM(correct),0) FROM quiz_attempts WHERE player_id = ? AND scope = 'drill' AND ref_id LIKE 'subnet%'");
    const cards = n("SELECT COUNT(*) FROM xp_events WHERE player_id = ? AND reason = 'flashcard'");
    const interviews = n('SELECT COUNT(*) FROM interview_answers WHERE player_id = ?');
    const bestExam = Number(this.db.get<{ s: number }>("SELECT MAX(CAST(correct AS REAL) / total) AS s FROM quiz_attempts WHERE player_id = ? AND scope = 'exam'", [pid])?.s ?? 0);
    const trades = n('SELECT COUNT(*) FROM trades t JOIN trading_accounts a ON a.id = t.account_id WHERE a.player_id = ?');
    const disciplined = n("SELECT COUNT(*) FROM trades t JOIN trading_accounts a ON a.id = t.account_id WHERE a.player_id = ? AND t.status = 'closed' AND t.sl IS NOT NULL AND COALESCE(t.risk_percent, 100) <= 2.05");
    const journaled = n("SELECT COUNT(*) FROM trades t JOIN trading_accounts a ON a.id = t.account_id WHERE a.player_id = ? AND t.setup IS NOT NULL AND t.setup <> '' AND t.emotion IS NOT NULL AND t.emotion <> ''");
    const capstone = n("SELECT COUNT(*) FROM lab_states WHERE player_id = ? AND lab_id = 'capstone' AND completed_at IS NOT NULL");
    const devLabs = n("SELECT COUNT(*) FROM lab_states WHERE player_id = ? AND kind = 'dev' AND completed_at IS NOT NULL");
    const tickets = n("SELECT COUNT(*) FROM lab_states WHERE player_id = ? AND lab_id LIKE 'ticket-%' AND completed_at IS NOT NULL");
    const rack = n("SELECT COUNT(*) FROM lab_states WHERE player_id = ? AND kind = 'rack' AND completed_at IS NOT NULL");
    const pc = n("SELECT COUNT(*) FROM lab_states WHERE player_id = ? AND kind = 'pcbuild' AND completed_at IS NOT NULL");
    const days = this.db.all<{ day: string }>('SELECT day FROM activity_days WHERE player_id = ?', [pid]).map((r) => r.day);
    const st = streak(days).current;
    const hour = (new Date().getUTCHours() + 2) % 24;
    const rules: [string, boolean][] = [
      ['first-lesson', lessons >= 1],
      ['ten-lessons', lessons >= 10],
      ['fifty-lessons', lessons >= 50],
      ['all-streams', streamsDone >= 3],
      ['four-streams', streamsDone >= 4],
      ['shipped-it', devLabs >= 5],
      ['perfect-quiz', perfect >= 1],
      ['first-boss', bosses >= 1],
      ['first-lab', labs >= 1],
      ['five-labs', labs >= 5],
      ['capstone', capstone >= 1],
      ['troubleshooter', tickets >= 1],
      ['streak-3', st >= 3],
      ['streak-7', st >= 7],
      ['streak-30', st >= 30],
      ['streak-90', st >= 90],
      ['subnet-25', subnet >= 25],
      ['subnet-100', subnet >= 100],
      ['flashcards-100', cards >= 100],
      ['interview-10', interviews >= 10],
      ['exam-pass', bestExam >= 0.82],
      ['exam-90', bestExam >= 0.9],
      ['first-trade', trades >= 1],
      ['disciplined-10', disciplined >= 10],
      ['journal-20', journaled >= 20],
      ['rack-perfect', rack >= 1],
      ['pc-built', pc >= 1],
      ['night-owl', hour >= 22 && lessons >= 1],
      ['early-bird', hour < 7 && hour >= 4 && lessons >= 1],
    ];
    for (const [id, ok] of rules) {
      if (!ok) continue;
      const a = this.unlock(pid, id);
      if (a) got.push(a);
    }
    return got;
  }

  // ---------------------------------------------------------------- lessons & bosses
  progress(pid: number) {
    return {
      lessons: this.db.all<{ lesson_id: string; status: string; best_score: number; attempts: number; completed_at: string | null }>('SELECT lesson_id, status, best_score, attempts, completed_at FROM lesson_progress WHERE player_id = ?', [pid]),
      chapters: this.db.all<{ chapter_id: string; boss_best: number; boss_defeated_at: string | null }>('SELECT chapter_id, boss_best, boss_defeated_at FROM chapter_progress WHERE player_id = ?', [pid]),
      labs: this.db.all<{ kind: string; lab_id: string; completed_at: string | null; objectives_json: string }>('SELECT kind, lab_id, completed_at, objectives_json FROM lab_states WHERE player_id = ?', [pid]),
      achievements: this.db.all<{ achievement_id: string; unlocked_at: string }>('SELECT achievement_id, unlocked_at FROM achievements WHERE player_id = ?', [pid]),
    };
  }

  startLesson(pid: number, lessonId: string) {
    const l = lessonById(lessonId);
    if (!l) throw new HttpError(404, 'Unknown lesson');
    this.db.run(
      `INSERT INTO lesson_progress (player_id, lesson_id, stream, chapter_id, status) VALUES (?, ?, ?, ?, 'started')
       ON CONFLICT (player_id, lesson_id) DO NOTHING`,
      [pid, lessonId, l.stream, l.chapterId],
    );
    this.db.run("UPDATE world_state SET last_lesson_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE player_id = ?", [lessonId, pid]);
  }

  completeLesson(pid: number, lessonId: string, correct: number, total: number, durationS: number, detail: unknown): Reward {
    const l = lessonById(lessonId);
    if (!l) throw new HttpError(404, 'Unknown lesson');
    if (correct < 0 || total <= 0 || correct > total) throw new HttpError(400, 'Invalid score');
    return this.withReward(pid, l.stream, () => {
      const score = correct / total;
      this.db.run(
        `INSERT INTO lesson_progress (player_id, lesson_id, stream, chapter_id, status, best_score, attempts, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, CASE WHEN ? >= 0.6 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') END)
         ON CONFLICT (player_id, lesson_id) DO UPDATE SET
           attempts = attempts + 1,
           best_score = MAX(best_score, excluded.best_score),
           status = CASE WHEN excluded.status = 'completed' OR status = 'completed' THEN 'completed' ELSE status END,
           completed_at = COALESCE(completed_at, excluded.completed_at)`,
        [pid, lessonId, l.stream, l.chapterId, score >= 0.6 ? 'completed' : 'started', score, score],
      );
      this.db.run("INSERT INTO quiz_attempts (player_id, scope, ref_id, correct, total, duration_s, detail_json) VALUES (?, 'lesson', ?, ?, ?, ?, ?)", [pid, lessonId, correct, total, durationS, JSON.stringify(detail ?? [])]);
      let xp = 0;
      if (score >= 0.6 && this.award(pid, l.stream, XP.lessonComplete, 'lesson', lessonId, l.minutes)) {
        xp += XP.lessonComplete;
        const q = quizXp(correct, total);
        this.award(pid, l.stream, q, 'quiz', lessonId);
        xp += q;
      }
      // seed spaced-repetition cards for this lesson's key terms
      for (const c of FLASHCARDS.filter((f) => f.id.startsWith(`${lessonId}-t`)))
        this.db.run('INSERT OR IGNORE INTO flashcard_state (player_id, card_id, due_date) VALUES (?, ?, ?)', [pid, c.id, sastDate()]);
      return xp;
    });
  }

  bossAttempt(pid: number, chapterId: string, correct: number, total: number, durationS: number): Reward & { defeated: boolean } {
    const ch = chapterById(chapterId);
    if (!ch) throw new HttpError(404, 'Unknown chapter');
    let defeated = false;
    const reward = this.withReward(pid, ch.stream, () => {
      const score = correct / total;
      defeated = score >= 0.7;
      this.db.run("INSERT INTO quiz_attempts (player_id, scope, ref_id, correct, total, duration_s) VALUES (?, 'boss', ?, ?, ?, ?)", [pid, chapterId, correct, total, durationS]);
      this.db.run(
        `INSERT INTO chapter_progress (player_id, chapter_id, stream, boss_best, boss_defeated_at)
         VALUES (?, ?, ?, ?, CASE WHEN ? THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') END)
         ON CONFLICT (player_id, chapter_id) DO UPDATE SET boss_best = MAX(boss_best, excluded.boss_best), boss_defeated_at = COALESCE(boss_defeated_at, excluded.boss_defeated_at)`,
        [pid, chapterId, ch.stream, score, defeated ? 1 : 0],
      );
      return defeated && this.award(pid, ch.stream, XP.bossDefeated, 'boss', chapterId) ? XP.bossDefeated : 0;
    });
    return { ...reward, defeated };
  }

  examAttempt(pid: number, correct: number, total: number, durationS: number, detail: unknown): Reward {
    return this.withReward(pid, 'network', () => {
      this.db.run("INSERT INTO quiz_attempts (player_id, scope, ref_id, correct, total, duration_s, detail_json) VALUES (?, 'exam', 'ccna-mock', ?, ?, ?, ?)", [pid, correct, total, durationS, JSON.stringify(detail ?? [])]);
      const xp = correct / total >= 0.82 ? XP.examPass : correct * 3;
      this.award(pid, 'network', xp, 'exam', null, Math.round(durationS / 60));
      return xp;
    });
  }

  examHistory(pid: number) {
    return this.db.all("SELECT correct, total, duration_s, detail_json, created_at FROM quiz_attempts WHERE player_id = ? AND scope = 'exam' ORDER BY created_at DESC LIMIT 20", [pid]);
  }

  drillResult(pid: number, kind: string, correct: number, total: number): Reward {
    const stream: StreamId = kind.startsWith('pip') || kind.startsWith('position') ? 'forex' : 'network';
    return this.withReward(pid, stream, () => {
      if (total <= 0) return 0;
      this.db.run("INSERT INTO quiz_attempts (player_id, scope, ref_id, correct, total) VALUES (?, 'drill', ?, ?, ?)", [pid, kind, correct, total]);
      const xp = correct * XP.drillCorrect;
      if (xp > 0) this.award(pid, stream, xp, 'drill', kind);
      return xp;
    });
  }

  // ---------------------------------------------------------------- flashcards (SM-2)
  dueCards(pid: number, limit = 30) {
    const today = sastDate();
    const rows = this.db.all<{ card_id: string; ease: number; interval_days: number; reps: number; lapses: number; due_date: string }>(
      'SELECT card_id, ease, interval_days, reps, lapses, due_date FROM flashcard_state WHERE player_id = ? AND due_date <= ? ORDER BY due_date, reps LIMIT ?',
      [pid, today, limit],
    );
    const total = Number(this.db.get<{ c: number }>('SELECT COUNT(*) AS c FROM flashcard_state WHERE player_id = ?', [pid])?.c ?? 0);
    return { total, due: rows.map((r) => ({ ...FLASHCARDS.find((f) => f.id === r.card_id), state: r })).filter((c) => c.front) };
  }

  reviewCard(pid: number, cardId: string, grade: 0 | 1 | 2 | 3 | 4 | 5): Reward {
    const card = FLASHCARDS.find((f) => f.id === cardId);
    if (!card) throw new HttpError(404, 'Unknown card');
    return this.withReward(pid, card.stream, () => {
      const row = this.db.get<{ ease: number; interval_days: number; reps: number; lapses: number; due_date: string }>('SELECT * FROM flashcard_state WHERE player_id = ? AND card_id = ?', [pid, cardId]);
      const cur: Card = row ? { ease: row.ease, interval: row.interval_days, reps: row.reps, lapses: row.lapses, due: row.due_date } : { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: sastDate() };
      const next = review(cur, grade);
      this.db.run(
        `INSERT INTO flashcard_state (player_id, card_id, ease, interval_days, reps, lapses, due_date, last_review_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         ON CONFLICT (player_id, card_id) DO UPDATE SET ease = excluded.ease, interval_days = excluded.interval_days, reps = excluded.reps, lapses = excluded.lapses, due_date = excluded.due_date, last_review_at = excluded.last_review_at`,
        [pid, cardId, next.ease, next.interval, next.reps, next.lapses, next.due],
      );
      this.award(pid, card.stream, XP.flashcardReview, 'flashcard', cardId);
      return XP.flashcardReview;
    });
  }

  // ---------------------------------------------------------------- labs
  getLab(pid: number, kind: string, labId: string) {
    const r = this.db.get<{ state_json: string; objectives_json: string; completed_at: string | null; updated_at: string }>('SELECT state_json, objectives_json, completed_at, updated_at FROM lab_states WHERE player_id = ? AND kind = ? AND lab_id = ?', [pid, kind, labId]);
    return r ? { state: JSON.parse(r.state_json), objectives: JSON.parse(r.objectives_json), completedAt: r.completed_at, updatedAt: r.updated_at } : null;
  }

  saveLab(pid: number, kind: string, labId: string, state: unknown, objectives: string[]) {
    this.db.run(
      `INSERT INTO lab_states (player_id, kind, lab_id, state_json, objectives_json) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (player_id, kind, lab_id) DO UPDATE SET state_json = excluded.state_json, objectives_json = excluded.objectives_json, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      [pid, kind, labId, JSON.stringify(state), JSON.stringify(objectives)],
    );
  }

  resetLab(pid: number, kind: string, labId: string) {
    this.db.run('DELETE FROM lab_states WHERE player_id = ? AND kind = ? AND lab_id = ? AND completed_at IS NULL', [pid, kind, labId]);
    this.db.run("UPDATE lab_states SET state_json = '{}', objectives_json = '[]' WHERE player_id = ? AND kind = ? AND lab_id = ?", [pid, kind, labId]);
  }

  completeLab(pid: number, kind: string, labId: string, minutes: number): Reward {
    const stream: StreamId = ['network', 'rack', 'pcbuild', 'cable'].includes(kind) ? 'network' : kind === 'dev' ? 'dev' : 'cloud';
    return this.withReward(pid, stream, () => {
      this.db.run(
        `INSERT INTO lab_states (player_id, kind, lab_id, state_json, completed_at) VALUES (?, ?, ?, '{}', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         ON CONFLICT (player_id, kind, lab_id) DO UPDATE SET completed_at = COALESCE(completed_at, excluded.completed_at)`,
        [pid, kind, labId],
      );
      const bonus = labId === 'capstone' ? 3 : labId.startsWith('ticket') ? 1.5 : 1;
      return this.award(pid, stream, XP.labComplete * bonus, 'lab', `${kind}:${labId}`, minutes) ? XP.labComplete * bonus : 0;
    });
  }

  // ---------------------------------------------------------------- interview practice & notes
  saveInterview(pid: number, lessonId: string, answer: string, selfScore?: number): Reward {
    const l = lessonById(lessonId);
    return this.withReward(pid, l?.stream ?? null, () => {
      this.db.run('INSERT INTO interview_answers (player_id, lesson_id, answer, self_score) VALUES (?, ?, ?, ?)', [pid, lessonId, answer.slice(0, 4000), selfScore ?? null]);
      return this.award(pid, l?.stream ?? null, 10, 'interview', `${lessonId}:${Date.now()}`) ? 10 : 0;
    });
  }

  interviews(pid: number) {
    return this.db.all('SELECT lesson_id, answer, self_score, created_at FROM interview_answers WHERE player_id = ? ORDER BY created_at DESC LIMIT 100', [pid]);
  }

  // ---------------------------------------------------------------- world save
  world(pid: number) {
    return this.db.get('SELECT x, y, z, heading, last_zone, last_lesson_id, last_panel, updated_at FROM world_state WHERE player_id = ?', [pid]);
  }

  saveWorld(pid: number, w: { x: number; y: number; z: number; heading: number; lastZone?: string | null; lastPanel?: string | null }) {
    this.db.run(
      "UPDATE world_state SET x = ?, y = ?, z = ?, heading = ?, last_zone = COALESCE(?, last_zone), last_panel = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE player_id = ?",
      [w.x, w.y, w.z, w.heading, w.lastZone ?? null, w.lastPanel ?? null, pid],
    );
  }

  heatmap(pid: number) {
    return this.db.all<{ day: string; xp: number; minutes: number }>('SELECT day, xp, minutes FROM activity_days WHERE player_id = ? ORDER BY day', [pid]);
  }

  recentXp(pid: number) {
    return this.db.all('SELECT stream, amount, reason, ref_id, created_at FROM xp_events WHERE player_id = ? ORDER BY id DESC LIMIT 30', [pid]);
  }

  // ---------------------------------------------------------------- backup / restore
  exportSave(pid: number) {
    const tables = ['players', 'lesson_progress', 'chapter_progress', 'quiz_attempts', 'xp_events', 'activity_days', 'flashcard_state', 'lab_states', 'achievements', 'world_state', 'interview_answers', 'notes', 'trading_accounts'];
    const data: Record<string, unknown[]> = {};
    for (const t of tables) data[t] = this.db.all(`SELECT * FROM ${t} WHERE ${t === 'players' ? 'id' : 'player_id'} = ?`, [pid]);
    data.trades = this.db.all('SELECT t.* FROM trades t JOIN trading_accounts a ON a.id = t.account_id WHERE a.player_id = ?', [pid]);
    return { format: 'route-runner-save', version: 1, exportedAt: new Date().toISOString(), data };
  }

  importSave(save: { format: string; version: number; data: Record<string, Record<string, unknown>[]> }) {
    if (save.format !== 'route-runner-save' || save.version !== 1) throw new HttpError(400, 'Not a Route Runner save file');
    const order = ['players', 'world_state', 'lesson_progress', 'chapter_progress', 'quiz_attempts', 'xp_events', 'activity_days', 'flashcard_state', 'lab_states', 'achievements', 'interview_answers', 'notes', 'trading_accounts', 'trades'];
    this.db.tx(() => {
      this.db.run('DELETE FROM players');
      for (const t of order) {
        for (const row of save.data[t] ?? []) {
          const cols = Object.keys(row).filter((c) => /^[a-z_]+$/.test(c));
          this.db.run(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => row[c] as never));
        }
      }
    });
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
