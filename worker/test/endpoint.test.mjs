/* The whole request path, with the network stubbed: a real multipart POST
   goes in, and what would have gone to Resend is captured and inspected.
   This runs the worker's own module unmodified -- Node provides the same
   FormData, DecompressionStream, crypto.subtle and btoa that Workers do. */
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';

const DIR = new URL('./files/', import.meta.url);
const read = (n) => readFileSync(new URL(n, DIR));

const ENV = {
  RESEND_API_KEY: 'test-key',
  VIRUSTOTAL_API_KEY: '',
  MAIL_TO: 'jgarrison@philipdavidcapital.com',
  MAIL_FROM: 'Careers <careers@philipdavidcapital.com>',
  ALLOWED_ORIGINS: 'https://philipdavidcapital.com',
};

let sent = null, vtReply = null, resendStatus = 200, vtThrows = false;

globalThis.fetch = async (url, init) => {
  if (String(url).includes('virustotal')) {
    if (vtThrows) throw new Error('network down');
    return vtReply ?? new Response('', { status: 404 });
  }
  sent = JSON.parse(init.body);
  return new Response(JSON.stringify({ id: 'x' }), { status: resendStatus });
};

function submission(over = {}, files = { Resume: 'good.pdf' }) {
  const fd = new FormData();
  const base = {
    'First Name': 'Ada', 'Last Name': 'Lovelace', Email: 'ada@example.com',
    Phone: '918 555 0134', Country: 'United States', 'State / Region': 'Oklahoma',
    City: 'Tulsa', 'Additional Comments': 'Available from October.',
  };
  for (const [k, v] of Object.entries({ ...base, ...over })) if (v !== null) fd.set(k, v);
  for (const [field, name] of Object.entries(files)) {
    if (!name) continue;
    fd.set(field, new Blob([read(name)]), name);
  }
  return new Request('https://api.example/apply', {
    method: 'POST', body: fd,
    headers: { origin: 'https://philipdavidcapital.com' },
  });
}

const results = [];
async function check(what, fn) {
  sent = null; vtReply = null; resendStatus = 200; vtThrows = false;
  try { await fn(); results.push([true, what]); }
  catch (e) { results.push([false, `${what} — ${e.message}`]); }
}
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`); };

await check('a complete application is delivered', async () => {
  const r = await worker.fetch(submission(), ENV);
  eq(r.status, 200, 'status');
  eq((await r.json()).ok, true, 'ok');
  eq(sent.subject, 'Careers application — Ada Lovelace', 'subject');
  eq(sent.reply_to, 'ada@example.com', 'reply-to is the applicant');
  eq(sent.to[0], ENV.MAIL_TO, 'recipient');
  eq(sent.attachments.length, 1, 'attachment count');
  eq(sent.attachments[0].filename, 'good.pdf', 'attachment name');
  const back = Buffer.from(sent.attachments[0].content, 'base64');
  eq(back.equals(read('good.pdf')), true, 'attachment bytes survive the round trip');
});

await check('cover letter is carried too', async () => {
  await worker.fetch(submission({}, { Resume: 'good.pdf', 'Cover Letter': 'good.docx' }), ENV);
  eq(sent.attachments.length, 2, 'attachment count');
});

await check('a missing field is refused, nothing sent', async () => {
  const r = await worker.fetch(submission({ Phone: null }), ENV);
  eq(r.status, 400, 'status');
  eq(/Phone/.test((await r.json()).error), true, 'names the field');
  eq(sent, null, 'nothing sent');
});

await check('a malformed address is refused', async () => {
  const r = await worker.fetch(submission({ Email: 'ada@' }), ENV);
  eq(r.status, 400, 'status'); eq(sent, null, 'nothing sent');
});

await check('a missing résumé is refused', async () => {
  const r = await worker.fetch(submission({}, {}), ENV);
  eq(r.status, 400, 'status'); eq(sent, null, 'nothing sent');
});

await check('a hostile attachment is refused, nothing sent', async () => {
  const r = await worker.fetch(submission({}, { Resume: 'compressed-js.pdf' }), ENV);
  eq(r.status, 400, 'status');
  eq(/active content/.test((await r.json()).error), true, 'explains why');
  eq(sent, null, 'nothing sent');
});

await check('a filled honeypot is accepted and dropped', async () => {
  const r = await worker.fetch(submission({ _honey: 'bot' }), ENV);
  eq(r.status, 200, 'status'); eq(sent, null, 'nothing sent');
});

await check('known malware is refused, nothing sent', async () => {
  vtReply = new Response(JSON.stringify({
    data: { attributes: { last_analysis_stats: { malicious: 41, harmless: 20 } } },
  }), { status: 200 });
  const r = await worker.fetch(submission(), { ...ENV, VIRUSTOTAL_API_KEY: 'k' });
  eq(r.status, 400, 'status');
  eq(/malware/.test((await r.json()).error), true, 'says so');
  eq(sent, null, 'nothing sent');
});

await check('scanner being down does not lose the application', async () => {
  vtThrows = true;
  const r = await worker.fetch(submission(), { ...ENV, VIRUSTOTAL_API_KEY: 'k' });
  eq(r.status, 200, 'still delivered');
  eq(/not checked/.test(sent.html), true, 'the email says the check did not run');
});

await check('a mail failure is reported, not swallowed', async () => {
  resendStatus = 500;
  const r = await worker.fetch(submission(), ENV);
  eq(r.status, 502, 'status');
});

await check('preflight answers with CORS', async () => {
  const r = await worker.fetch(new Request('https://api.example/apply', {
    method: 'OPTIONS', headers: { origin: 'https://philipdavidcapital.com' } }), ENV);
  eq(r.headers.get('access-control-allow-origin'), 'https://philipdavidcapital.com', 'origin');
});

await check('an unknown origin gets the canonical one, not its own', async () => {
  const r = await worker.fetch(new Request('https://api.example/apply', {
    method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), ENV);
  eq(r.headers.get('access-control-allow-origin'), 'https://philipdavidcapital.com', 'origin');
});

await check('GET is refused', async () => {
  const r = await worker.fetch(new Request('https://api.example/apply', { method: 'GET' }), ENV);
  eq(r.status, 405, 'status');
});

let fail = 0;
for (const [ok, what] of results) { if (!ok) fail++; console.log(`  ${ok ? 'ok' : 'XX'}  ${what}`); }
console.log(`\n  ${results.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
