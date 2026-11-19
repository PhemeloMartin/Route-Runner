/**
 * Game progression: XP, levels, ranks, streaks and spaced repetition.
 */

export type StreamId = 'network' | 'cloud' | 'forex';

/** XP needed to REACH a level: grows gently so early levels come fast and later ones feel earned. */
export function xpForLevel(level: number): number {
  return Math.round(120 * (level - 1) ** 1.55);
}

export function levelFromXp(xp: number): { level: number; current: number; next: number; progress: number } {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const current = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, current, next, progress: (xp - current) / (next - current) };
}

export const RANKS: Record<StreamId, { minXp: number; title: string; plain: string }[]> = {
  network: [
    { minXp: 0, title: 'Cable Rookie', plain: 'You know a cable from a cookie.' },
    { minXp: 600, title: 'Help Desk Hero', plain: 'You can fix "the internet is down" for a friend.' },
    { minXp: 1800, title: 'Network Technician', plain: 'You can cable, address and configure a small office.' },
    { minXp: 4000, title: 'Junior Network Engineer', plain: 'VLANs, routing and DHCP do what you tell them.' },
    { minXp: 7500, title: 'Network Engineer', plain: 'CCNA-level: you design, secure and troubleshoot.' },
    { minXp: 12000, title: 'Senior Network Engineer', plain: 'You automate, document and mentor.' },
    { minXp: 18000, title: 'Network Architect', plain: 'You see the whole city, not just the streets.' },
  ],
  cloud: [
    { minXp: 0, title: 'Cloud Curious', plain: 'You know the cloud is "someone else\'s computer".' },
    { minXp: 500, title: 'Linux Operator', plain: 'The terminal is your home.' },
    { minXp: 1500, title: 'Container Captain', plain: 'You ship apps in boxes with Docker.' },
    { minXp: 3200, title: 'Cloud Practitioner', plain: 'You can explain IaaS/PaaS/SaaS, regions and pricing.' },
    { minXp: 6000, title: 'Cloud Engineer', plain: 'VPCs, IAM, Kubernetes and Terraform are your tools.' },
    { minXp: 10000, title: 'DevOps Engineer', plain: 'Everything is code, tested and deployed automatically.' },
    { minXp: 15000, title: 'Cloud Architect', plain: 'Secure, resilient, cost-aware designs.' },
  ],
  forex: [
    { minXp: 0, title: 'Market Watcher', plain: 'You know what a currency pair is.' },
    { minXp: 500, title: 'Pip Counter', plain: 'Pips, lots and spreads make sense.' },
    { minXp: 1400, title: 'Chart Reader', plain: 'Candles, trends and levels tell you a story.' },
    { minXp: 3000, title: 'Risk Manager', plain: 'You size every trade and always use a stop.' },
    { minXp: 5500, title: 'Swing Trader', plain: 'You follow a written plan across days and weeks.' },
    { minXp: 9000, title: 'Disciplined Trader', plain: 'Your journal proves consistency on demo.' },
    { minXp: 14000, title: 'Evaluation-Ready Trader', plain: 'Ready to consider a funded-account challenge - still demo first!' },
  ],
};

export function rankFor(stream: StreamId, xp: number) {
  const list = RANKS[stream];
  let idx = 0;
  for (let i = 0; i < list.length; i++) if (xp >= list[i].minXp) idx = i;
  return { ...list[idx], index: idx, next: list[idx + 1] };
}

/** Local calendar date in South Africa, "2026-11-19". */
export function sastDate(d: Date = new Date()): string {
  return new Date(d.getTime() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

export function streak(activeDates: string[], today = sastDate()): { current: number; longest: number } {
  const set = new Set(activeDates);
  const dayMs = 86400000;
  const toDate = (s: string) => Date.parse(s + 'T00:00:00Z');
  let current = 0;
  let cursor = toDate(today);
  if (!set.has(today)) cursor -= dayMs; // today not done yet: streak still alive from yesterday
  while (set.has(new Date(cursor).toISOString().slice(0, 10))) {
    current++;
    cursor -= dayMs;
  }
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev = -Infinity;
  for (const s of sorted) {
    const t = toDate(s);
    run = t - prev === dayMs ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = t;
  }
  return { current, longest };
}

// ------------------------------------------------------------ SM-2 spaced repetition

export interface Card {
  ease: number;
  interval: number; // days
  reps: number;
  due: string; // yyyy-mm-dd
  lapses: number;
}

export function newCard(today = sastDate()): Card {
  return { ease: 2.5, interval: 0, reps: 0, due: today, lapses: 0 };
}

/** grade: 0 = forgot completely ... 5 = perfect instant recall. */
export function review(card: Card, grade: 0 | 1 | 2 | 3 | 4 | 5, today = sastDate()): Card {
  let { ease, interval, reps, lapses } = card;
  if (grade < 3) {
    reps = 0;
    interval = 1;
    lapses++;
  } else {
    reps++;
    interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(interval * ease);
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
  const due = new Date(Date.parse(today + 'T00:00:00Z') + interval * 86400000).toISOString().slice(0, 10);
  return { ease: Math.round(ease * 100) / 100, interval, reps, due, lapses };
}

// ------------------------------------------------------------ XP rewards

export const XP = {
  lessonComplete: 50,
  quizPerfect: 40,
  quizPass: 20,
  labComplete: 120,
  bossDefeated: 250,
  flashcardReview: 2,
  drillCorrect: 5,
  dailyQuest: 60,
  streakBonusPerDay: 5,
  examPass: 400,
  journaledTrade: 15,
};

export function quizXp(correct: number, total: number): number {
  if (!total) return 0;
  const pct = correct / total;
  return pct === 1 ? XP.quizPerfect + XP.quizPass : pct >= 0.7 ? XP.quizPass + Math.round(correct * 3) : Math.round(correct * 2);
}
