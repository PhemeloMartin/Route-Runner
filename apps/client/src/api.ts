/** Typed client for the local Route Runner server. */

export interface StreamStat {
  stream: 'network' | 'cloud' | 'forex' | 'dev';
  xp: number;
  level: number;
  current: number;
  next: number;
  progress: number;
  rank: { title: string; plain: string; index: number; next?: { title: string; minXp: number } };
}

export interface Profile {
  id: number;
  name: string;
  avatar: Record<string, string>;
  settings: Settings;
  createdAt: string;
  dayNumber: number;
  totalXp: number;
  overall: { level: number; current: number; next: number; progress: number };
  streams: StreamStat[];
  streak: { current: number; longest: number };
  activeToday: boolean;
}

export interface Settings {
  hints?: boolean;
  freeRoam?: boolean;
  voice?: string;
  quality?: 'auto' | 'low' | 'medium' | 'high' | 'ultra';
  sound?: boolean;
}

export interface Reward {
  xp: number;
  achievements: { id: string; title: string; icon: string; xp: number }[];
  levelUp?: { stream: string; from: number; to: number };
  defeated?: boolean;
}

export interface Progress {
  lessons: { lesson_id: string; status: string; best_score: number; attempts: number; completed_at: string | null }[];
  chapters: { chapter_id: string; boss_best: number; boss_defeated_at: string | null }[];
  labs: { kind: string; lab_id: string; completed_at: string | null; objectives_json: string }[];
  achievements: { achievement_id: string; unlocked_at: string }[];
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  profile: () => req<Profile>('GET', '/api/profile'),
  updateProfile: (p: { name?: string; avatar?: Record<string, string>; settings?: Settings }) => req<Profile>('PUT', '/api/profile', p),
  progress: () => req<Progress>('GET', '/api/progress'),
  dashboard: () => req<{ heatmap: { day: string; xp: number; minutes: number }[]; recent: { stream: string; amount: number; reason: string; ref_id: string; created_at: string }[]; totals: { stream: string; chapters: number; lessons: number; questions: number; minutes: number }[]; exams: { correct: number; total: number; created_at: string }[] }>('GET', '/api/dashboard'),
  daily: () => req<{ day: number; lessons: { id: string; title: string; stream: string; minutes: number }[]; flashcards: number; drills: string }>('GET', '/api/daily'),
  world: () => req<{ x: number; y: number; z: number; heading: number; last_zone: string | null; last_lesson_id: string | null; last_panel: string | null } | undefined>('GET', '/api/world'),
  saveWorld: (w: { x: number; y: number; z: number; heading: number; lastZone?: string | null; lastPanel?: string | null }) => req('PUT', '/api/world', w),
  startLesson: (id: string) => req('POST', `/api/lessons/${id}/start`),
  completeLesson: (id: string, s: { correct: number; total: number; durationS: number; detail?: unknown }) => req<Reward>('POST', `/api/lessons/${id}/complete`, s),
  boss: (chapterId: string, s: { correct: number; total: number; durationS: number }) => req<Reward>('POST', `/api/chapters/${chapterId}/boss`, s),
  newExam: (count: number) => req<import('@route-runner/content').Question[]>('GET', `/api/exam/new?count=${count}`),
  examResult: (s: { correct: number; total: number; durationS: number; detail?: unknown }) => req<Reward>('POST', '/api/exam/result', s),
  drills: (kind: string, correct: number, total: number) => req<Reward>('POST', '/api/drills', { kind, correct, total }),
  dueCards: () => req<{ total: number; due: { id: string; stream: string; front: string; back: string; source: string }[] }>('GET', '/api/flashcards/due'),
  reviewCard: (id: string, grade: number) => req<Reward>('POST', `/api/flashcards/${id}/review`, { grade }),
  interview: (lessonId: string, answer: string, selfScore?: number) => req<Reward>('POST', '/api/interview', { lessonId, answer, selfScore }),
  interviews: () => req<{ lesson_id: string; answer: string; self_score: number | null; created_at: string }[]>('GET', '/api/interview'),
  getLab: <S>(kind: string, id: string) => req<{ state: S | null; objectives?: string[]; completedAt?: string | null }>('GET', `/api/labs/${kind}/${id}`),
  saveLab: (kind: string, id: string, state: unknown, objectives: string[]) => req('PUT', `/api/labs/${kind}/${id}`, { state, objectives }),
  resetLab: (kind: string, id: string) => req('DELETE', `/api/labs/${kind}/${id}`),
  completeLab: (kind: string, id: string, minutes: number) => req<Reward>('POST', `/api/labs/${kind}/${id}/complete`, { minutes }),
  marketSymbols: () => req<{ symbols: string[]; latest: Record<string, { close: number; time: number; change: number }>; status: { symbol: string; last_fetch_at: string; source: string; last_error: string | null }[] }>('GET', '/api/market/symbols'),
  candles: (symbol: string, tf: 'D' | 'W', limit = 600) => req<{ symbol: string; tf: string; candles: import('@route-runner/engine').Candle[]; source: string }>('GET', `/api/market/${symbol}?tf=${tf}&limit=${limit}`),
  refreshMarket: () => req<{ ok: boolean; added: number; error?: string }>('POST', '/api/market/refresh'),
  accounts: () => req<{ id: number; name: string; currency: string; start_balance: number; balance: number; leverage: number }[]>('GET', '/api/trading/accounts'),
  resetAccount: (id: number) => req('POST', `/api/trading/accounts/${id}/reset`),
  trades: (accountId: number) => req<TradeRow[]>('GET', `/api/trading/accounts/${accountId}/trades`),
  openTrade: (t: { accountId: number; symbol: string; side: 'buy' | 'sell'; lots: number; entry: number; sl?: number | null; tp?: number | null; riskPercent?: number | null; mode: 'replay' | 'live'; setup?: string; emotion?: string; notes?: string; openedAt: string }) => req<{ trade: TradeRow; xp: number; achievements: Reward['achievements'] }>('POST', '/api/trading/trades', t),
  closeTrade: (id: number, exit: number, pnl: number, reason: string, closedAt: string) => req<{ trade: TradeRow; achievements: Reward['achievements'] }>('POST', `/api/trading/trades/${id}/close`, { exit, pnl, reason, closedAt }),
  journal: (id: number, j: { setup?: string; emotion?: string; notes?: string }) => req<{ ok: boolean; xp: number; achievements: Reward['achievements'] }>('PUT', `/api/trading/trades/${id}/journal`, j),
  exportSave: () => req<unknown>('GET', '/api/save/export'),
  importSave: (save: unknown) => req('POST', '/api/save/import', save),
};

export interface TradeRow {
  id: number;
  account_id: number;
  symbol: string;
  side: 'buy' | 'sell';
  lots: number;
  entry: number;
  sl: number | null;
  tp: number | null;
  exit_price: number | null;
  pnl: number | null;
  status: 'open' | 'closed';
  close_reason: string | null;
  risk_percent: number | null;
  mode: 'replay' | 'live';
  setup: string | null;
  emotion: string | null;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
}
