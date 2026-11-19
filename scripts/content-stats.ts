import { ALL_CHAPTERS, FLASHCARDS, totals } from '../packages/content/src/index.js';

for (const t of totals()) console.log(`${t.stream.padEnd(8)} chapters=${t.chapters} lessons=${t.lessons} questions=${t.questions} hours=${(t.minutes / 60).toFixed(1)}`);
console.log(`flashcards=${FLASHCARDS.length}`);
for (const c of ALL_CHAPTERS) {
  for (const l of c.lessons) {
    const problems: string[] = [];
    if (!l.body) problems.push('no body');
    if (!l.analogy) problems.push('no analogy');
    if (l.quiz.length < 2) problems.push(`only ${l.quiz.length} quiz q`);
    if (!l.terms.length) problems.push('no terms');
    if (problems.length) console.log(`  ! ${l.id}: ${problems.join(', ')}`);
  }
  if (c.boss.length < 4) console.log(`  ! ${c.id}: boss has ${c.boss.length} questions`);
}
