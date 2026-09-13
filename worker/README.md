# Careers endpoint

Receives the application form, inspects the attachments, and emails them to
the firm. Replaces the public form relay the site currently posts to.

Three reasons it exists:

- **The attachment checks run where they cannot be bypassed.** The checks in
  the page can be skipped by posting straight to the endpoint, and a browser
  can only read raw bytes. Here we can decompress, so a macro inside a
  `.docx` or JavaScript inside a compressed PDF stream is actually found.
  Both of those are in the test suite, marked as cases the browser misses.
- **Candidate documents are not given to a third party.** The relay stores
  what passes through it. This does not. The known-malware check sends only a
  SHA-256 hash — never the file — so the scanner learns nothing about a
  candidate.
- **The notification carries no advertising.** The free relay put an
  advertisement in the firm's inbox.

## What it does, in order

1. Rejects anything that is not a POST, and answers CORS preflight.
2. Drops submissions that filled the honeypot field.
3. Requires first name, last name, email, phone, country, city, and a résumé.
4. Inspects every attachment (`src/inspect.js`). Nothing is sent if this
   fails; the applicant is told what is wrong so they can correct it.
5. Checks each file's SHA-256 against VirusTotal, if a key is configured.
6. Sends one email through Resend with the files attached, `Reply-To` set to
   the applicant.

## Deploying

You need a Cloudflare account and a Resend account. VirusTotal is optional.

```sh
npm install -g wrangler        # once
cd worker
wrangler login
```

**Set the secrets.** These are stored encrypted by Cloudflare, never in this
repository:

```sh
wrangler secret put RESEND_API_KEY
wrangler secret put VIRUSTOTAL_API_KEY   # optional
```

**Check the addresses** in `wrangler.toml`. `MAIL_FROM` must be on a domain
verified in Resend — verifying `philipdavidcapital.com` means adding the DNS
records Resend gives you. Until that is done, send from `onboarding@resend.dev`,
which works immediately but looks like what it is.

```sh
wrangler deploy
```

Wrangler prints a URL ending `.workers.dev`. Send it to me and I will point
the form at it; that is a one-line change on the site.

Optionally put it on your own domain instead, which avoids a cross-origin
request entirely — in the Cloudflare dashboard, Workers → your worker →
Triggers → add route `philipdavidcapital.com/api/apply`.

## Testing

```sh
npm install
npm test     # 35 checks across three suites
npm run check   # validates wrangler.toml and bundles, without deploying
```

- `test/inspect.test.mjs` — 13 files, hostile and ordinary. Two of them are
  cases the browser-side check cannot catch, which is the whole argument for
  this existing.
- `test/email.test.mjs` — the notification's contents, including that a field
  containing markup is escaped rather than rendered. Writes
  `test/email-preview.html` to open in a browser.
- `test/endpoint.test.mjs` — the whole request path with the network stubbed:
  a real multipart POST in, and whatever would have gone to Resend captured
  and inspected. Covers delivery, every refusal, the honeypot, a flagged
  file, the scanner being unreachable, a mail failure, CORS, and method
  rejection.

The worker runs unmodified under Node, which is what makes that last suite
possible: Node supplies the same FormData, DecompressionStream,
crypto.subtle and btoa that Workers do.

## What this still is not

Not malware detection by signature. A newly made exploit in a well-formed PDF
is unknown to VirusTotal and passes every static check here. What this stops
is disguised executables, documents that run something on open, and samples
that have been seen before. Treat an attachment from a stranger accordingly.
