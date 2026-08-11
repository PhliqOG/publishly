import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCookieUrlFromDomain } from '@gitroom/helpers/subdomain/subdomain.management';
import { internalFetch } from '@gitroom/helpers/utils/internal.fetch';
import acceptLanguage from 'accept-language';
import {
  cookieName,
  headerName,
  languages,
} from '@gitroom/react/translation/i18n.config';
acceptLanguage.languages(languages);

// This function can be marked `async` if using `await` inside
export async function proxy(request: NextRequest) {
  const nextUrl = request.nextUrl;
  const authCookie =
    request.cookies.get('auth') ||
    request.headers.get('auth') ||
    nextUrl.searchParams.get('loggedAuth');
  const lng = request.cookies.has(cookieName)
    ? acceptLanguage.get(request.cookies.get(cookieName).value)
    : acceptLanguage.get(
        request.headers.get('Accept-Language') ||
          request.headers.get('accept-language')
      );

  const requestHeaders = new Headers(request.headers);
  if (lng) {
    requestHeaders.set(headerName, lng);
  }

  const topResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (lng) {
    topResponse.headers.set(cookieName, lng);
  }

  if (nextUrl.pathname.startsWith('/modal/') && !authCookie) {
    return NextResponse.redirect(new URL(`/auth/login-required`, nextUrl.href));
  }

  if (nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/auth/login', nextUrl.href));
  }
  if (nextUrl.pathname === '/signup') {
    return NextResponse.redirect(new URL('/auth', nextUrl.href));
  }

  // `/analytics` is the signed-in dashboard and the public product page. Keep
  // one canonical URL while rewriting logged-out visitors to the marketing
  // implementation, avoiding two conflicting App Router routes.
  if (nextUrl.pathname === '/analytics' && !authCookie) {
    const marketingAnalytics = nextUrl.clone();
    marketingAnalytics.pathname = '/product/analytics';
    return NextResponse.rewrite(marketingAnalytics);
  }

  if (
    nextUrl.pathname.startsWith('/uploads/') ||
    nextUrl.pathname.startsWith('/p/') ||
    nextUrl.pathname.startsWith('/provider/') ||
    nextUrl.pathname.startsWith('/icons/')
  ) {
    return topResponse;
  }

  if (
    nextUrl.pathname.startsWith('/integrations/social/') &&
    nextUrl.href.indexOf('state=login') === -1
  ) {
    return topResponse;
  }

  // If the URL is logout, delete the cookie and redirect to login
  if (nextUrl.href.indexOf('/auth/logout') > -1) {
    const response = NextResponse.redirect(
      new URL('/auth/login', nextUrl.href)
    );
    response.cookies.set('auth', '', {
      path: '/',
      ...(!process.env.NOT_SECURED
        ? {
            secure: true,
            httpOnly: true,
            sameSite: false,
          }
        : {}),
      maxAge: -1,
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
    });
    return response;
  }

  if (
    nextUrl.pathname.startsWith('/auth/register') &&
    process.env.DISABLE_REGISTRATION === 'true'
  ) {
    return NextResponse.redirect(new URL('/auth/login', nextUrl.href));
  }

  // Public marketing site: reachable logged-out. Signed-in visitors hitting
  // '/' fall through to the app redirect below; other marketing pages stay
  // viewable either way.
  //
  // Prefix entries cover whole route families (/compare/ayrshare,
  // /docs/errors/<code>, /platforms/<network>, ...) so adding a marketing page
  // never silently 307s anonymous visitors — including crawlers — to /auth.
  // proxy.spec.ts asserts every route in app/sitemap.ts is public.
  const marketingPaths = [
    '/',
    '/features',
    '/publishing',
    '/calendar',
    '/product/analytics',
    '/engagement',
    '/api-docs',
    '/agencies',
    '/pricing',
    '/about',
    '/contact',
    '/security',
    '/terms',
    '/privacy',
    '/data-deletion',
    '/acceptable-use',
    '/source',
    '/reliability',
    '/changelog',
    '/robots.txt',
    '/sitemap.xml',
  ];
  const marketingPrefixes = [
    '/compare',
    '/methodology',
    '/for-',
    '/integrations',
    '/resources',
    '/docs',
    '/platforms',
  ];
  // /integrations/social/<provider> is the authenticated connect flow, not a
  // marketing page — it must keep its auth redirect.
  const appRouteExceptions = ['/integrations/social'];
  // A prefix ending in '-' matches by string ('/for-' covers '/for-agencies');
  // any other prefix matches on a path boundary, so '/docs' can never swallow
  // a future '/docsomething'.
  const underPrefix = (path: string, prefix: string) =>
    path === prefix ||
    path.startsWith(prefix.endsWith('-') ? prefix : `${prefix}/`);
  const isMarketing =
    !appRouteExceptions.some((prefix) =>
      underPrefix(nextUrl.pathname, prefix)
    ) &&
    (marketingPaths.includes(nextUrl.pathname) ||
      marketingPrefixes.some((prefix) =>
        underPrefix(nextUrl.pathname, prefix)
      ));
  if (isMarketing) {
    if (!authCookie || nextUrl.pathname !== '/') {
      return topResponse;
    }
  }

  const org = nextUrl.searchParams.get('org');
  const url = new URL(nextUrl).search;
  if (!nextUrl.pathname.startsWith('/auth') && !authCookie) {
    const providers = ['google', 'settings'];
    const findIndex = providers.find((p) => nextUrl.href.indexOf(p) > -1);
    const additional = !findIndex
      ? ''
      : (url.indexOf('?') > -1 ? '&' : '?') +
        `provider=${(findIndex === 'settings'
          ? process.env.POSTIZ_GENERIC_OAUTH
            ? 'generic'
            : 'github'
          : findIndex
        ).toUpperCase()}`;
    return NextResponse.redirect(
      new URL(`/auth${url}${additional}`, nextUrl.href)
    );
  }

  // If the url is /auth and the cookie exists, redirect to /
  if (nextUrl.pathname.startsWith('/auth') && authCookie) {
    return NextResponse.redirect(new URL(`/${url}`, nextUrl.href));
  }
  if (nextUrl.pathname.startsWith('/auth') && !authCookie) {
    if (org) {
      const redirect = NextResponse.redirect(new URL(`/`, nextUrl.href));
      redirect.cookies.set('org', org, {
        ...(!process.env.NOT_SECURED
          ? {
              path: '/',
              secure: true,
              httpOnly: true,
              sameSite: false,
              domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
            }
          : {}),
        expires: new Date(Date.now() + 15 * 60 * 1000),
      });
      return redirect;
    }
    return topResponse;
  }
  try {
    if (org) {
      const { id } = await (
        await internalFetch('/user/join-org', {
          body: JSON.stringify({
            org,
          }),
          method: 'POST',
        })
      ).json();
      const redirect = NextResponse.redirect(
        new URL(`/?added=true`, nextUrl.href)
      );
      if (id) {
        redirect.cookies.set('showorg', id, {
          ...(!process.env.NOT_SECURED
            ? {
                path: '/',
                secure: true,
                httpOnly: true,
                sameSite: false,
                domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
              }
            : {}),
          expires: new Date(Date.now() + 15 * 60 * 1000),
        });
      }
      return redirect;
    }
    if (nextUrl.pathname === '/') {
      return NextResponse.redirect(
        new URL(
          !!process.env.IS_GENERAL ? '/launches' : `/analytics`,
          nextUrl.href
        )
      );
    }

    return topResponse;
  } catch (err) {
    console.log('err', err);
    return NextResponse.redirect(new URL('/auth/logout', nextUrl.href));
  }
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: '/((?!api/|_next/|_static/|_vercel|[\\w-]+\\.\\w+).*)',
};
