import { writeFileSync } from 'node:fs';
import { buildEmail } from '../src/email.js';

const fields = {
  'First Name': 'Ada', 'Last Name': 'Lovelace',
  Email: 'ada@example.com', Phone: '918 555 0134',
  Country: 'United States', 'State / Region': 'Oklahoma', City: 'Tulsa',
  'Additional Comments': 'Available from October.\nHappy to travel.',
};
const files = [
  { field: 'Resume', filename: 'Ada Lovelace CV.pdf', bytes: new Uint8Array(184320) },
  { field: 'Cover Letter', filename: 'cover.pdf', bytes: new Uint8Array(41000) },
];
const { subject, html, text } = buildEmail(fields, files);
writeFileSync(new URL('./email-preview.html', import.meta.url), html);

const checks = [
  ['subject carries the name', subject === 'Careers application — Ada Lovelace'],
  ['no advertising or sponsor', !/sponsor|advertis/i.test(html)],
  ['no tracking pixel', !/<img/i.test(html)],
  ['location is joined', html.includes('Tulsa, Oklahoma, United States')],
  ['comments kept with line breaks', html.includes('white-space:pre-wrap')],
  ['both attachments listed', html.includes('Ada Lovelace CV.pdf') && html.includes('cover.pdf')],
  /* The checks decide whether this email exists at all, so reporting their
     verdict inside it was noise. Nothing about scanning belongs in the text. */
  ['no scan commentary anywhere', !/inspected|known malware|not checked|FLAGGED/i.test(html + text)],
  ['attachment size still shown', html.includes('180 KB') || html.includes('181 KB')],
  ['plain-text alternative', text.includes('Ada Lovelace') && text.includes('918 555 0134')],
];
// Injection: a name containing markup must not become markup.
const nasty = buildEmail({ ...fields, 'First Name': '<script>x</script>' }, []);
checks.push(['html in a field is escaped', !nasty.html.includes('<script>x</script>')]);

let fail = 0;
for (const [what, ok] of checks) { if (!ok) fail++; console.log(`  ${ok ? 'ok' : 'XX'}  ${what}`); }
console.log(`\n  subject: "${subject}"`);
console.log(`  ${checks.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
