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
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 9 * 1024 * 1024;

const startsWith = (b, sig) => sig.every((v, i) => b[i] === v);

const find = (bytes, text) => {
  const n = [...text].map((c) => c.charCodeAt(0));
  outer: for (let p = 0; p <= bytes.length - n.length; p++) {
    for (let k = 0; k < n.length; k++) if (bytes[p + k] !== n[k]) continue outer;
    return true;
  }
  return false;
};

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/* Walk a ZIP's central directory for its entry names. A .docx is a ZIP, and
   the names alone say whether it carries macros or embedded objects, without
   decompressing anything. */
export function zipEntryNames(bytes) {
  for (let i = bytes.length - 22; i >= 0; i--) {
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
async function pdfHasActiveContent(bytes) {
  for (const marker of PDF_ACTIVE) if (find(bytes, marker)) return marker;

  const header = [...'stream'].map((c) => c.charCodeAt(0));
  let expanded = 0;
  outer: for (let p = 0; p < bytes.length - 6; p++) {
    for (let k = 0; k < 6; k++) if (bytes[p + k] !== header[k]) continue outer;
    let s = p + 6;
    if (bytes[s] === 0x0d) s++;
    if (bytes[s] === 0x0a) s++;
    const end = Math.min(s + 512 * 1024, bytes.length);
    if (expanded > 8 * 1024 * 1024) break;
    try {
      const out = await inflateRaw(bytes.subarray(s + 2, end), 4 * 1024 * 1024);
      expanded += out.length;
      for (const marker of PDF_ACTIVE) if (find(out, marker)) return marker + ' (compressed)';
    } catch { /* not a deflate stream, or not worth expanding */ }
    p = s;
  }
  return null;
}

export async function inspect(name, bytes) {
  const ext = (name.split('.').pop() || '').toLowerCase();

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
    const found = await pdfHasActiveContent(bytes);
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
      if (find(bytes, marker)) return `${name} contains an embedded object. Attach it as a PDF.`;
    }
  }

  if (isOLE) {
    for (const marker of OLE_MACRO) {
      if (find(bytes, marker)) return `${name} contains macros. Save it as a PDF.`;
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
