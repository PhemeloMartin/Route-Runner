/**
 * Schema migrations (forward-only, applied in order, recorded in schema_migrations).
 *
 * Design notes
 * - Multi-player ready: every row hangs off players(id) with ON DELETE CASCADE, even though the
 *   offline game creates a single "Phemelo" player.
 * - XP is an append-only LEDGER (xp_events). Totals are derived (view v_xp_by_stream), so XP can
 *   always be audited and never drifts out of sync.
 * - Course content lives in code (versioned in git); the DB stores only learner state that
 *   references content by stable text ids (lesson_id, chapter_id, card_id, lab_id).
 * - CHECK constraints guard enumerations; indexes match the dashboard queries.
 * - market_candles is a WITHOUT ROWID table keyed by (symbol, timeframe, ts) for compact storage.
 */
export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: 'initial schema',
    sql: `
CREATE TABLE players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  avatar_json   TEXT    NOT NULL DEFAULT '{}',
  settings_json TEXT    NOT NULL DEFAULT '{}',
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at  TEXT
);

CREATE TABLE lesson_progress (
  player_id     INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  lesson_id     TEXT    NOT NULL,
  stream        TEXT    NOT NULL CHECK (stream IN ('network','cloud','forex')),
  chapter_id    TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('started','completed')),
  best_score    REAL    NOT NULL DEFAULT 0 CHECK (best_score BETWEEN 0 AND 1),
  attempts      INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  started_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at  TEXT,
  PRIMARY KEY (player_id, lesson_id)
);
CREATE INDEX ix_lesson_progress_stream ON lesson_progress (player_id, stream, status);

CREATE TABLE chapter_progress (
  player_id        INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  chapter_id       TEXT    NOT NULL,
  stream           TEXT    NOT NULL CHECK (stream IN ('network','cloud','forex')),
  boss_best        REAL    NOT NULL DEFAULT 0 CHECK (boss_best BETWEEN 0 AND 1),
  boss_defeated_at TEXT,
  PRIMARY KEY (player_id, chapter_id)
);

CREATE TABLE quiz_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  scope       TEXT    NOT NULL CHECK (scope IN ('lesson','boss','exam','drill')),
  ref_id      TEXT    NOT NULL,
  correct     INTEGER NOT NULL CHECK (correct >= 0),
  total       INTEGER NOT NULL CHECK (total > 0 AND correct <= total),
  duration_s  INTEGER NOT NULL DEFAULT 0,
  detail_json TEXT    NOT NULL DEFAULT '[]',
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_quiz_attempts_player ON quiz_attempts (player_id, scope, created_at);

CREATE TABLE xp_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stream      TEXT    CHECK (stream IS NULL OR stream IN ('network','cloud','forex')),
  amount      INTEGER NOT NULL CHECK (amount BETWEEN -10000 AND 10000),
  reason      TEXT    NOT NULL,
  ref_id      TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_xp_events_player ON xp_events (player_id, created_at);
-- one-time rewards (lesson completion, lab completion, boss defeat) can never be claimed twice
CREATE UNIQUE INDEX ux_xp_once ON xp_events (player_id, reason, ref_id) WHERE reason IN ('lesson','lab','boss','achievement');

CREATE VIEW v_xp_by_stream AS
  SELECT player_id, COALESCE(stream, 'general') AS stream, SUM(amount) AS xp
  FROM xp_events GROUP BY player_id, COALESCE(stream, 'general');

CREATE TABLE activity_days (
  player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  day        TEXT    NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  xp         INTEGER NOT NULL DEFAULT 0,
  minutes    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, day)
) WITHOUT ROWID;

CREATE TABLE flashcard_state (
  player_id      INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  card_id        TEXT    NOT NULL,
  ease           REAL    NOT NULL DEFAULT 2.5 CHECK (ease >= 1.3),
  interval_days  INTEGER NOT NULL DEFAULT 0 CHECK (interval_days >= 0),
  reps           INTEGER NOT NULL DEFAULT 0,
  lapses         INTEGER NOT NULL DEFAULT 0,
  due_date       TEXT    NOT NULL,
  last_review_at TEXT,
  PRIMARY KEY (player_id, card_id)
) WITHOUT ROWID;
CREATE INDEX ix_flashcards_due ON flashcard_state (player_id, due_date);

CREATE TABLE lab_states (
  player_id       INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind            TEXT    NOT NULL CHECK (kind IN ('network','linux','vm','cloud','hpc','rack','pcbuild','cable','k8s3d')),
  lab_id          TEXT    NOT NULL,
  state_json      TEXT    NOT NULL,
  objectives_json TEXT    NOT NULL DEFAULT '[]',
  completed_at    TEXT,
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (player_id, kind, lab_id)
);

CREATE TABLE achievements (
  player_id      INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  achievement_id TEXT    NOT NULL,
  unlocked_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (player_id, achievement_id)
) WITHOUT ROWID;

CREATE TABLE world_state (
  player_id      INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  x              REAL    NOT NULL DEFAULT 0,
  y              REAL    NOT NULL DEFAULT 0,
  z              REAL    NOT NULL DEFAULT 8,
  heading        REAL    NOT NULL DEFAULT 0,
  last_zone      TEXT,
  last_lesson_id TEXT,
  last_panel     TEXT,
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE interview_answers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  lesson_id   TEXT    NOT NULL,
  answer      TEXT    NOT NULL,
  self_score  INTEGER CHECK (self_score IS NULL OR self_score BETWEEN 1 AND 5),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_interview_player ON interview_answers (player_id, lesson_id);

CREATE TABLE notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  lesson_id   TEXT,
  body        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE trading_accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id     INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  currency      TEXT    NOT NULL CHECK (length(currency) = 3),
  start_balance REAL    NOT NULL CHECK (start_balance > 0),
  balance       REAL    NOT NULL,
  leverage      INTEGER NOT NULL CHECK (leverage BETWEEN 1 AND 1000),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (player_id, name)
);

CREATE TABLE trades (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    INTEGER NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
  symbol        TEXT    NOT NULL,
  side          TEXT    NOT NULL CHECK (side IN ('buy','sell')),
  lots          REAL    NOT NULL CHECK (lots > 0),
  entry         REAL    NOT NULL CHECK (entry > 0),
  sl            REAL,
  tp            REAL,
  exit_price    REAL,
  pnl           REAL,
  status        TEXT    NOT NULL CHECK (status IN ('open','closed')),
  close_reason  TEXT    CHECK (close_reason IS NULL OR close_reason IN ('tp','sl','manual','stopout')),
  risk_percent  REAL,
  mode          TEXT    NOT NULL DEFAULT 'replay' CHECK (mode IN ('replay','live')),
  setup         TEXT,
  emotion       TEXT,
  notes         TEXT,
  opened_at     TEXT    NOT NULL,
  closed_at     TEXT,
  CHECK ((status = 'closed') = (exit_price IS NOT NULL))
);
CREATE INDEX ix_trades_account ON trades (account_id, status, opened_at);

CREATE TABLE market_candles (
  symbol    TEXT    NOT NULL,
  timeframe TEXT    NOT NULL CHECK (timeframe IN ('D','W')),
  ts        INTEGER NOT NULL,
  open      REAL    NOT NULL,
  high      REAL    NOT NULL,
  low       REAL    NOT NULL,
  close     REAL    NOT NULL,
  source    TEXT    NOT NULL,
  PRIMARY KEY (symbol, timeframe, ts),
  CHECK (high >= low)
) WITHOUT ROWID;

CREATE TABLE market_meta (
  symbol        TEXT PRIMARY KEY,
  last_fetch_at TEXT,
  last_ts       INTEGER,
  source        TEXT,
  last_error    TEXT
);

CREATE TRIGGER trg_players_updated AFTER UPDATE ON players
BEGIN
  UPDATE players SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id AND updated_at = OLD.updated_at;
END;
`,
  },
];
