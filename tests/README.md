# Vote flow smoke tests

## Staging and load testing

- **Single-run smoke** against production is the maximum automated use case that stays clearly non-abusive.
- **Any repeated, concurrent, or “load” style testing** must use **staging**, **localhost**, or an **organizer-provided test mode** with isolated tallies. Do not point loops, crons, or worker pools at the public production vote URL.
- Copy `.env.example` to `.env` and set `VOTE_SMOKE_BASE_URL` to your target **origin** only (no path).

## Run

```bash
npm install
npx playwright install chromium
# No space after `=`. Use origin only, or paste the full /buildathon/vote URL (path is stripped).
export VOTE_SMOKE_BASE_URL=https://your-origin.example.com
npm run test:smoke
```

The live `/buildathon/vote` page is the showcase itself (there is no separate `role="tab"` named “Voting”—only links like Portal and Standings).

Authentication, CAPTCHAs, or bot checks may cause the spec to fail until you add storage state or test accounts—only do that on non-prod or with organizer approval.

## Server-side checks (organizers / backend)

This repo does not include the buildathon API. When testing or implementing vote limits on **your** backend, cover at least:

- Reject duplicate votes from the same **authenticated user** or stable **session**.
- Enforce **cooldown** or **per-window** limits per IP/device if that matches product rules.
- Validate **“subscribed”** (or similar) server-side; do not trust the checkbox alone.
- Return **4xx** with stable error codes for abuse; log **audit** fields (user id, IP hash, project id).

Point integration tests at **staging** APIs with synthetic users.

## No production flood

There is **intentionally** no script, loop, or scheduler in this repo that submits many votes. Extending the smoke spec to run in a loop against production would violate that policy.
