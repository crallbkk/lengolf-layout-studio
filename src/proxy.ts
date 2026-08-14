import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Shared-password gate for the whole site.
 *
 * Vercel's own password protection is a paid feature, so this does the same job
 * at the application edge on the free tier. `proxy.ts` is the Next 16 name for
 * what used to be `middleware.ts`.
 *
 * HTTP Basic rather than a login page + cookie, deliberately. A cookie-based
 * login page has to exempt `/_next/static` from the gate, otherwise the login
 * page cannot load its own CSS and JS — and this app's entire value, the unit's
 * traced geometry and dimensions, is compiled into those JS chunks. Basic auth
 * is replayed by the browser on *every* request, so the bundle is covered too
 * and there is no chicken-and-egg exemption to get wrong.
 *
 * Trade-off accepted: a native browser dialog instead of a styled form, and
 * signing out means closing the browser.
 */

const REALM = 'LENGOLF Layout Studio';
const DEFAULT_USER = 'lengolf';

/**
 * Share links get in without the password.
 *
 * The token arrives once, in the query string of the link, and is then swapped
 * for a cookie. The swap is the whole point: the recipient's very next requests
 * are for `/_next/static/*`, which this gate deliberately covers because the
 * unit's traced geometry is compiled into those chunks. A query parameter is
 * only on the first request, so without a cookie the page would load and every
 * chunk behind it would 401.
 *
 * What this does and does not buy:
 *
 *   - Someone who has never been sent a link still hits the password, so the
 *     drawing is not made publicly reachable.
 *   - Someone holding ANY link has full access, and can read the token out of
 *     the bundle and mint their own links. There is one shared token, because
 *     there is no store to keep per-link ones in. Rotating the token is
 *     therefore the revocation mechanism, and it invalidates every outstanding
 *     link at once. That is the accepted trade for having no backend.
 *
 * NEXT_PUBLIC_ on purpose, and it is the SAME variable the client reads to build
 * a link. The client cannot mint a link without the token, so it has to be in
 * the bundle either way — and a separate server-only copy would be two values
 * that must match, where rotating one and not the other silently produces links
 * that 401. Being in the bundle costs nothing here: the bundle is behind this
 * same gate, and anyone who can read it already holds a working link.
 *
 * Rotation therefore needs a rebuild, not just an env change, because
 * NEXT_PUBLIC_ values are inlined at build time.
 */
const SHARE_COOKIE = 'lengolf_share';
/** Long enough to outlast a review cycle, short enough that access lapses. */
const SHARE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Anything shorter is not a secret, and the whole feature rests on this value
 * being unguessable against an edge function nobody rate-limits. A token set to
 * `demo` or `share` must not open the gate — treating it as absent fails closed,
 * which is the safe direction for a misconfiguration. Generate one with
 * `openssl rand -hex 32`.
 */
const MIN_SHARE_TOKEN_LENGTH = 24;

function shareTokenFromEnv(): string | null {
  const token = process.env.NEXT_PUBLIC_SHARE_TOKEN;
  if (!token || token.length < MIN_SHARE_TOKEN_LENGTH) return null;
  return token;
}

function unauthorized(): NextResponse {
  return new NextResponse('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Compares without an early exit, so response time does not reveal how many
 * leading characters of a guess were correct.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** base64 -> UTF-8, so non-ASCII passwords survive the round trip. */
function decodeBase64(value: string): string | null {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Adds the no-index header every authorised response carries, and — only on the
 * request that presented a token — swaps that token for a cookie.
 *
 * The token is passed in rather than re-read from the environment: it has
 * already been validated by the caller, and a second read of a security-relevant
 * value is a second thing a reader has to check agrees with the first.
 */
function allow(request: NextRequest, grantToken: string | null): NextResponse {
  const response = NextResponse.next();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (grantToken) {
    response.cookies.set(SHARE_COOKIE, grantToken, {
      // Not readable by page scripts, and never sent to another origin.
      httpOnly: true,
      // `lax`, not `strict`: the link is followed as a top-level navigation
      // from a chat client, and `strict` would withhold the cookie on exactly
      // that first hop.
      sameSite: 'lax',
      // NODE_ENV as well as the protocol, so a bearer token is never issued
      // without Secure in production just because something upstream terminated
      // TLS and forwarded plaintext. Local http dev still works.
      secure:
        process.env.NODE_ENV === 'production' ||
        request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: SHARE_COOKIE_MAX_AGE,
    });
    // This is the one response carrying a credential. Nothing may store it —
    // cheaper than reasoning about what any cache in front of this keys on.
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
}

export function proxy(request: NextRequest): NextResponse {
  const password = process.env.APP_PASSWORD;
  const user = process.env.APP_USER || DEFAULT_USER;
  const shareToken = shareTokenFromEnv();

  if (!password) {
    // Local development stays open so `npm run dev` needs no setup. In
    // production a missing password is a misconfiguration, and it must fail
    // CLOSED — silently serving the floor plan to the world is the one outcome
    // worth breaking the deployment over.
    if (process.env.NODE_ENV !== 'production') return NextResponse.next();
    return new NextResponse(
      'This deployment is not configured: APP_PASSWORD is unset.',
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  /**
   * Share links, checked after the misconfiguration guard above and before the
   * password below.
   *
   * After, because a production deployment with no APP_PASSWORD is broken and
   * must serve nothing at all — letting a token through would make a
   * misconfigured deploy quietly half-work, which is the failure mode the 503
   * exists to prevent.
   *
   * Before, because the whole point is that a recipient never meets the
   * browser's credential dialog.
   *
   * An unset token means no link opens the gate. It must never mean "any k= is
   * accepted", which is what the truthiness test guards: without it, a bare
   * `?k=` on a deployment with no token configured would compare '' against
   * undefined and let the world in.
   */
  if (shareToken) {
    const supplied = request.nextUrl.searchParams.get('k');
    if (supplied !== null && constantTimeEqual(supplied, shareToken)) {
      return allow(request, shareToken);
    }
    const cookie = request.cookies.get(SHARE_COOKIE)?.value;
    if (cookie !== undefined && constantTimeEqual(cookie, shareToken)) {
      return allow(request, null);
    }
  }

  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Basic ')) return unauthorized();

  const decoded = decodeBase64(header.slice(6).trim());
  if (decoded === null) return unauthorized();

  const separator = decoded.indexOf(':');
  if (separator < 0) return unauthorized();

  // Both comparisons always run — `&&` would short-circuit on a wrong username
  // and leak, by timing, that the username itself was correct.
  const userOk = constantTimeEqual(decoded.slice(0, separator), user);
  const passOk = constantTimeEqual(decoded.slice(separator + 1), password);
  if (!userOk || !passOk) return unauthorized();

  return allow(request, null);
}

export const config = {
  // Everything, including /_next/static, so the compiled geometry is gated too.
  matcher: '/:path*',
};
