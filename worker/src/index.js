/* Careers application endpoint.
 *
 * The form posts here instead of to a public form relay. Three reasons: the
 * attachments are inspected somewhere the applicant cannot bypass, the
 * candidate's documents are not handed to a third party to keep, and the
 * notification that lands in the firm's inbox carries no advertising.
 */

import { inspect, deepScanApplies, MAX_FILE_BYTES, MAX_TOTAL_BYTES } from './inspect.js';
import { knownMalicious } from './virustotal.js';
import { verifyTurnstile } from './turnstile.js';
import { withinRate } from './ratelimit.js';
import { buildEmail } from './email.js';

const REQUIRED = ['First Name', 'Last Name', 'Email', 'Phone', 'Country', 'City'];
const FILE_FIELDS = ['Resume', 'Cover Letter'];

const json = (obj, status, origin) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': origin,
      'cache-control': 'no-store',
    },
  });

function allowedOrigin(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || 'https://philipdavidcapital.com')
    .split(',').map((s) => s.trim());
  const origin = request.headers.get('origin') || '';
  return allowed.includes(origin) ? origin : allowed[0];
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '86400',
        },
      });
    }
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

    /* Before the body is touched. Reading a megabyte and a half to then refuse
       it would make a flood cheaper to send than to reject. */
    const rate = await withinRate(env, request.headers.get('cf-connecting-ip'));
    if (!rate.allowed) {
      return json({ error: 'Too many submissions from this connection. Please try again shortly.' }, 429, origin);
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ error: 'The submission could not be read.' }, 400, origin);
    }

    /* A bot that fills every field it finds fills this one too. A person
       never sees it. */
    if ((form.get('_honey') || '').toString().trim() !== '') {
      return json({ ok: true }, 200, origin);
    }

    const fields = {};
    for (const [k, v] of form.entries()) if (typeof v === 'string') fields[k] = v.trim();

    /* Ahead of the attachments, which are the expensive part. A submission
       that cannot prove a browser produced it is not worth reading. */
    const human = await verifyTurnstile(
      fields['cf-turnstile-response'],
      env.TURNSTILE_SECRET,
      request.headers.get('cf-connecting-ip'),
    );
    if (!human.ok) {
      return json({ error: 'Please complete the verification and submit again.' }, 400, origin);
    }

    const missing = REQUIRED.filter((k) => !fields[k]);
    if (missing.length) {
      return json({ error: `Please complete: ${missing.join(', ')}.` }, 400, origin);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.Email)) {
      return json({ error: 'Please enter a valid email address.' }, 400, origin);
    }

    /* Sizes are settled before anything is read. A File knows its own length,
       and reading a two-megabyte upload into memory costs several of the ten
       milliseconds this request is allowed -- so an attachment that was never
       going to be accepted should not be paid for first. */
    const chosen = [];
    let total = 0;
    for (const field of FILE_FIELDS) {
      const f = form.get(field);
      if (!f || typeof f === 'string' || !f.name || !f.size) continue;
      if (f.size > MAX_FILE_BYTES) {
        return json({ error: `${f.name} is larger than 1 MB.` }, 400, origin);
      }
      total += f.size;
      chosen.push({ field, file: f });
    }

    if (!chosen.some((c) => c.field === 'Resume')) {
      return json({ error: 'A résumé is required.' }, 400, origin);
    }
    if (total > MAX_TOTAL_BYTES) {
      return json({ error: 'The attachments come to more than 1.5 MB together.' }, 400, origin);
    }

    const files = [];
    for (const c of chosen) {
      files.push({ field: c.field, filename: c.file.name, bytes: new Uint8Array(await c.file.arrayBuffer()) });
    }

    /* Inspection first, and nothing is sent if it fails. The applicant is
       told what is wrong so they can correct it, rather than the firm
       discovering it in the inbox. */
    /* Off on the free plan, where one decompression would spend the whole
       ten-millisecond budget. See inspect.js. */
    const deep = env.DEEP_SCAN === '1';
    for (const f of files) {
      const problem = await inspect(f.filename, f.bytes, deep);
      if (problem) return json({ error: problem }, 400, origin);
    }

    const scans = {};
    for (const f of files) {
      const scan = await knownMalicious(fields[`${f.field} SHA256`], env.VIRUSTOTAL_API_KEY);
      scan.deep = deepScanApplies(f.bytes, deep);
      scans[f.field] = scan;
      if (scan.malicious) {
        return json({ error: `${f.filename} was identified as malware and has not been sent.` }, 400, origin);
      }
    }

    const { subject, html, text } = buildEmail(fields, files, scans);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [env.MAIL_TO],
        reply_to: fields.Email,
        subject,
        html,
        text,
        attachments: files.map((f) => ({
          filename: f.filename,
          content: base64(f.bytes),
        })),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('mail send failed', res.status, detail.slice(0, 400));
      return json({ error: 'The application could not be delivered. Please try again shortly.' }, 502, origin);
    }

    return json({ ok: true }, 200, origin);
  },
};

function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}
