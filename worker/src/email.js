/* The notification the firm receives.
 *
 * Built to be read at a glance and to be replied to directly: the subject
 * carries the applicant's name so the inbox is sortable, Reply-To is the
 * applicant so hitting reply reaches them rather than the sender, and the
 * attachments arrive as attachments. No advertising, no third-party
 * branding, no tracking pixel.
 */

const NAVY = '#192c44';
const CHARCOAL = '#5e5f5f';
const PLATINUM = '#d6d6d6';
const PAPER = '#fbfaf6';

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const row = (label, value) => `
        <tr>
          <td style="padding:9px 18px 9px 0;vertical-align:top;white-space:nowrap;
                     font:700 10.5px/1.5 Lato,Helvetica,Arial,sans-serif;letter-spacing:.16em;
                     text-transform:uppercase;color:${NAVY};">${esc(label)}</td>
          <td style="padding:9px 0;vertical-align:top;
                     font:300 14px/1.7 Lato,Helvetica,Arial,sans-serif;color:${CHARCOAL};">${value}</td>
        </tr>`;

export function buildEmail(fields, files, scans) {
  const name = [fields['First Name'], fields['Last Name']].filter(Boolean).join(' ').trim() || 'Applicant';
  const place = [fields.City, fields['State / Region'], fields.Country].filter(Boolean).join(', ');

  const rows = [
    row('Name', esc(name)),
    row('Email', `<a href="mailto:${esc(fields.Email)}" style="color:${NAVY};">${esc(fields.Email)}</a>`),
    row('Phone', esc(fields.Phone)),
    place ? row('Location', esc(place)) : '',
  ].join('');

  const comments = (fields['Additional Comments'] || '').trim();
  const commentsBlock = comments
    ? `<tr><td colspan="2" style="padding:22px 0 0;">
         <div style="font:700 10.5px/1.5 Lato,Helvetica,Arial,sans-serif;letter-spacing:.16em;
                     text-transform:uppercase;color:${NAVY};padding-bottom:8px;">Additional comments</div>
         <div style="font:300 14px/1.8 Lato,Helvetica,Arial,sans-serif;color:${CHARCOAL};
                     white-space:pre-wrap;">${esc(comments)}</div>
       </td></tr>`
    : '';

  /* Every attachment here has been inspected -- a file that failed is refused
     and no mail is sent -- so the note says so plainly rather than leaving the
     reader to infer it. What varies is the second check: whether the file's
     hash was looked up against a database of known malware, which needs an API
     key the firm may not have configured. An earlier version reported that
     lookup alone as "not checked", which read as though nothing had been
     examined at all. */
  const attachmentLines = files.map((f) => {
    const scan = scans[f.field] || {};
    const note = scan.checked
      ? (scan.malicious ? 'FLAGGED' : 'inspected \u00b7 not known malware')
      : `inspected \u00b7 not checked against known malware: ${scan.reason || 'lookup did not run'}`;
    return `<div style="font:300 13px/1.9 Lato,Helvetica,Arial,sans-serif;color:${CHARCOAL};">
        ${esc(f.field)}: ${esc(f.filename)}
        <span style="color:#9a9a9a;">(${(f.bytes.length / 1024).toFixed(0)} KB &middot; ${esc(note)})</span>
      </div>`;
  }).join('');

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
    'Careers application — philipdavidcapital.com',
    '',
    `Name:     ${name}`,
    `Email:    ${fields.Email || ''}`,
    `Phone:    ${fields.Phone || ''}`,
    place ? `Location: ${place}` : '',
    comments ? `\nAdditional comments:\n${comments}` : '',
    '',
    'Attached: ' + (files.map((f) => `${f.field} — ${f.filename}`).join('; ') || 'none'),
  ].filter((l) => l !== '').join('\n');

  return { subject: `Careers application — ${name}`, html, text };
}
