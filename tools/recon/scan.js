// Temporary recon helper: print ASCII context around literal matches in a binary bundle.
import { readFileSync } from 'node:fs';

const [file, ...pats] = process.argv.slice(2);
const text = readFileSync(file).toString('latin1');
const maxHits = Number(process.env.MAX_HITS || 3);

for (const p of pats) {
  let i = 0;
  let n = 0;
  console.log(`\n########## pattern: ${p} ##########`);
  while ((i = text.indexOf(p, i)) !== -1 && n < maxHits) {
    const ctx = text
      .slice(Math.max(0, i - 180), i + 260)
      .replace(/[^\x20-\x7E\r\n]+/g, ' ')
      .replace(/\s{3,}/g, ' | ');
    console.log(`--- hit ${n + 1} @ ${i} ---\n${ctx}\n`);
    i += p.length;
    n += 1;
  }
  if (n === 0) console.log('(no match)');
}
