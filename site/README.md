# HyperGaaS — site (landing page + docs)

Internal scaffold. **Not yet published. Not deployed.** This is the Next.js app shell
for the v0.1 landing page. It lives on the `scaffold/day-0-init` feature branch and is
gated behind the externalization `approve` batch (see `inbox/pending.jsonl`).

## What this is

An empty section skeleton matching the five-section v0.1 landing-page structure from
`coordinator/directives/2026-05-21-externalization.md` § "Landing page v0.1". The
sections exist as placeholder components with `TODO(gtm)` markers — **no copy is written
here.** The GTM cycle writes the prose in its inaugural dispatch, post-batch-approval.

## Sections (v0.1, in order)

1. **Hero** — value prop, one `@agentAction()` code snippet, two CTAs (`npm install` + GitHub).
2. **Why this exists** — the SaaS multi-tenant gap; OpenAI named directly per marketing CONTEXT.
3. **5-minute quickstart** — install + decorator + `createAgentContext(tenantId, userId)` + invoke.
4. **What it isn't** — defensive framing ("not a workflow engine — the SaaS integration layer for one").
5. **Docs / GitHub** — docs link + GitHub star badge.

## Aesthetic (per the directive)

One font (Geist / Inter), one accent color, generous whitespace, monospace for code blocks.
Lovable/Cursor aesthetic. No stock photography. No robot illustrations.

## Status

- `auto`-tier internal scaffolding only. Feature branch (`scaffold/day-0-init`), no commit to `main`.
- Not deployed, not published. Vercel hosting is gated on the `approve` batch.
- Tagline lean (GTM input, not locked here): "The agent stack for SaaS that's already shipped."

## Local dev (once deps are installed post-approval)

```
pnpm install
pnpm --filter @hypergaas/site dev
```

Dependencies are declared but **not installed** in this scaffold — installing Next.js is
deferred until the externalization batch is approved and the monorepo restructure lands.
