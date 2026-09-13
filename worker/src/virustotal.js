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

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function knownMalicious(bytes, apiKey, fetchImpl = fetch) {
  if (!apiKey) return { checked: false, malicious: false, reason: 'no API key configured' };

  const hash = await sha256Hex(bytes);
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
