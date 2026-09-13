/* Attachment inspection.
 *
 * This runs on the server, which matters: the browser check that ships with
 * the form can be bypassed by posting straight to the endpoint, and it can
 * only read raw bytes. Here we can decompress, so a macro hidden inside a
 * .docx or a script inside a compressed PDF stream is actually visible
 * rather than merely often-visible.
 *
 * What this is not: malware detection by signature. A novel exploit in a
 * well-formed PDF passes everything here. The known-sample check is done
 * separately, by hash, in virustotal.js.
 */

const EXECUTABLES = [
  { name: 'a Windows program', bytes: [0x4d, 0x5a] },
  { name: 'a Linux program', bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { name: 'a macOS program', bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  { name: 'a macOS program', bytes: [0xce, 0xfa, 0xed, 0xfe] },
  { name: 'a macOS program', bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { name: 'a shell script', bytes: [0x23, 0x21] },
];

export const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'rtf'];
/* One megabyte, not five. The limit is set by Cloudflare's free plan, which
   allows 10ms of CPU per request, and simply reading an upload into memory
   costs roughly five milliseconds a megabyte before a single check runs.

   The margin is deliberate. That figure was measured under Node, which is a
   stand-in for the Workers runtime rather than the thing itself, so the
   limits are set to leave room for the stand-in being wrong rather than to
   just fit it. A resume is a document, not a portfolio: the ordinary one is
   well under half a megabyte, so this costs an applicant nothing. */
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_TOTAL_BYTES = 1536 * 1024;

const startsWith = (b, sig) => sig.every((v, i) => b[i] === v);

/* Cloudflare's free plan allows 10ms of CPU per request, and a hand-written
   byte search over a 5MB file costs hundreds. Two things fix that: decode
   once and let the engine's native indexOf do the searching, and look only
   where the markers can actually be rather than everywhere.

   The windows are the head and the tail. Format signatures, an RTF's control
   words and a PDF's catalog live near the front; a ZIP's central directory
   and a PDF's trailer live at the very end. Nothing being searched for is
   ever found only in the middle of a large file. */
const INFLATE_UNDER = 400 * 1024;
const HEAD = 128 * 1024;
const TAIL = 64 * 1024;

const latin1 = new TextDecoder('latin1');

function windows(bytes) {
  if (bytes.length <= HEAD + TAIL) return [latin1.decode(bytes)];
  return [
    latin1.decode(bytes.subarray(0, HEAD)),
    latin1.decode(bytes.subarray(bytes.length - TAIL)),
  ];
}

const findIn = (texts, marker) => texts.some((t) => t.indexOf(marker) !== -1);

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/* Walk a ZIP's central directory for its entry names. A .docx is a ZIP, and
   the names alone say whether it carries macros or embedded objects, without
   decompressing anything. */
export function zipEntryNames(bytes) {
  /* The end-of-central-directory record is within 64KB of the end -- that is
     the largest comment the format allows -- so there is no reason to walk
     back through the whole file looking for it. */
  const floor = Math.max(0, bytes.length - 66 * 1024);
  for (let i = bytes.length - 22; i >= floor; i--) {
    if (u32(bytes, i) !== 0x06054b50) continue;      /* end of central directory */
    const count = u16(bytes, i + 10);
    let p = u32(bytes, i + 16);
    const names = [];
    for (let n = 0; n < count && p + 46 <= bytes.length; n++) {
      if (u32(bytes, p) !== 0x02014b50) break;
      const nameLen = u16(bytes, p + 28);
      const extraLen = u16(bytes, p + 30);
      const commentLen = u16(bytes, p + 32);
      names.push(new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen)));
      p += 46 + nameLen + extraLen + commentLen;
    }
    return names;
  }
  return null;   /* not a readable ZIP */
}

/* Inflate every deflated member of a ZIP, or every FlateDecode stream of a
   PDF, so markers hidden by compression are searchable. Bounded: a document
   that expands unreasonably is refused rather than allowed to exhaust
   memory. */
async function inflateRaw(chunk, cap) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([chunk]).stream().pipeThrough(ds);
  const reader = stream.getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) { await reader.cancel(); throw new Error('expands too far'); }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const part of parts) { out.set(part, o); o += part.length; }
  return out;
}

const PDF_ACTIVE = ['/JavaScript', '/JS', '/OpenAction', '/AA', '/Launch', '/EmbeddedFile', '/RichMedia'];
const RTF_ACTIVE = ['\\objdata', '\\objupdate', '\\objemb', '\\objautlink', '\\objocx'];
const OLE_MACRO = ['VBA', 'Macros', '_VBA_PROJECT'];

/* Every PDF stream that is deflated, inflated and searched. Without this,
   "/JavaScript" inside a compressed object is invisible to a raw scan --
   which is the weakness of doing this in the browser. */
