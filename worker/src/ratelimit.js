/* Per-address submission limit.
 *
 * What this protects is not the inbox but the ability to receive applications
 * at all: the mail provider's free tier allows a hundred messages a day, and
 * something submitting in a loop would spend that in minutes. A candidate
 * applying afterwards would be refused -- by us, through no fault of theirs.
 *
 * Turnstile is the better answer to automation, and this is the answer to
 * whatever gets past it, including a person leaning on the button. The two
 * cover different failures and neither replaces the other.
 *
 * Needs a rate-limit binding named RATE_LIMITER. Without one this reports
 * that it did not run rather than pretending to have allowed anything, so the
 * distinction is visible instead of assumed.
 */

export async function withinRate(env, ip) {
  const limiter = env && env.RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== 'function') {
    return { checked: false, allowed: true, reason: 'no rate limiter bound' };
  }

  /* An address is the only handle available before the body is parsed, and it
     is a rough one: a household or an office shares one. The limit is set
     high enough that sharing is not the binding constraint. */
  const key = ip || 'unknown';

  try {
    const { success } = await limiter.limit({ key });
    return { checked: true, allowed: Boolean(success), reason: success ? 'within limit' : 'over limit' };
  } catch {
    /* A limiter that errors must not become an outage of the form itself. */
    return { checked: false, allowed: true, reason: 'limiter unavailable' };
  }
}
