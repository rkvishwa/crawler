#!/usr/bin/env node
/**
 * Runs the vote smoke test repeatedly: starts every INTERVAL_MS (default 30s ⇒ 2/min).
 * Each iteration is a **new Playwright process** so the browser profile is not reused.
 *
 * Use staging/localhost for loops. See tests/README.md.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const playwrightCli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');

const INTERVAL_MS = Math.max(
  5_000,
  Number(process.env.VOTE_SMOKE_LOOP_INTERVAL_MS || 30_000),
);

function warnIfProduction() {
  const raw = process.env.VOTE_SMOKE_BASE_URL || '';
  let host = '';
  try {
    host = new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname;
  } catch {
    return;
  }
  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.local');
  if (!isLocal) {
    console.warn(
      `[smoke-loop] Warning: VOTE_SMOKE_BASE_URL looks non-local (${host}). Loops can stress production; prefer staging.`,
    );
  }
}

function runOnce() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [playwrightCli, 'test', 'tests/buildathon-vote-smoke.spec.ts'],
      {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env },
      },
    );
    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({ code: code ?? 1, signal });
    });
  });
}

async function main() {
  warnIfProduction();
  if (!process.env.VOTE_SMOKE_BASE_URL?.trim()) {
    console.error('Set VOTE_SMOKE_BASE_URL (see .env.example).');
    process.exit(1);
  }

  console.log(
    `[smoke-loop] Interval between starts: ${INTERVAL_MS}ms (Ctrl+C to stop)`,
  );

  let nextStart = Date.now();

  for (;;) {
    const now = Date.now();
    const wait = Math.max(0, nextStart - now);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    nextStart = Date.now() + INTERVAL_MS;

    const t0 = Date.now();
    console.log(`\n[smoke-loop] === run at ${new Date().toISOString()} ===`);
    const { code, signal } = await runOnce();
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `[smoke-loop] finished in ${elapsed}s exit=${code}${signal ? ` signal=${signal}` : ''}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
