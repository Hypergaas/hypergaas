// Section 1 — Hero.
// Directive spec: one-sentence value prop, ONE @agentAction() code snippet
// (decorator on an existing service method, showing zero parallel schemas),
// two CTAs (npm install + GitHub link).
// Copy + the exact snippet are GTM's. This is the structural shell only.
// HyperGaaS — the agent stack for SaaS that's already shipped.
const HERO_SNIPPET = `class JobService {
  @agentAction({
    description: "Get a technician's schedule for a given date",
    reversibility: "idempotent",
    requiredPermissions: ["schedule:read"],
    audienceRoles: ["dispatcher", "owner", audience.self((ctx, p) => ctx.userId === p.techId)],
    costWeight: 1,
  })
  async getTechSchedule(ctx: AgentContext, params: { techId: string; date: Date }) {
    // ctx.tenantId is injected and validated. Permissions pre-checked.
    // Audit log written. Tool schema derived from these types — no parallel copy.
    return this.db.schedule.find({ tenantId: ctx.tenantId, ...params });
  }
}`;

export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="flex flex-col gap-8">
      <h1 id="hero-heading" className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Add agents to your SaaS — without rewriting your service layer.
      </h1>

      <p className="max-w-2xl text-lg text-neutral-600">
        HyperGaaS is the agent stack for SaaS that&apos;s already shipped. Annotate a
        service method you already have. The SDK derives the tool schema from your
        TypeScript types, scopes every call to the right tenant, checks permissions,
        writes the audit log, and pauses irreversible actions for approval — from one
        decorator, in the file your business logic already lives in.
      </p>

      {/* The whole pitch in one decorator: an existing method, made agent-callable,
          with zero parallel schemas and zero hand-rolled tenant/permission/audit plumbing. */}
      <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-4 font-mono text-sm text-neutral-100">
        <code>{HERO_SNIPPET}</code>
      </pre>

      <div className="flex flex-wrap items-center gap-4">
        {/* Primary CTA — the install command, leading to the quickstart. */}
        <a
          href="#quickstart"
          className="rounded-md bg-accent px-5 py-2.5 font-mono font-medium text-accent-fg"
        >
          npm install @hypergaas/core
        </a>
        {/* Secondary CTA — GitHub (repo is public). */}
        <a
          href="https://github.com/Hypergaas/hypergaas"
          className="rounded-md border border-neutral-300 px-5 py-2.5 font-medium"
        >
          Star on GitHub
        </a>
      </div>
    </section>
  );
}
