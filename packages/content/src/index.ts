import type { Chapter, Flashcard, Lesson, Question, Stream, StreamId } from './types.js';
import { NETWORK_CHAPTERS } from './network/index.js';
import { CLOUD_CHAPTERS } from './cloud/index.js';
import { FOREX_CHAPTERS } from './forex/index.js';

export * from './types.js';
export { chapter } from './dsl.js';
export * from './labs/network.js';
export * from './labs/shell.js';
export * from './labs/hardware.js';
export * from './achievements.js';

export const STREAMS: Stream[] = [
  {
    id: 'network',
    title: 'Network Engineer',
    tagline: 'From "what is a cable?" to CCNA-ready network engineer.',
    color: '#3b82f6',
    building: 'Network Academy',
    goal: 'Pass the Cisco CCNA (200-301) with distinction and be able to design, build, secure and troubleshoot real networks.',
    certs: ['Cisco CCNA 200-301 (v2.0 from 3 Feb 2027)', 'CompTIA Network+ (optional)', 'Cisco CyberOps Associate (next step)'],
    chapters: NETWORK_CHAPTERS,
  },
  {
    id: 'cloud',
    title: 'Cloud Engineer',
    tagline: 'Linux, virtualisation, AWS, Docker, Kubernetes, DevOps and HPC.',
    color: '#06b6d4',
    building: 'Cloud Tower',
    goal: 'Be able to build and run secure, automated infrastructure in the cloud and explain every layer of it.',
    certs: ['AWS Certified Cloud Practitioner', 'AWS Solutions Architect Associate', 'KCNA - Kubernetes and Cloud Native Associate (you did LFS250!)', 'CKA - Certified Kubernetes Administrator', 'HashiCorp Terraform Associate'],
    chapters: CLOUD_CHAPTERS,
  },
  {
    id: 'forex',
    title: 'Forex Trader',
    tagline: 'Understand markets, manage risk, trade a plan - on demo first.',
    color: '#22c55e',
    building: 'Trading Floor',
    goal: 'Understand how currency markets work, read charts and news, manage risk like a professional and prove consistency on a demo account before risking real money.',
    certs: ['No license needed to trade your own money - but study FSCA rules', 'Optional: CFA Investment Foundations (free)', 'Journal of 100+ demo trades = your real "certificate"'],
    chapters: FOREX_CHAPTERS,
  },
];

export const ALL_CHAPTERS: Chapter[] = STREAMS.flatMap((s) => s.chapters);
export const ALL_LESSONS: Lesson[] = ALL_CHAPTERS.flatMap((c) => c.lessons);

export function stream(id: StreamId): Stream {
  return STREAMS.find((s) => s.id === id)!;
}
export function chapterById(id: string): Chapter | undefined {
  return ALL_CHAPTERS.find((c) => c.id === id);
}
export function lessonById(id: string): Lesson | undefined {
  return ALL_LESSONS.find((l) => l.id === id);
}

/** Every key term becomes a flashcard automatically (spaced repetition). */
export const FLASHCARDS: Flashcard[] = ALL_LESSONS.flatMap((l) =>
  l.terms.map((t, i) => ({ id: `${l.id}-t${i}`, stream: l.stream, front: t.term, back: t.plain, source: l.title })),
);

/** CCNA v2.0 domains (blueprint published 20 May 2026, exam from 3 Feb 2027). */
export const CCNA_DOMAINS = [
  { code: '1.0', name: 'Network Infrastructure and Connectivity', weight: 25 },
  { code: '2.0', name: 'Switching and Network Access', weight: 25 },
  { code: '3.0', name: 'IP Routing', weight: 20 },
  { code: '4.0', name: 'Network Services and Security', weight: 20 },
  { code: '5.0', name: 'AI, Network Operations, and Management', weight: 10 },
];

export function questionBank(streamId: StreamId): Question[] {
  return stream(streamId).chapters.flatMap((c) => [...c.lessons.flatMap((l) => l.quiz), ...c.boss]);
}

/** Build a mock exam weighted by blueprint domain. */
export function mockExam(count = 60, rnd: () => number = Math.random): Question[] {
  const bank = questionBank('network').filter((q) => q.domain);
  const out: Question[] = [];
  for (const d of CCNA_DOMAINS) {
    const pool = bank.filter((q) => q.domain!.startsWith(d.code)).sort(() => rnd() - 0.5);
    out.push(...pool.slice(0, Math.round((count * d.weight) / 100)));
  }
  return out.sort(() => rnd() - 0.5).slice(0, count);
}

/**
 * The daily quest: one Network lesson every day, plus alternating Cloud / Forex lessons,
 * plus flashcards and drills. ~45-75 minutes. Adapts to what is already completed.
 */
export function dailyQuest(completed: Set<string>, dayNumber: number) {
  const next = (s: StreamId) => stream(s).chapters.flatMap((c) => c.lessons).find((l) => !completed.has(l.id));
  const second: StreamId = dayNumber % 2 === 0 ? 'cloud' : 'forex';
  const items = [next('network'), next(second) ?? next(second === 'cloud' ? 'forex' : 'cloud')].filter(Boolean) as Lesson[];
  return { day: dayNumber, lessons: items, flashcards: 15, drills: dayNumber % 3 === 0 ? 'subnetting' : dayNumber % 3 === 1 ? 'mixed' : 'forex-maths' };
}

export function totals() {
  return STREAMS.map((s) => ({
    stream: s.id,
    chapters: s.chapters.length,
    lessons: s.chapters.reduce((a, c) => a + c.lessons.length, 0),
    questions: questionBank(s.id).length,
    minutes: s.chapters.reduce((a, c) => a + c.lessons.reduce((b, l) => b + l.minutes, 0), 0),
  }));
}
