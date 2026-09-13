/* Every case is a file on disk, fed through the same function the Worker
   calls. The two marked "browser cannot catch" are the reason this moved to
   the server at all: raw-byte scanning in the page sees neither. */
import { readFileSync, readdirSync } from 'node:fs';
import { inspect } from '../src/inspect.js';

const DIR = new URL('./files/', import.meta.url);

const CASES = [
  ['exe.pdf',              'reject', 'Windows executable named .pdf'],
  ['elf.docx',             'reject', 'Linux binary named .docx'],
  ['script.txt',           'reject', 'shell script named .txt'],
  ['macro.docx',           'reject', 'macro-carrying document'],
  ['openaction.pdf',       'reject', 'PDF with auto-run JavaScript'],
  ['embed.rtf',            'reject', 'RTF with embedded object'],
  ['fake.pdf',             'reject', 'plain text named .pdf'],
  ['compressed-js.pdf',    'reject', 'JavaScript inside a COMPRESSED PDF stream  <- browser cannot catch'],
  ['remote-template.docx', 'reject', 'document that fetches a template on open   <- browser cannot catch'],
  ['good.pdf',             'accept', 'ordinary PDF'],
  ['good.docx',            'accept', 'ordinary Word document'],
  ['good.txt',             'accept', 'ordinary text file'],
  ['good.rtf',             'accept', 'ordinary RTF'],
];

const onDisk = readdirSync(DIR).sort();
const covered = CASES.map((c) => c[0]).sort();
if (JSON.stringify(onDisk) !== JSON.stringify(covered)) {
  console.error('XX test files and cases disagree:', { onDisk, covered });
  process.exit(1);
}

let pass = 0, fail = 0;
for (const [file, expect, what] of CASES) {
  const bytes = new Uint8Array(readFileSync(new URL(file, DIR)));
  const problem = await inspect(file, bytes);
  const ok = expect === 'reject' ? problem !== null : problem === null;
  ok ? pass++ : fail++;
  const detail = problem ? `"${problem.slice(0, 62)}"` : 'accepted';
  console.log(`  ${ok ? 'ok' : 'XX'}  ${file.padEnd(21)} ${expect.padEnd(7)} ${what.padEnd(56)} ${detail}`);
}
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
