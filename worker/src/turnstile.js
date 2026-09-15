/* Cloudflare Turnstile: proof that a browser, driven by a person, produced
 * this submission.
 *
 * The honeypot this supplements stops a crawler that fills every input it
 * finds and nothing more -- anyone who reads the form once can skip a hidden
 * field. Turnstile cannot be read off the page: the token is issued by
 * Cloudflare to that browser, for that widget, and is accepted once.
 *
 * It is opt-in. With no secret configured the endpoint behaves exactly as it
 * did before, so the form keeps working between deploying this and setting
 * the key. Once a secret IS configured the check is mandatory -- a missing or
 * stale token is refused rather than waved through, because a verification
 * that fails open on bad input is not a verification.
 */

const VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token, secret, ip, fetchImpl = fetch) {
  if (!secret) return { configured: false, ok: true, reason: 'not configured' };
  if (!token) return { configured: true, ok: false, reason: 'no token supplied' };

  /* Form-encoded rather than multipart: the verifier accepts both, and
     building a multipart body costs measurably more processing than joining
     three short strings. On a ten-millisecond budget that is worth having. */
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);

  let res;
  try {
    res = await fetchImpl(VERIFY, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    /* Cloudflare verifying its own token is about as reliable as this gets.
       If it is unreachable the fault is ours, not the applicant's, and losing
       a real application is the worse outcome -- so an outage passes, and
       says so, rather than turning a candidate away over our own failure.
       A token that is present and REJECTED still fails; only the machinery
       being down is forgiven. */
    return { configured: true, ok: true, reason: 'verification unreachable' };
  }

  if (!res.ok) return { configured: true, ok: true, reason: `verification returned ${res.status}` };

  const data = await res.json().catch(() => ({}));
  if (data.success) return { configured: true, ok: true, reason: 'verified' };

  return {
    configured: true,
    ok: false,
    reason: (data['error-codes'] || []).join(', ') || 'rejected',
  };
}
