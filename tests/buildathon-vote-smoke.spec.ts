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
 * Single happy-path smoke: no loops, no counters, no schedulers.
 * Do not use this spec (or copies of it) to submit many votes on production.
 */
test.describe('Buildathon vote flow (single run)', () => {
  test.beforeAll(() => {
    const origin = normalizeVoteSmokeBaseUrl(process.env.VOTE_SMOKE_BASE_URL);
    test.skip(
      !origin,
      'Set VOTE_SMOKE_BASE_URL to the site origin (see .env.example). No space after =.',
    );
  });

  test('Vote page → project card → vote → return → confirm', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const origin = normalizeVoteSmokeBaseUrl(process.env.VOTE_SMOKE_BASE_URL)!;

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

    await voteDialog
      .getByRole('button', { name: /confirm\s*&\s*vote|confirm & vote/i })
      .click();

    await expect(
      page.getByText(/thank|success|voted|confirmed/i).first(),
    ).toBeVisible({ timeout: 60_000 });
  });
});
