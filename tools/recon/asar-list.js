// Temporary recon helper: parse an asar header and list entry paths matching a filter.
import { readFileSync } from 'node:fs';

const [file, filter = '.'] = process.argv.slice(2);
const fd = readFileSync(file);
const headerSize = fd.readUInt32LE(12);
const header = JSON.parse(fd.subarray(16, 16 + headerSize).toString('utf8'));
const re = new RegExp(filter, 'i');

const out = [];
const walk = (node, prefix) => {
  for (const [name, value] of Object.entries(node.files || {})) {
    const p = prefix ? `${prefix}/${name}` : name;
    if (value.files) walk(value, p);
    else if (re.test(p)) out.push(`${String(value.size).padStart(10)}  ${p}`);
  }
};
walk(header, '');
console.log(out.length ? out.join('\n') : '(no matching entries)');
console.log(`\ntotal matches: ${out.length}`);
