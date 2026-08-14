import { expect, Page, test } from '@playwright/test';

const publicRoutes = [
  '/',
  '/features',
  '/publishing',
  '/calendar',
  '/product/analytics',
  '/engagement',
  '/api-docs',
  '/agencies',
  '/pricing',
  '/reliability',
  '/status',
  '/compare/ayrshare',
  '/compare/buffer',
  '/compare/hootsuite',
  '/compare/bundle-social',
  '/for-agencies',
  '/for-multi-brand',
  '/for-creator-networks',
  '/for-developers',
  '/integrations',
  '/integrations/n8n',
  '/integrations/make',
  '/integrations/mcp',
  '/about',
  '/security',
  '/contact',
  '/privacy',
  '/terms',
  '/acceptable-use',
  '/data-deletion',
];

const mobileMarketingRoutes = [
  '/pricing',
  '/reliability',
  '/product/analytics',
  '/compare/ayrshare',
  '/for-agencies',
  '/integrations',
];

function collectRuntimeFailures(page: Page) {
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    const requestUrl = new URL(response.url());
    if (
      requestUrl.origin ===
        new URL(page.url() || 'http://127.0.0.1:4200').origin &&
      response.status() >= 500
    ) {
      serverErrors.push(`${response.status()} ${requestUrl.pathname}`);
    }
  });

  return { pageErrors, serverErrors };
}

