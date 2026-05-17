#!/usr/bin/env node
/**
 * POST { "slug": "<slug>" } to the buildathon vote cast API (same as the browser flow).
 *
 * The server issues `bv_token` (HttpOnly cookie in responses). To capture it automatically:
 *   • `npm run cast-vote:playwright` — Playwright HTTP client + shared jar (no browser).
 *   • Or run this script without BV_TOKEN and parse Set-Cookie: `CAST_VOTE_SHOW_TOKEN=1`
 *
 * Usage:
 *   export BV_TOKEN='uuid-from-browser-cookie'
 *   node scripts/cast-vote.mjs
 *   node scripts/cast-vote.mjs knurdz-metl-faqa
 *
 * Env:
 *   VOTE_CAST_URL  — default https://buildathon.cursorsrilanka.com/api/buildathon/vote/cast
 *   VOTE_SLUG      — default knurdz-metl-faqa
 *   BV_TOKEN       — optional; sent as Cookie: bv_token=<value>
 *                    Use BV_TOKEN=random to send a new crypto.randomUUID() each run.
 *   CAST_VOTE_RANDOM_BV_TOKEN=1 — same as BV_TOKEN=random (overrides BV_TOKEN)
 *   CAST_VOTE_SHOW_TOKEN=1 — print bv_token parsed from response Set-Cookie (stderr)
 */

import crypto from 'node:crypto';
import process from 'node:process';

const DEFAULT_URL =
  'https://buildathon.cursorsrilanka.com/api/buildathon/vote/cast';
const DEFAULT_SLUG = 'knurdz-metl-faqa';

const castUrl = process.env.VOTE_CAST_URL?.trim() || DEFAULT_URL;
const slug =
  (process.argv[2] && process.argv[2].trim()) ||
  process.env.VOTE_SLUG?.trim() ||
  DEFAULT_SLUG;

const forceRandom = process.env.CAST_VOTE_RANDOM_BV_TOKEN === '1';
const envBv = process.env.BV_TOKEN?.trim();
let bvToken;
if (forceRandom || /^random$/i.test(envBv ?? '')) {
  bvToken = crypto.randomUUID();
  console.error(`[cast-vote] generated bv_token=${bvToken}`);
} else {
  bvToken = envBv;
}

const origin = new URL(castUrl).origin;

/** Align with same-origin XHR/fetch from /buildathon/vote (browser capture). */
const headers = {
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Content-Type': 'application/json',
  Origin: origin,
  Referer: `${origin}/buildathon/vote`,
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
};

if (bvToken) {
  headers.Cookie = `bv_token=${bvToken}`;
}

const body = JSON.stringify({ slug });

function bvTokenFromSetCookie(res) {
  const list = res.headers.getSetCookie?.() ?? [];
  for (const line of list) {
    const m = /^bv_token=([^;]+)/.exec(line);
    if (m) return decodeURIComponent(m[1]);
  }
  return undefined;
}

async function main() {
  const res = await fetch(castUrl, {
    method: 'POST',
    headers,
    body,
  });

  const responseText = await res.text();

  console.error(`HTTP ${res.status} ${res.statusText}`);
  const interesting = [
    'content-type',
    'set-cookie',
    'cache-control',
    'x-matched-path',
    'x-vercel-id',
  ];
  for (const name of interesting) {
    const v = res.headers.get(name);
    if (v) console.error(`${name}: ${v}`);
  }

  const issued = bvTokenFromSetCookie(res);
  if (issued && process.env.CAST_VOTE_SHOW_TOKEN === '1') {
    console.error(`bv_token (parsed)=${issued}`);
  }

  console.log(responseText);
  if (!res.ok) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
