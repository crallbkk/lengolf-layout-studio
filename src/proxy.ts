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

export function proxy(request: NextRequest): NextResponse {
  const password = process.env.APP_PASSWORD;
  const user = process.env.APP_USER || DEFAULT_USER;

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

  const response = NextResponse.next();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const config = {
  // Everything, including /_next/static, so the compiled geometry is gated too.
  matcher: '/:path*',
};