async function pdfHasActiveContent(bytes, texts, deep) {
  for (const marker of PDF_ACTIVE) if (findIn(texts, marker)) return marker;

  /* Compressed object streams can hide the same markers, so a few are
     inflated and searched. "A few" is the point: the previous version hunted
     for every "stream" in the file byte by byte and tried to inflate each
     one, which is most of where 747ms went. Object streams carrying a
     catalog or an action sit near the front of a PDF, so the head window is
     where to look, and both the number expanded and the total expanded size
     are capped. A document that hides its payload past all of that is
     refused by the rest of the checks or not caught -- which the README
     says plainly rather than implying otherwise. */
  const head = texts[0];
  let expanded = 0, opened = 0, at = 0;

  /* Off unless asked for. Measured at roughly nine milliseconds per stream,
     almost all of it the cost of starting a DecompressionStream rather than
     the data -- so even one exhausts the free plan's ten. It stays available
     for a paid plan, where the budget is thirty seconds.

     On the free plan this check lives in the page instead, where the
     applicant's own processor does the work and there is no budget at all.
     What that costs is a determined sender skipping the page: they would get
     past this one check, though not past the rest, which read the file's
     structure rather than its compressed contents. */
  if (!deep || bytes.length > INFLATE_UNDER) return null;

  while (opened < 3 && expanded < 192 * 1024) {
    at = head.indexOf('stream', at);
    if (at === -1) break;
    let s = at + 6;
    if (head.charCodeAt(s) === 0x0d) s++;
    if (head.charCodeAt(s) === 0x0a) s++;
    at = s;

    const end = Math.min(s + 96 * 1024, bytes.length);
    try {
      const out = await inflateRaw(bytes.subarray(s + 2, end), 192 * 1024);
      expanded += out.length;
      opened++;
      const text = latin1.decode(out);
      for (const marker of PDF_ACTIVE) {
        if (text.indexOf(marker) !== -1) return marker + ' (compressed)';
      }
    } catch { /* not a deflate stream */ }
  }
  return null;
}

export function deepScanApplies(bytes, deep) {
  return Boolean(deep) && bytes.length <= INFLATE_UNDER;
}

export async function inspect(name, bytes, deep = false) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  let texts = null;
  const decoded = () => (texts ||= windows(bytes));

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `${name} is a .${ext} file. Accepted types are ${ALLOWED_EXTENSIONS.join(', ')}.`;
  }
  if (bytes.length > MAX_FILE_BYTES) {
    return `${name} is larger than 5 MB.`;
  }
  if (bytes.length === 0) {
    return `${name} is empty.`;
  }

  for (const exe of EXECUTABLES) {
    if (startsWith(bytes, exe.bytes)) {
      return `${name} is ${exe.name}, not a document.`;
    }
  }

  const isPDF = startsWith(bytes, [0x25, 0x50, 0x44, 0x46]);
  const isZIP = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  const isOLE = startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0]);
  const isRTF = startsWith(bytes, [0x7b, 0x5c, 0x72, 0x74, 0x66]);

  if (ext === 'pdf' && !isPDF) return `${name} is named .pdf but is not a PDF.`;
  if (ext === 'docx' && !isZIP) return `${name} is named .docx but is not a Word document.`;
  if (ext === 'doc' && !(isOLE || isRTF)) return `${name} is named .doc but is not a Word document.`;
  if (ext === 'rtf' && !isRTF) return `${name} is named .rtf but is not an RTF document.`;
  if (ext === 'txt' && (isPDF || isZIP || isOLE)) return `${name} is named .txt but is not text.`;

  if (isPDF) {
    const found = await pdfHasActiveContent(bytes, decoded(), deep);
    if (found) return `${name} contains active content (${found}). Print it to a new PDF and attach that.`;
  }

  if (isZIP) {
    const names = zipEntryNames(bytes);
    if (!names) return `${name} could not be read as a Word document.`;
    for (const entry of names) {
      const e = entry.toLowerCase();
      if (e.includes('vbaproject.bin') || e.endsWith('.bin') && e.includes('vba')) {
        return `${name} contains macros. Save it without macros, or as a PDF.`;
      }
      if (e.includes('oleobject') || e.includes('embeddings/')) {
        return `${name} contains an embedded object. Attach it as a PDF.`;
      }
    }
    /* A remote template is fetched when the document opens, which is a way to
       deliver something the document itself does not contain. */
    for (const entry of names) {
      if (!/_rels\/.*\.rels$/i.test(entry)) continue;
      const raw = await zipEntryBytes(bytes, entry).catch(() => null);
      if (!raw) continue;
      const text = new TextDecoder().decode(raw);
      if (/attachedTemplate[^>]*Target="https?:/i.test(text) ||
          /TargetMode="External"[^>]*oleObject/i.test(text)) {
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

/* Pull one named entry out of a ZIP, decompressing if needed. */
export async function zipEntryBytes(bytes, wanted) {
  for (let p = 0; p + 30 <= bytes.length; ) {
    if (u32(bytes, p) !== 0x04034b50) break;
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
  throw new Error('entry not found');
}