test.describe('Publishly public experience', () => {
  for (const route of publicRoutes) {
    test(`${route} renders without browser or server errors`, async ({
      page,
    }) => {
      const failures = collectRuntimeFailures(page);
      const response = await page.goto(route, { waitUntil: 'networkidle' });

      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(/Publishly/i);
      await expect(page.locator('main').first()).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Publishly' }).first()
      ).toBeVisible();
      expect(failures.pageErrors).toEqual([]);
      expect(failures.serverErrors).toEqual([]);
    });
  }

  test('mobile navigation is usable and the page does not overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'networkidle' });

    const menu = page.getByRole('button', { name: 'Open menu' });
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(
      page.getByRole('button', { name: 'Close menu' })
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.locator('.mk-mobile-panel').getByRole('link', { name: 'Pricing' })
    ).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  });

  for (const route of mobileMarketingRoutes) {
    test(`${route} is usable on a phone without horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const response = await page.goto(route, { waitUntil: 'networkidle' });

      expect(response?.status()).toBe(200);
      await expect(page.locator('main').first()).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
    });
  }

  test('the reliability promise is backed by proof on the page', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    await expect(
      page.getByRole('heading', { name: 'Nothing fails silently. Ever.' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Open public status/i }).first()
    ).toBeVisible();
    await expect(page.locator('.mk-term')).toContainText('post.receipt');
    await expect(page.locator('.mk-term')).toContainText('confirmed_live');
    await expect(page.locator('.mk-term')).toContainText('rate_limited');

    await page.goto('/status', { waitUntil: 'networkidle' });
    await expect(page).toHaveTitle(/status/i);
    await expect(
      page.getByRole('heading', {
        name: 'Reliability, with the numbers attached.',
      })
    ).toBeVisible();
  });

  test('the desktop hero is full bleed while its content keeps safe gutters', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 2560, height: 1200 });
    await page.goto('/', { waitUntil: 'networkidle' });

    const panel = page.locator('.mk-hero-panel');
    const stage = page.locator('.mk-hero-stage');
    const panelBox = await panel.boundingBox();
    const stageBox = await stage.boundingBox();
    const contentCanvasWidth = await page.evaluate(
      () => document.body.clientWidth
    );

    expect(panelBox?.x || 0).toBeLessThanOrEqual(1);
    expect(
      Math.abs((panelBox?.width || 0) - contentCanvasWidth)
    ).toBeLessThanOrEqual(1);
    expect((stageBox?.width || 0) / contentCanvasWidth).toBeGreaterThanOrEqual(
      0.8
    );
    expect(stageBox?.x || 0).toBeGreaterThanOrEqual(24);
    const navigationWordmark = page
      .locator('.mk-nav .mk-nav-logo .mk-wordmark')
      .first();
    await expect(navigationWordmark.locator('img')).toHaveCount(0);
    await expect(navigationWordmark.locator('.mk-wordmark-text')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)'
    );
    expect(
      await panel.evaluate((element) => ({
        radius: getComputedStyle(element).borderRadius,
        shadow: getComputedStyle(element).boxShadow,
      }))
    ).toEqual({ radius: '0px', shadow: 'none' });
  });

  test('the fresh account-health dot pulses unless reduced motion is requested', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const freshDot = page.locator('.mk-health-live i');
    await freshDot.scrollIntoViewIfNeeded();
    await expect(freshDot).toBeVisible();
    await expect(freshDot).toHaveCSS('animation-name', 'mk-health-live-flash');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(freshDot).toHaveCSS('animation-name', 'none');
  });

  test('the analytics preview exposes readable values and source context', async ({
    page,
  }) => {
    await page.goto('/product/analytics', { waitUntil: 'networkidle' });

    const preview = page.locator('.mkr-ana-root');
    await preview.scrollIntoViewIfNeeded();
    await expect(preview).toBeVisible();
    await expect(preview.getByText('Demo data', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(preview.getByText('8,620', { exact: true })).toBeVisible();
    await expect(
      preview.getByText('Meta Graph API', { exact: true })
    ).toBeVisible();
    await expect(
      preview.getByText('Unavailable', { exact: true })
    ).toBeVisible();

    expect(
      await preview.evaluate((element) =>
        getComputedStyle(element).backgroundColor.toLowerCase()
      )
    ).toBe('rgb(12, 28, 49)');

    const bars = preview.locator('.mkr-ana-bar');
    await expect(bars).toHaveCount(7);
    for (let index = 0; index < 7; index += 1) {
      const box = await bars.nth(index).boundingBox();
      expect(box?.width || 0).toBeGreaterThan(5);
      expect(box?.height || 0).toBeGreaterThan(35);
      expect(
        await bars
          .nth(index)
          .evaluate((element) =>
            getComputedStyle(element).backgroundImage.toLowerCase()
          )
      ).not.toBe('none');
    }
  });

  test('the growth calculator updates real published price math', async ({
    page,
  }) => {
    await page.goto('/pricing', { waitUntil: 'networkidle' });

    const accounts = page.getByLabel(
      'Connected brand, client, or location accounts'
    );
    await expect(accounts).toHaveValue('100');
    await expect(
      page
        .locator('.mk-plan')
        .filter({ hasText: 'Ayrshare' })
        .locator('.mk-plan-price')
    ).toContainText('$1,228.30');
    await expect(
      page
        .locator('.mk-plan')
        .filter({ hasText: 'Buffer' })
        .locator('.mk-plan-price')
    ).toContainText('$1,200');

    await accounts.fill('30');
    await expect(page.getByText('30 accounts', { exact: true })).toBeVisible();
    await expect(
      page
        .locator('.mk-plan')
        .filter({ hasText: 'Buffer' })
        .locator('.mk-plan-price')
    ).toContainText('$360');
  });
});

test.describe('Publishly authentication entry points', () => {
  test('signup and login forms expose the required controls', async ({
    page,
  }) => {
    await page.goto('/auth', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Sign Up' })).toBeVisible();
    await expect(page.getByPlaceholder('Email Address')).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toBeVisible();
    await expect(page.getByPlaceholder('Company')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create Account' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Terms of Service' })
    ).toHaveAttribute('href', '/terms');
    await expect(
      page.getByRole('link', { name: 'Privacy Policy' })
    ).toHaveAttribute('href', '/privacy');

    await page.goto('/auth/login', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Forgot password' })
    ).toHaveAttribute('href', '/auth/forgot');
  });

  test('a customer can create a fresh account through the browser', async ({
    page,
  }) => {
    const failures = collectRuntimeFailures(page);
    const unique = Date.now();
    const email = `browser-${unique}@test.publishly.invalid`;
    const password = 'Str0ngPassw0rd!browser';

    await page.goto('/auth', { waitUntil: 'networkidle' });
    await page.getByPlaceholder('Email Address').fill(email);
    await page.getByPlaceholder('Password').fill(password);
    await page.getByPlaceholder('Company').fill(`Browser E2E ${unique}`);
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page).toHaveURL(
      /\/(auth\/(login|activate)|launches)([/?]|$)/,
      {
        timeout: 30_000,
      }
    );

    // Credential-independent billing must render the same four public plan
    // names that the backend uses to resolve Stripe checkout prices.
    if (new URL(page.url()).pathname === '/launches') {
      await page.goto('/billing', { waitUntil: 'networkidle' });
      for (const plan of ['Starter', 'Growth', 'Scale']) {
        await expect(
          page.getByText(plan, { exact: true }).first()
        ).toBeVisible();
      }
    }

    // Prove the returning-user path too. Registration reaching the dashboard
    // cannot conceal a broken cookie clear, rejected-credential message, or
    // ordinary local login.
    await page.goto('/auth/logout', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/auth\/login([/?]|$)/);

    await page.getByPlaceholder('Email Address').fill(email);
    await page.getByPlaceholder('Password').fill(`${password}-wrong`);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Invalid user name or password')).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login([/?]|$)/);

    await page.getByPlaceholder('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/launches([/?]|$)/, { timeout: 30_000 });
    await expect(
      page.getByRole('link', { name: 'Fleet Health' })
    ).toBeVisible();

    expect(failures.pageErrors).toEqual([]);
    expect(failures.serverErrors).toEqual([]);
  });
});
