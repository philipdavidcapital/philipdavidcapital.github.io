// pdcm-careers — single-file build of worker/src, for pasting into the
// Cloudflare dashboard editor. Generated; do not edit here.
// Rebuild with:  cd worker && npm run bundle
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/inspect.js
var EXECUTABLES = [
  { name: "a Windows program", bytes: [77, 90] },
  { name: "a Linux program", bytes: [127, 69, 76, 70] },
  { name: "a macOS program", bytes: [207, 250, 237, 254] },
  { name: "a macOS program", bytes: [206, 250, 237, 254] },
  { name: "a macOS program", bytes: [202, 254, 186, 190] },
  { name: "a shell script", bytes: [35, 33] }
];
var ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "txt", "rtf"];
var MAX_FILE_BYTES = 1024 * 1024;
var MAX_TOTAL_BYTES = 1536 * 1024;
var startsWith = /* @__PURE__ */ __name((b, sig) => sig.every((v, i) => b[i] === v), "startsWith");
var INFLATE_UNDER = 400 * 1024;
var HEAD = 128 * 1024;
var TAIL = 64 * 1024;
var latin1 = new TextDecoder("latin1");
function windows(bytes) {
  if (bytes.length <= HEAD + TAIL) return [latin1.decode(bytes)];
  return [
    latin1.decode(bytes.subarray(0, HEAD)),
    latin1.decode(bytes.subarray(bytes.length - TAIL))
  ];
}
__name(windows, "windows");
var findIn = /* @__PURE__ */ __name((texts, marker) => texts.some((t) => t.indexOf(marker) !== -1), "findIn");
var u16 = /* @__PURE__ */ __name((b, o) => b[o] | b[o + 1] << 8, "u16");
var u32 = /* @__PURE__ */ __name((b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0, "u32");
function zipEntryNames(bytes) {
  const floor = Math.max(0, bytes.length - 66 * 1024);
  for (let i = bytes.length - 22; i >= floor; i--) {
    if (u32(bytes, i) !== 101010256) continue;
    const count = u16(bytes, i + 10);
    let p = u32(bytes, i + 16);
    const names = [];
    for (let n = 0; n < count && p + 46 <= bytes.length; n++) {
      if (u32(bytes, p) !== 33639248) break;
      const nameLen = u16(bytes, p + 28);
      const extraLen = u16(bytes, p + 30);
      const commentLen = u16(bytes, p + 32);
      names.push(new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen)));
      p += 46 + nameLen + extraLen + commentLen;
    }
    return names;
  }
  return null;
}
__name(zipEntryNames, "zipEntryNames");
async function inflateRaw(chunk, cap) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([chunk]).stream().pipeThrough(ds);
  const reader = stream.getReader();
  const parts = [];
  let total = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await reader.cancel();
      throw new Error("expands too far");
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const part of parts) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}
__name(inflateRaw, "inflateRaw");
var PDF_ACTIVE = ["/JavaScript", "/JS", "/OpenAction", "/AA", "/Launch", "/EmbeddedFile", "/RichMedia"];
var RTF_ACTIVE = ["\\objdata", "\\objupdate", "\\objemb", "\\objautlink", "\\objocx"];
var OLE_MACRO = ["VBA", "Macros", "_VBA_PROJECT"];
async function pdfHasActiveContent(bytes, texts, deep) {
  for (const marker of PDF_ACTIVE) if (findIn(texts, marker)) return marker;
  const head = texts[0];
  let expanded = 0, opened = 0, at = 0;
  if (!deep || bytes.length > INFLATE_UNDER) return null;
  while (opened < 3 && expanded < 192 * 1024) {
    at = head.indexOf("stream", at);
    if (at === -1) break;
    let s = at + 6;
    if (head.charCodeAt(s) === 13) s++;
    if (head.charCodeAt(s) === 10) s++;
    at = s;
    const end = Math.min(s + 96 * 1024, bytes.length);
    try {
      const out = await inflateRaw(bytes.subarray(s + 2, end), 192 * 1024);
      expanded += out.length;
      opened++;
      const text = latin1.decode(out);
      for (const marker of PDF_ACTIVE) {
        if (text.indexOf(marker) !== -1) return marker + " (compressed)";
      }
    } catch {
    }
  }
  return null;
}
__name(pdfHasActiveContent, "pdfHasActiveContent");
function deepScanApplies(bytes, deep) {
  return Boolean(deep) && bytes.length <= INFLATE_UNDER;
}
__name(deepScanApplies, "deepScanApplies");
async function inspect(name, bytes, deep = false) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  let texts = null;
  const decoded = /* @__PURE__ */ __name(() => texts ||= windows(bytes), "decoded");
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `${name} is a .${ext} file. Accepted types are ${ALLOWED_EXTENSIONS.join(", ")}.`;
  }
  if (bytes.length > MAX_FILE_BYTES) {
    return `${name} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`;
  }
  if (bytes.length === 0) {
    return `${name} is empty.`;
  }
  for (const exe of EXECUTABLES) {
    if (startsWith(bytes, exe.bytes)) {
      return `${name} is ${exe.name}, not a document.`;
    }
  }
  const isPDF = startsWith(bytes, [37, 80, 68, 70]);
  const isZIP = startsWith(bytes, [80, 75, 3, 4]);
  const isOLE = startsWith(bytes, [208, 207, 17, 224]);
  const isRTF = startsWith(bytes, [123, 92, 114, 116, 102]);
  if (ext === "pdf" && !isPDF) return `${name} is named .pdf but is not a PDF.`;
  if (ext === "docx" && !isZIP) return `${name} is named .docx but is not a Word document.`;
  if (ext === "doc" && !(isOLE || isRTF)) return `${name} is named .doc but is not a Word document.`;
  if (ext === "rtf" && !isRTF) return `${name} is named .rtf but is not an RTF document.`;
  if (ext === "txt" && (isPDF || isZIP || isOLE)) return `${name} is named .txt but is not text.`;
  if (isPDF) {
    const found = await pdfHasActiveContent(bytes, decoded(), deep);
    if (found) return `${name} contains active content (${found}). Print it to a new PDF and attach that.`;
  }
  if (isZIP) {
    const names = zipEntryNames(bytes);
    if (!names) return `${name} could not be read as a Word document.`;
    for (const entry of names) {
      const e = entry.toLowerCase();
      if (e.includes("vbaproject.bin") || e.endsWith(".bin") && e.includes("vba")) {
        return `${name} contains macros. Save it without macros, or as a PDF.`;
      }
      if (e.includes("oleobject") || e.includes("embeddings/")) {
        return `${name} contains an embedded object. Attach it as a PDF.`;
      }
    }
    for (const entry of names) {
      if (!/_rels\/.*\.rels$/i.test(entry)) continue;
      const raw = await zipEntryBytes(bytes, entry).catch(() => null);
      if (!raw) continue;
      const text = new TextDecoder().decode(raw);
      if (/attachedTemplate[^>]*Target="https?:/i.test(text) || /TargetMode="External"[^>]*oleObject/i.test(text)) {
        return `${name} loads content from the internet when opened. Attach it as a PDF.`;
      }
    }
  }
  if (isRTF) {
    for (const marker of RTF_ACTIVE) {
      if (findIn(decoded(), marker)) return `${name} contains an embedded object. Attach it as a PDF.`;
    }
  }
  if (isOLE) {
    for (const marker of OLE_MACRO) {
      if (findIn(decoded(), marker)) return `${name} contains macros. Save it as a PDF.`;
    }
  }
  return null;
}
__name(inspect, "inspect");
async function zipEntryBytes(bytes, wanted) {
  for (let p = 0; p + 30 <= bytes.length; ) {
    if (u32(bytes, p) !== 67324752) break;
    const method = u16(bytes, p + 8);
    const compSize = u32(bytes, p + 18);
    const nameLen = u16(bytes, p + 26);
    const extraLen = u16(bytes, p + 28);
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nameLen));
    const dataAt = p + 30 + nameLen + extraLen;
    if (name === wanted) {
      const chunk = bytes.subarray(dataAt, dataAt + compSize);
      return method === 0 ? chunk : inflateRaw(chunk, 4 * 1024 * 1024);
    }
    p = dataAt + compSize;
  }
  throw new Error("entry not found");
}
__name(zipEntryBytes, "zipEntryBytes");

