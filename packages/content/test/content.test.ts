import { describe, expect, it } from 'vitest';
import { ALL_CHAPTERS, ALL_LESSONS, CCNA_DOMAINS, FLASHCARDS, NETWORK_LABS, SHELL_LABS, STREAMS, mockExam, questionBank, evaluateRack, RACK_ITEMS } from '../src/index.js';
import { ShellSession, cloneTopology, ping } from '@route-runner/engine';

describe('curriculum integrity', () => {
  it('has all three streams with substantial content', () => {
    expect(STREAMS.map((s) => s.id)).toEqual(['network', 'cloud', 'forex']);
    expect(ALL_LESSONS.length).toBeGreaterThanOrEqual(110);
    for (const s of STREAMS) expect(s.chapters.length).toBeGreaterThanOrEqual(10);
  });

  it('every lesson is complete and every id is unique', () => {
    const ids = new Set<string>();
    for (const l of ALL_LESSONS) {
      expect(ids.has(l.id), `duplicate lesson id ${l.id}`).toBe(false);
      ids.add(l.id);
      expect(l.title.length, l.id).toBeGreaterThan(3);
      expect(l.analogy.length, `${l.id} analogy`).toBeGreaterThan(30);
      expect(l.body.length, `${l.id} body`).toBeGreaterThan(400);
      expect(l.terms.length, `${l.id} terms`).toBeGreaterThanOrEqual(3);
      expect(l.terms.every((t) => t.term && t.plain), `${l.id} term without definition`).toBe(true);
      expect(l.quiz.length, `${l.id} quiz`).toBeGreaterThanOrEqual(3);
      expect(l.minutes).toBeGreaterThan(0);
    }
  });

  it('every question is answerable and explained', () => {
    const all = STREAMS.flatMap((s) => questionBank(s.id));
    expect(all.length).toBeGreaterThan(550);
    const qids = new Set<string>();
    for (const q of all) {
      expect(qids.has(q.id), `duplicate question id ${q.id}`).toBe(false);
      qids.add(q.id);
      expect(q.explanation.length, `${q.id} explanation`).toBeGreaterThan(8);
      if (q.type === 'single') {
        expect(q.correct.length, `${q.id}: single-answer needs exactly one +`).toBe(1);
        expect(q.choices.length, q.id).toBeGreaterThanOrEqual(2);
      }
      if (q.type === 'multi') expect(q.correct.length, q.id).toBeGreaterThanOrEqual(2);
      if (q.type === 'input') expect(q.accept.length, q.id).toBeGreaterThan(0);
    }
  });

  it('every chapter has a boss and every CCNA chapter maps to a v2.0 domain', () => {
    for (const c of ALL_CHAPTERS) expect(c.boss.length, `${c.id} boss`).toBeGreaterThanOrEqual(4);
    const codes = CCNA_DOMAINS.map((d) => d.code);
    const net = STREAMS[0].chapters.filter((c) => c.domain);
    expect(net.length).toBeGreaterThanOrEqual(17);
    for (const c of net) expect(codes, c.id).toContain(c.domain!.split(' ')[0]);
    // every v2.0 domain has questions in the bank
    for (const code of codes) expect(questionBank('network').filter((q) => q.domain?.startsWith(code)).length, code).toBeGreaterThan(10);
  });

  it('builds a full-length, domain-weighted mock exam', () => {
    const exam = mockExam(100, () => 0.5);
    expect(exam.length).toBeGreaterThanOrEqual(95);
    const routing = exam.filter((q) => q.domain?.startsWith('3.0')).length;
    expect(routing).toBeGreaterThanOrEqual(15);
  });

  it('every lab reference points at a real lab', () => {
    const net = new Set(NETWORK_LABS.map((l) => l.id));
    const shell = new Set(SHELL_LABS.map((l) => l.id));
    for (const c of ALL_CHAPTERS)
      for (const ref of [...c.labs, ...c.lessons.flatMap((l) => l.labs)]) {
        if (ref.kind === 'network') expect(net.has(ref.id), `${c.id} -> network:${ref.id}`).toBe(true);
        if (['linux', 'cloud', 'hpc'].includes(ref.kind)) expect(shell.has(ref.id), `${c.id} -> ${ref.kind}:${ref.id}`).toBe(true);
      }
  });

  it('creates hundreds of flashcards from key terms', () => {
    expect(FLASHCARDS.length).toBeGreaterThan(600);
    expect(new Set(FLASHCARDS.map((f) => f.id)).size).toBe(FLASHCARDS.length);
  });
});

describe('labs are solvable and start unsolved', () => {
  it('every network lab builds a valid topology with unmet objectives', () => {
    for (const lab of NETWORK_LABS) {
      const t = lab.build();
      expect(t.devices.length, lab.id).toBeGreaterThan(0);
      for (const l of t.links) {
        expect(t.devices.some((d) => d.id === l.a.device && d.interfaces.some((i) => i.name === l.a.iface)), `${lab.id} ${l.id}`).toBe(true);
        expect(t.devices.some((d) => d.id === l.b.device && d.interfaces.some((i) => i.name === l.b.iface)), `${lab.id} ${l.id}`).toBe(true);
      }
      const done = lab.objectives.filter((o) => o.check(t, []));
      expect(done.length, `${lab.id} should not start fully solved`).toBeLessThan(lab.objectives.length);
    }
  });

  it('troubleshooting ticket #1042 is genuinely broken, and fixable', () => {
    const lab = NETWORK_LABS.find((l) => l.id === 'ticket-1')!;
    const t = lab.build();
    expect(ping(cloneTopology(t), 'PC2', '10.0.0.10').success).toBe(false);
    const s1 = t.devices.find((d) => d.id === 'S1')!;
    s1.interfaces[1].accessVlan = 1;
    t.devices.find((d) => d.id === 'PC2')!.defaultGateway = '192.168.5.1';
    expect(lab.objectives.every((o) => o.check(t, []))).toBe(true);
  });

  it('every shell lab boots its machine', () => {
    for (const lab of SHELL_LABS) {
      const sh = ShellSession.create(lab.machine);
      expect(sh.exec('whoami').output.trim(), lab.id).toBe('phemelo');
    }
  });

  it('the rack rules can all be satisfied', () => {
    const slots = [
      { u: 1, item: 'ups' }, { u: 3, item: 'ups' }, { u: 5, item: 'storage' }, { u: 7, item: 'server2u' },
      ...Array.from({ length: 32 }, (_, k) => ({ u: 9 + k, item: k < 3 ? 'server1u' : 'blank' })),
      { u: 41, item: 'switch' }, { u: 42, item: 'patch' },
    ];
    expect(RACK_ITEMS.length).toBeGreaterThan(5);
    expect(evaluateRack(slots).filter((r) => !r.ok).map((r) => r.rule.id)).toEqual([]);
  });
});
