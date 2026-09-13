/* Known-sample check, by hash.
 *
 * Only the SHA-256 of the file is sent, never the file. That distinction
 * matters here: a candidate's resume is personal information the firm has
 * been given in confidence, and uploading it to a third-party scanner would
 * hand that document to another company to keep. A hash discloses nothing
 * about its contents, cannot be reversed, and is enough to recognise a
 * sample that has been seen before.
 *
 * The trade is that this only catches known malware. Something newly made
 * is unknown to the service and comes back clean -- the static inspection is
 * what stands between that and the inbox.
 *
 * Absent an API key this is skipped rather than failing the submission.
 */

/* The hash is computed by the page, not here. Hashing costs about eight
   milliseconds whatever the file's size -- nearly all of the free plan's ten
   -- while the applicant's own processor does it for nothing. The lookup
   itself is network I/O, which Cloudflare does not count against CPU time.

   A sender who skips the page can therefore supply a hash that is not the
   file's. That matters less than it sounds: this check exists to recognise
   malware an ordinary applicant does not know they are carrying, and anyone
   deliberately bypassing the page is already past it. Everything that does
   not depend on being told the truth -- the format checks, the macro and
   embedded-object checks -- runs here on the bytes themselves. */
export async function knownMalicious(hash, apiKey, fetchImpl = fetch) {
  if (!apiKey) return { checked: false, malicious: false, reason: 'no API key configured' };
  if (!/^[0-9a-f]{64}$/.test(hash || '')) {
    return { checked: false, malicious: false, reason: 'no usable hash supplied' };
  }
  let res;
  try {
    res = await fetchImpl(`https://www.virustotal.com/api/v3/files/${hash}`, {
      headers: { 'x-apikey': apiKey },
    });
  } catch (e) {
    /* The scanner being unreachable is not evidence either way. The
       submission proceeds and the email says the check did not run, rather
       than a candidate losing an application to someone else's outage. */
    return { checked: false, malicious: false, reason: 'lookup unreachable' };
  }

  if (res.status === 404) {
    return { checked: true, malicious: false, hash, reason: 'not a known sample' };
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
    reason: malicious > 0 ? `flagged by ${malicious} engines` : 'known and clean',
  };
}
