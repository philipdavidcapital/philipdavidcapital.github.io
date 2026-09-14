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

You need a Cloudflare account and a Resend account. Both are free and neither
asks for a card. VirusTotal is optional.

### From a browser, with no terminal

`dist/pdcm-careers.js` is the whole endpoint built into one file with no
imports, so it can be pasted straight into Cloudflare's editor.

1. **Resend → API Keys → Create API Key.** Copy it once; it is not shown
   again. Paste it only into the Cloudflare field in step 5 — not into an
   email, a document, or a chat.
2. **Resend → Domains.** Add `philipdavidcapital.com` and enter the DNS
   records it gives you at your registrar. Until that verifies, set
   `MAIL_FROM` in step 5 to `Careers <onboarding@resend.dev>`, which works
   immediately.
3. **Cloudflare → Compute (Workers) → Create → Start with Hello World →
   Deploy.** Name it `pdcm-careers`. The starter code is a placeholder.
4. **Edit code.** Select everything in the editor, delete it, paste the whole
   of `dist/pdcm-careers.js`, and Deploy.
5. **Settings → Variables and Secrets.** Add:

   | Name | Type | Value |
   |---|---|---|
   | `RESEND_API_KEY` | Secret | the key from step 1 |
   | `MAIL_TO` | Text | `jgarrison@philipdavidcapital.com` |
   | `MAIL_FROM` | Text | `Careers <careers@philipdavidcapital.com>` |
   | `ALLOWED_ORIGINS` | Text | `https://philipdavidcapital.com,https://www.philipdavidcapital.com` |
   | `VIRUSTOTAL_API_KEY` | Secret | optional |

   Secret hides the value after saving and is the only correct type for a key.
   Deploy again so the variables take effect.
6. **Settings → Domains & Routes** shows the address, ending `.workers.dev`.
   That is what the form posts to.

### From a terminal

```sh
cd worker
npx wrangler login
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put VIRUSTOTAL_API_KEY   # optional
npx wrangler deploy
```

`wrangler.toml` holds the three plain variables, so only the secrets are
entered by hand. Wrangler prints the `.workers.dev` URL when it finishes.

### Either way

Send the URL over and the form gets pointed at it; that is a one-line change
on the site. Optionally put the endpoint on your own domain instead, which
avoids a cross-origin request entirely — Workers → `pdcm-careers` → Settings
→ Domains & Routes → add route `philipdavidcapital.com/api/apply`.

If a key is ever pasted somewhere it should not be, delete it in Resend and
create another. A key that has been exposed is not made safe by being deleted
from the place it was pasted.

## Testing

```sh
npm install
npm test     # 39 checks across three suites
npm run check   # validates wrangler.toml and bundles, without deploying
npm run bundle  # rebuilds dist/pdcm-careers.js for the dashboard editor
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

## Staying inside the free plan

Cloudflare's free plan allows **10ms of CPU per request**, and that budget --
not taste -- set three decisions here. CPU time excludes waiting on the
network, so a lookup over HTTP is free; work done on bytes is not.

| | measured | where it runs |
|---|---|---|
| Reading an upload into memory | ~2.6 ms per MB | here, unavoidably |
| Decoding the search windows | ~1.5 ms | here |
| SHA-256 of a file | ~8 ms, any size | **the page** |
| Inflating one PDF stream | ~9 ms | **the page**, unless `DEEP_SCAN=1` |

So:

- **Attachments are capped at 1 MB each, 1.5 MB combined.** The largest
  accepted submission measures 5.4 ms median, 8.4 ms worst over twelve runs;
  an ordinary resume is nearer 2 ms. The page enforces the same limits, so
  nobody is refused after submitting.
- **The page computes the SHA-256** and sends it along; this worker only asks
  VirusTotal about it. A sender who skips the page can therefore lie about the
  hash — but that check exists to catch malware an applicant does not know
  they are carrying, and someone deliberately bypassing the page is already
  past it. Every check that reads the file's actual structure runs here.
- **Compressed-stream scanning is off by default.** One decompression spends
  the whole budget. The page does it instead, where the applicant's own
  processor is free. Set `DEEP_SCAN=1` to enable it here, which needs a paid
  plan.

Those figures were measured under Node, which is a stand-in for the Workers
runtime rather than the thing itself — Node's own Blob handling accounts for
about two thirds of the per-megabyte read cost, so the real figure is likely
lower. The limits are set to leave room for the stand-in being wrong.

## What this still is not

Not malware detection by signature. A newly made exploit in a well-formed PDF
is unknown to VirusTotal and passes every static check here. What this stops
is disguised executables, documents that run something on open, macro-carrying
files, documents that fetch content from the internet when opened, and samples
that have been seen before. Treat an attachment from a stranger accordingly.