// src/virustotal.js
async function knownMalicious(hash, apiKey, fetchImpl = fetch) {
  if (!apiKey) return { checked: false, malicious: false, reason: "no API key configured" };
  if (!/^[0-9a-f]{64}$/.test(hash || "")) {
    return { checked: false, malicious: false, reason: "no usable hash supplied" };
  }
  let res;
  try {
    res = await fetchImpl(`https://www.virustotal.com/api/v3/files/${hash}`, {
      headers: { "x-apikey": apiKey }
    });
  } catch (e) {
    return { checked: false, malicious: false, reason: "lookup unreachable" };
  }
  if (res.status === 404) {
    return { checked: true, malicious: false, hash, reason: "not a known sample" };
  }
  if (!res.ok) {
    return { checked: false, malicious: false, hash, reason: `lookup returned ${res.status}` };
  }
  const body = await res.json();
  const stats = body?.data?.attributes?.last_analysis_stats || {};
  const malicious = (stats.malicious || 0) + (stats.suspicious || 0);
  return {
    checked: true,
    malicious: malicious > 0,
    detections: malicious,
    engines: Object.values(stats).reduce((a, b) => a + (b || 0), 0),
    hash,
    reason: malicious > 0 ? `flagged by ${malicious} engines` : "known and clean"
  };
}
__name(knownMalicious, "knownMalicious");

