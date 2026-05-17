#!/usr/bin/env node
/**
 * Auto-obtain `bv_token` using Playwright’s **APIRequestContext** (no browser UI).
 * Flow: GET /buildathon/vote → POST /api/buildathon/vote/cast with the same cookie jar
 * so Set-Cookie from the API is stored and sent automatically — no manual UUID copy.
 *
 * (Uses the `playwright` package’s HTTP client only; Chromium is not launched.)
 *
 * Shell note: do not paste placeholder text like `<uuid>` into zsh — `<...>` is redirection.
 * Run only: `export VOTE_SMOKE_BASE_URL=...` then `npm run cast-vote:playwright`
 *
 * Usage:
 *   export VOTE_SMOKE_BASE_URL=https://buildathon.cursorsrilanka.com
 *   npm run cast-vote:playwright
 *   node scripts/cast-vote-playwright.mjs knurdz-metl-faqa
 *
 * Env:
 *   VOTE_SMOKE_BASE_URL  — origin only
 *   VOTE_SLUG            — default knurdz-metl-faqa
 *   CAST_VOTE_PRINT_TOKEN=0 — disable bv_token lines on stderr (default: print)
 *   CAST_VOTE_SKIP_NAVIGATE=1 — skip GET /buildathon/vote (only POST; token still issued on response)
 *   CAST_VOTE_RANDOM_BV_TOKEN=0 — disable starting each run with a new crypto.randomUUID() cookie
 *       (default: 1 — pre-seed bv_token so every invocation is a fresh client id before GET/POST)
 */

import crypto from 'node:crypto';
import process from 'node:process';
import { request } from 'playwright';

function normalizeOrigin(raw) {
  if (!raw?.trim()) return undefined;
  let s = raw.trim().replace(/\/$/, '');
  if (s.endsWith('/buildathon/vote')) {
    s = s.slice(0, -'/buildathon/vote'.length);
  }
  return s.replace(/\/$/, '') || undefined;
}

const DEFAULT_ORIGIN = 'https://buildathon.cursorsrilanka.com';

const origin =
  normalizeOrigin(process.env.VOTE_SMOKE_BASE_URL) || DEFAULT_ORIGIN;
const slug =
  (process.argv[2] && process.argv[2].trim()) ||
  process.env.VOTE_SLUG?.trim() ||
  'knurdz-metl-faqa';

const votePath = '/buildathon/vote';
const castPath = '/api/buildathon/vote/cast';

const printToken = process.env.CAST_VOTE_PRINT_TOKEN !== '0';
const skipNavigate = process.env.CAST_VOTE_SKIP_NAVIGATE === '1';
/** New random bv_token each run unless explicitly disabled. */
const useRandomBvToken =
  process.env.CAST_VOTE_RANDOM_BV_TOKEN !== '0' &&
  process.env.CAST_VOTE_RANDOM_BV_TOKEN !== 'false';

async function main() {
  const host = new URL(origin).hostname;
  const generated = useRandomBvToken ? crypto.randomUUID() : null;
  if (printToken && generated) {
    console.error(`[cast-vote-playwright] generated bv_token=${generated}`);
  }

  const ctx = await request.newContext({
    baseURL: origin,
    ...(generated
      ? {
          storageState: {
            cookies: [
              {
                name: 'bv_token',
                value: generated,
                domain: host,
                path: '/',
                expires: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
                httpOnly: false,
                secure: origin.startsWith('https:'),
                sameSite: 'Lax',
              },
            ],
          },
        }
      : {}),
    extraHTTPHeaders: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
    },
  });

  try {
    if (!skipNavigate) {
      await ctx.get(votePath, { timeout: 90_000 });
    }

    const response = await ctx.post(castPath, {
      data: { slug },
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Referer: `${origin}${votePath}`,
      },
    });

    const storage = await ctx.storageState();
    const tok = storage.cookies.find((c) => c.name === 'bv_token');
    if (printToken) {
      console.error(`[cast-vote-playwright] bv_token=${tok?.value ?? '(none)'}`);
    }

    console.error(`HTTP ${response.status()} ${response.statusText()}`);
    const text = await response.text();
    console.log(text);

    if (!response.ok()) {
      process.exitCode = 1;
    }
  } finally {
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
