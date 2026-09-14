/* Every case is a file on disk, fed through the same function the Worker
   calls. The two marked "browser cannot catch" are the reason this moved to
   the server at all: raw-byte scanning in the page sees neither. */
import { readFileSync, readdirSync } from 'node:fs';
import { inspect, inflateRaw } from '../src/inspect.js';

const DIR = new URL('./files/', import.meta.url);

const CASES = [
  ['exe.pdf',              'reject', 'Windows executable named .pdf'],
  ['elf.docx',             'reject', 'Linux binary named .docx'],
  ['script.txt',           'reject', 'shell script named .txt'],
  ['macro.docx',           'reject', 'macro-carrying document'],
  ['openaction.pdf',       'reject', 'PDF with auto-run JavaScript'],
  ['embed.rtf',            'reject', 'RTF with embedded object'],
  ['fake.pdf',             'reject', 'plain text named .pdf'],
  ['compressed-js.pdf',    'reject', 'JavaScript inside a compressed PDF stream (deep scan on)'],
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

/* The decoder stopping early must not cost us what it already produced.
   This is the whole of a real defect: the PDF scan handed the decoder a
   chunk running past the compressed data, the decoder errored on the
   trailing bytes after decoding the content in full, and the output was
   discarded -- so the check found nothing in Chromium while passing here,
   because Node does not error on that input. A truncated stream errors in
   every runtime, which is what makes it testable from here. */
{
  const { deflateRawSync } = await import('node:zlib');
  const original = 'PDF content /JavaScript hidden inside, '.repeat(40);
  const whole = deflateRawSync(Buffer.from(original));
  const cut = whole.subarray(0, Math.floor(whole.length * 0.7));

  const out = await inflateRaw(new Uint8Array(cut), 1 << 20);
  const text = out ? new TextDecoder('latin1').decode(out) : '';
  const kept = out !== null && text.length > 0 && original.startsWith(text.slice(0, 20));
  kept ? pass++ : fail++;
  console.log(`  ${kept ? 'ok' : 'XX'}  ${'(truncated stream)'.padEnd(21)} ${'keep'.padEnd(7)} `
    + `${'a decoder that stops early still yields what it decoded'.padEnd(56)} `
    + `${out ? out.length + ' bytes kept' : 'nothing kept'}`);

  const none = await inflateRaw(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 1 << 20);
  const nulled = none === null;
  nulled ? pass++ : fail++;
  console.log(`  ${nulled ? 'ok' : 'XX'}  ${'(not deflate at all)'.padEnd(21)} ${'null'.padEnd(7)} `
    + `${'nothing decoded reports nothing, not an empty result'.padEnd(56)} `
    + `${nulled ? 'null' : 'returned data'}`);
}

for (const [file, expect, what] of CASES) {
  const bytes = new Uint8Array(readFileSync(new URL(file, DIR)));
  const problem = await inspect(file, bytes, true);   // deep scan exercised here
  const ok = expect === 'reject' ? problem !== null : problem === null;
  ok ? pass++ : fail++;
  const detail = problem ? `"${problem.slice(0, 62)}"` : 'accepted';
  console.log(`  ${ok ? 'ok' : 'XX'}  ${file.padEnd(21)} ${expect.padEnd(7)} ${what.padEnd(56)} ${detail}`);
}
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
