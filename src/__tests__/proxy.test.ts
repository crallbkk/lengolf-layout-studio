import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { proxy } from '../proxy';

/**
 * The gate is the only thing standing between the public and the unit's traced
 * geometry, which is compiled into the JS chunks this matcher deliberately
 * covers. Share links now open it without a password, so the exact conditions
 * under which it opens are worth pinning down rather than reasoning about.
 */

const PASSWORD = 'correct horse battery staple';
/** Must clear MIN_SHARE_TOKEN_LENGTH, or the proxy correctly ignores it. */
const TOKEN = 'sharetoken-0123456789abcdef-0123456789';
const SHARE_COOKIE = 'lengolf_share';

const basic = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;

const req = (
  url: string,
  init: { auth?: string; cookie?: string } = {},
): NextRequest => {
  const headers = new Headers();
  if (init.auth) headers.set('authorization', init.auth);
  if (init.cookie) headers.set('cookie', init.cookie);
  return new NextRequest(new Request(url, { headers }));
};

const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.APP_PASSWORD = PASSWORD;
  process.env.NEXT_PUBLIC_SHARE_TOKEN = TOKEN;
  delete process.env.APP_USER;
});

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...ORIGINAL };
});

const isAllowed = (res: { status: number }) => res.status === 200;

describe('password gate', () => {
  it('rejects a request with no credentials', () => {
    const res = proxy(req('https://x.test/'));
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain('Basic');
  });

  it('rejects a wrong password', () => {
    const res = proxy(req('https://x.test/', { auth: basic('lengolf', 'nope') }));
    expect(res.status).toBe(401);
  });

  it('accepts the right credentials', () => {
    const res = proxy(req('https://x.test/', { auth: basic('lengolf', PASSWORD) }));
    expect(isAllowed(res)).toBe(true);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('does not hand a share cookie to a password login', () => {
    // Only a link grants the cookie. Otherwise every authenticated session
    // would silently mint one, and it would outlive a password rotation.
    const res = proxy(req('https://x.test/', { auth: basic('lengolf', PASSWORD) }));
    expect(res.cookies.get(SHARE_COOKIE)).toBeUndefined();
  });
});

describe('share links', () => {
  it('lets a valid token through without a password', () => {
    const res = proxy(req(`https://x.test/?k=${TOKEN}`));
    expect(isAllowed(res)).toBe(true);
  });

  it('swaps the token for a cookie, so the gated JS chunks load', () => {
    // The query parameter is only ever on the first request; every asset
    // request after it carries the cookie instead. Without this the page loads
    // and every chunk behind it 401s.
    const res = proxy(req(`https://x.test/?k=${TOKEN}`));
    const cookie = res.cookies.get(SHARE_COOKIE);
    expect(cookie?.value).toBe(TOKEN);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
    expect(cookie?.secure).toBe(true);
    expect(cookie?.path).toBe('/');
  });

  it('accepts the cookie on its own', () => {
    const res = proxy(
      req('https://x.test/_next/static/chunks/main.js', {
        cookie: `${SHARE_COOKIE}=${TOKEN}`,
      }),
    );
    expect(isAllowed(res)).toBe(true);
  });

  it('rejects a wrong token and a wrong cookie', () => {
    expect(proxy(req('https://x.test/?k=guess')).status).toBe(401);
    expect(
      proxy(req('https://x.test/', { cookie: `${SHARE_COOKIE}=guess` })).status,
    ).toBe(401);
  });

  it('rejects an empty token even though the env var is set', () => {
    expect(proxy(req('https://x.test/?k=')).status).toBe(401);
  });

  it('does not mark the cookie secure on plain http, so local dev works', () => {
    const res = proxy(req(`http://localhost:3000/?k=${TOKEN}`));
    expect(res.cookies.get(SHARE_COOKIE)?.secure).toBe(false);
  });

  it('grants no bypass at all when NEXT_PUBLIC_SHARE_TOKEN is unset', () => {
    // The dangerous failure would be treating "no token configured" as
    // "any k= is fine". An unset token must mean no link opens the gate.
    delete process.env.NEXT_PUBLIC_SHARE_TOKEN;
    expect(proxy(req('https://x.test/?k=')).status).toBe(401);
    expect(proxy(req(`https://x.test/?k=${TOKEN}`)).status).toBe(401);
    expect(proxy(req('https://x.test/?k=undefined')).status).toBe(401);
    expect(
      proxy(req('https://x.test/', { cookie: `${SHARE_COOKIE}=${TOKEN}` })).status,
    ).toBe(401);
  });

  it('still requires the password for everyone without a link', () => {
    expect(proxy(req('https://x.test/')).status).toBe(401);
    expect(proxy(req('https://x.test/_next/static/chunks/main.js')).status).toBe(401);
  });

  it('ignores a token too short to be a secret', () => {
    // A token of `demo` against an unthrottled edge function is not a secret.
    // Treating it as absent fails closed rather than opening the gate to a
    // guess, which is the safe direction for a misconfiguration.
    for (const weak of ['demo', 'share', 'lengolf', 'a'.repeat(23)]) {
      process.env.NEXT_PUBLIC_SHARE_TOKEN = weak;
      expect(proxy(req(`https://x.test/?k=${weak}`)).status).toBe(401);
    }
    process.env.NEXT_PUBLIC_SHARE_TOKEN = 'a'.repeat(24);
    expect(isAllowed(proxy(req(`https://x.test/?k=${'a'.repeat(24)}`)))).toBe(true);
  });

  it('forbids caching the one response that carries the credential', () => {
    const granted = proxy(req(`https://x.test/?k=${TOKEN}`));
    expect(granted.headers.get('Cache-Control')).toBe('private, no-store');
    // Cookie-authorised asset responses carry no credential, so they keep the
    // origin's own caching.
    const asset = proxy(
      req('https://x.test/_next/static/chunks/main.js', {
        cookie: `${SHARE_COOKIE}=${TOKEN}`,
      }),
    );
    expect(asset.headers.get('Cache-Control')).toBeNull();
  });

  it('marks the cookie secure in production regardless of the request protocol', () => {
    // Something upstream terminating TLS and forwarding plaintext must not
    // cause a bearer token to be issued without Secure.
    vi.stubEnv('NODE_ENV', 'production');
    const res = proxy(req(`http://x.test/?k=${TOKEN}`));
    expect(res.cookies.get(SHARE_COOKIE)?.secure).toBe(true);
  });
});

describe('misconfiguration', () => {
  it('leaves local dev open when APP_PASSWORD is unset', () => {
    delete process.env.APP_PASSWORD;
    expect(isAllowed(proxy(req('http://localhost:3000/')))).toBe(true);
  });

  it('fails closed in production when APP_PASSWORD is unset', () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.APP_PASSWORD;
    expect(proxy(req('https://x.test/')).status).toBe(503);
  });

  it('a share token alone does not open a production deployment with no password', () => {
    // APP_PASSWORD is what makes the deployment configured at all. A share link
    // must not turn a broken deploy into a half-working one — the 503 exists so
    // misconfiguration is loud rather than quietly permissive.
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.APP_PASSWORD;
    expect(proxy(req(`https://x.test/?k=${TOKEN}`)).status).toBe(503);
    expect(
      proxy(req('https://x.test/', { cookie: `${SHARE_COOKIE}=${TOKEN}` })).status,
    ).toBe(503);
  });
});
