// Temporary recon helper: dump one or more entries from an asar archive to stdout.
import { readFileSync } from 'node:fs';

const [file, ...entries] = process.argv.slice(2);
const fd = readFileSync(file);
const headerSize = fd.readUInt32LE(12);
const header = JSON.parse(fd.subarray(16, 16 + headerSize).toString('utf8'));
const base = 16 + headerSize;

const lookup = (p) => {
  let node = header;
  for (const part of p.split('/')) {
    if (!node.files?.[part]) return null;
    node = node.files[part];
  }
  return node.files ? null : node;
};

for (const e of entries) {
  const meta = lookup(e);
  console.log(`\n########## ${e} ##########`);
  if (!meta) { console.log('(not found)'); continue; }
  const start = base + Number(meta.offset);
  console.log(fd.subarray(start, start + meta.size).toString('utf8'));
}
