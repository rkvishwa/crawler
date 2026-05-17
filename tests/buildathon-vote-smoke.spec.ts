import { test, expect, type Locator, type Page } from '@playwright/test';

const PROJECT_PATH_FRAGMENT = 'knurdz-metl-faqa';

/** Accept origin or full /buildathon/vote URL; env must have no spaces around '='. */
function normalizeVoteSmokeBaseUrl(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  let s = raw.trim().replace(/\/$/, '');
  if (s.endsWith('/buildathon/vote')) {
    s = s.slice(0, -'/buildathon/vote'.length);
  }
  return s.replace(/\/$/, '') || undefined;
}

/**
 * Step 1 opens TechTalk360 (often in a new tab). Close popup or go back so the
 * honor-system gate can enable step 2.
 */
async function clickOpenChannelAndReturn(page: Page, dialog: Locator) {
  const open = dialog.getByRole('button', { name: /open the channel/i });
  await expect(open).toBeVisible({ timeout: 15_000 });

  const newTabPromise = page.context().waitForEvent('page');
  await open.click();

  const newTab = await Promise.race([
    newTabPromise,
    new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), 8_000),
    ),
  ]);

  if (newTab) {
    await newTab.waitForLoadState('domcontentloaded');
    await newTab.close();
    return;
  }

  if (/youtube\.com|youtu\.be/i.test(page.url())) {
    await page.goBack({ waitUntil: 'domcontentloaded' });
  }
}

/**
 * Happy-path smoke. Use `npm run test:smoke:loop` for ~2 runs/min (new process each time).
 * Do not schedule loops against production (see tests/README.md).
 */
async function runVoteFlow(page: Page, origin: string) {
  await page.goto(`${origin}/buildathon/vote`, {
    waitUntil: 'domcontentloaded',
  });

  // /buildathon/vote is already the showcase; nav uses links (Portal, Standings), not a "Voting" tab.
  await expect(
    page.getByRole('heading', { name: /pick the build/i }),
  ).toBeVisible({ timeout: 30_000 });

  // Scope to `article` so we never pick the first list card (XPath //* can match `body`).
  const card = page
    .getByRole('article')
    .filter({ has: page.locator(`a[href*="${PROJECT_PATH_FRAGMENT}"]`) })
    .first();
  await expect(card).toBeVisible({ timeout: 45_000 });
  await card.scrollIntoViewIfNeeded();

  const voteButton = card.getByRole('button', { name: 'Vote for this project' });
  await expect(voteButton).toBeVisible({ timeout: 15_000 });
  await voteButton.click();

  const voteDialog = page.getByRole('dialog', {
    name: /subscribe to techtalk/i,
  });
  await expect(voteDialog).toBeVisible({ timeout: 15_000 });

  await clickOpenChannelAndReturn(page, voteDialog);

  await expect.poll(() => new URL(page.url()).origin, {
    timeout: 20_000,
  }).toBe(origin);

  const subscribed = voteDialog.getByRole('checkbox', {
    name: /yes,\s*i subscribed/i,
  });
  await expect(subscribed).toBeEnabled({ timeout: 90_000 });
  await subscribed.check();

  const confirmButton = voteDialog.getByRole('button', {
    name: /confirm\s*&\s*vote|confirm & vote/i,
  });

  if (process.env.VOTE_SMOKE_ASSERT_VOTE_POST === '1') {
    // Ensures a same-origin POST succeeds — reduces false greens from UI-only “success”.
    const postOk = page.waitForResponse(
      (response) => {
        if (response.request().method() !== 'POST') return false;
        const url = response.url();
        if (/google|analytics|doubleclick|facebook|gtm|hotjar|clarity|sentry/i.test(url)) {
          return false;
        }
        const status = response.status();
        if (status < 200 || status >= 300) return false;
        try {
          return url.startsWith(new URL(page.url()).origin);
        } catch {
          return false;
        }
      },
      { timeout: 60_000 },
    );
    await Promise.all([postOk, confirmButton.click()]);
  } else {
    await confirmButton.click();
  }

  await expect(
    page.getByText(/thank|success|voted|confirmed/i).first(),
  ).toBeVisible({ timeout: 60_000 });
}

test.describe('Buildathon vote flow (single run)', () => {
  test.beforeAll(() => {
    const origin = normalizeVoteSmokeBaseUrl(process.env.VOTE_SMOKE_BASE_URL);
    test.skip(
      !origin,
      'Set VOTE_SMOKE_BASE_URL to the site origin (see .env.example). No space after =.',
    );
  });

  test('Vote page → project card → vote → return → confirm', async ({ browser }) => {
    test.setTimeout(180_000);
    const origin = normalizeVoteSmokeBaseUrl(process.env.VOTE_SMOKE_BASE_URL)!;

    // Explicit new context so each run is a fresh session (no shared cookies/storage).
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await runVoteFlow(page, origin);
    } finally {
      await context.close();
    }
  });
});