// src/email.js
var NAVY = "#192c44";
var CHARCOAL = "#5e5f5f";
var PLATINUM = "#d6d6d6";
var PAPER = "#fbfaf6";
var esc = /* @__PURE__ */ __name((s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"), "esc");
var row = /* @__PURE__ */ __name((label, value) => `
        <tr>
          <td style="padding:9px 18px 9px 0;vertical-align:top;white-space:nowrap;
                     font:700 10.5px/1.5 Lato,Helvetica,Arial,sans-serif;letter-spacing:.16em;
                     text-transform:uppercase;color:${NAVY};">${esc(label)}</td>
          <td style="padding:9px 0;vertical-align:top;
                     font:300 14px/1.7 Lato,Helvetica,Arial,sans-serif;color:${CHARCOAL};">${value}</td>
        </tr>`, "row");
function buildEmail(fields, files, scans) {
  const name = [fields["First Name"], fields["Last Name"]].filter(Boolean).join(" ").trim() || "Applicant";
  const place = [fields.City, fields["State / Region"], fields.Country].filter(Boolean).join(", ");
  const rows = [
    row("Name", esc(name)),
    row("Email", `<a href="mailto:${esc(fields.Email)}" style="color:${NAVY};">${esc(fields.Email)}</a>`),
    row("Phone", esc(fields.Phone)),
    place ? row("Location", esc(place)) : ""
  ].join("");
  const comments = (fields["Additional Comments"] || "").trim();
  const commentsBlock = comments ? `<tr><td colspan="2" style="padding:22px 0 0;">
         <div style="font:700 10.5px/1.5 Lato,Helvetica,Arial,sans-serif;letter-spacing:.16em;
                     text-transform:uppercase;color:${NAVY};padding-bottom:8px;">Additional comments</div>
         <div style="font:300 14px/1.8 Lato,Helvetica,Arial,sans-serif;color:${CHARCOAL};
                     white-space:pre-wrap;">${esc(comments)}</div>
       </td></tr>` : "";
  const attachmentLines = files.map((f) => {
    const scan = scans[f.field] || {};
    const note = scan.checked ? scan.malicious ? "FLAGGED" : "checked, clean" : "not checked";
    return `<div style="font:300 13px/1.9 Lato,Helvetica,Arial,sans-serif;color:${CHARCOAL};">
        ${esc(f.field)}: ${esc(f.filename)}
        <span style="color:#9a9a9a;">(${(f.bytes.length / 1024).toFixed(0)} KB &middot; ${esc(note)})</span>
      </div>`;
  }).join("");
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${PAPER};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:${PAPER};padding:34px 18px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:620px;background:#ffffff;border:1px solid ${PLATINUM};">
        <tr><td style="padding:30px 34px 20px;border-bottom:1px solid ${PLATINUM};">
          <div style="font:500 22px/1.3 'Cormorant SC',Georgia,serif;letter-spacing:.05em;color:${NAVY};">
            Careers Application</div>
          <div style="font:300 13px/1.6 Lato,Helvetica,Arial,sans-serif;color:${CHARCOAL};padding-top:5px;">
            Submitted via philipdavidcapital.com</div>
        </td></tr>
        <tr><td style="padding:24px 34px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            ${rows}
            ${commentsBlock}
          </table>
          <div style="border-top:1px solid ${PLATINUM};margin-top:24px;padding-top:18px;">
            <div style="font:700 10.5px/1.5 Lato,Helvetica,Arial,sans-serif;letter-spacing:.16em;
                        text-transform:uppercase;color:${NAVY};padding-bottom:7px;">Attached</div>
            ${attachmentLines || `<div style="font:300 13px Lato,Helvetica,Arial,sans-serif;color:${CHARCOAL};">None</div>`}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = [
    "Careers application \u2014 philipdavidcapital.com",
    "",
    `Name:     ${name}`,
    `Email:    ${fields.Email || ""}`,
    `Phone:    ${fields.Phone || ""}`,
    place ? `Location: ${place}` : "",
    comments ? `
Additional comments:
${comments}` : "",
    "",
    "Attached: " + (files.map((f) => `${f.field} \u2014 ${f.filename}`).join("; ") || "none")
  ].filter((l) => l !== "").join("\n");
  return { subject: `Careers application \u2014 ${name}`, html, text };
}
__name(buildEmail, "buildEmail");

// src/index.js
var REQUIRED = ["First Name", "Last Name", "Email", "Phone", "Country", "City"];
var FILE_FIELDS = ["Resume", "Cover Letter"];
var json = /* @__PURE__ */ __name((obj, status, origin) => new Response(JSON.stringify(obj), {
  status,
  headers: {
    "content-type": "application/json",
    "access-control-allow-origin": origin,
    "cache-control": "no-store"
  }
}), "json");
function allowedOrigin(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || "https://philipdavidcapital.com").split(",").map((s) => s.trim());
  const origin = request.headers.get("origin") || "";
  return allowed.includes(origin) ? origin : allowed[0];
}
__name(allowedOrigin, "allowedOrigin");
var index_default = {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400"
        }
      });
    }
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ error: "The submission could not be read." }, 400, origin);
    }
    if ((form.get("_honey") || "").toString().trim() !== "") {
      return json({ ok: true }, 200, origin);
    }
    const fields = {};
    for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v.trim();
    const missing = REQUIRED.filter((k) => !fields[k]);
    if (missing.length) {
      return json({ error: `Please complete: ${missing.join(", ")}.` }, 400, origin);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.Email)) {
      return json({ error: "Please enter a valid email address." }, 400, origin);
    }
    const chosen = [];
    let total = 0;
    for (const field of FILE_FIELDS) {
      const f = form.get(field);
      if (!f || typeof f === "string" || !f.name || !f.size) continue;
      if (f.size > MAX_FILE_BYTES) {
        return json({ error: `${f.name} is larger than 1 MB.` }, 400, origin);
      }
      total += f.size;
      chosen.push({ field, file: f });
    }
    if (!chosen.some((c) => c.field === "Resume")) {
      return json({ error: "A r\xE9sum\xE9 is required." }, 400, origin);
    }
    if (total > MAX_TOTAL_BYTES) {
      return json({ error: "The attachments come to more than 1.5 MB together." }, 400, origin);
    }
    const files = [];
    for (const c of chosen) {
      files.push({ field: c.field, filename: c.file.name, bytes: new Uint8Array(await c.file.arrayBuffer()) });
    }
    const deep = env.DEEP_SCAN === "1";
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
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json"
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
          content: base64(f.bytes)
        }))
      })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("mail send failed", res.status, detail.slice(0, 400));
      return json({ error: "The application could not be delivered. Please try again shortly." }, 502, origin);
    }
    return json({ ok: true }, 200, origin);
  }
};
function base64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  }
  return btoa(s);
}
__name(base64, "base64");
export {
  index_default as default
};
