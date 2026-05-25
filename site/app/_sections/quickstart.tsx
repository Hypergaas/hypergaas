// Section 3 — 5-minute quickstart.
// Directive spec: copy-paste install + decorator on existing service +
// createAgentContext(tenantId, userId) + invocation. End state: a working
// JobService.getTechSchedule invocation with tenant-scoped audit log.
// The exact code blocks are GTM + ship's (post v0.1 public-type-surface commit).
// Structural shell only.
export function Quickstart() {
  return (
    <section id="quickstart" aria-labelledby="quickstart-heading" className="flex flex-col gap-6">
      <h2 id="quickstart-heading" className="text-3xl font-semibold tracking-tight">
        {/* TODO(gtm): section heading */}
      </h2>

      {/* Step 1 — install */}
      <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-4 font-mono text-sm text-neutral-100">
        <code>{/* TODO: `npm install hypergaas` */}</code>
      </pre>

      {/* Step 2 — decorator on an existing service method */}
      <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-4 font-mono text-sm text-neutral-100">
        <code>{/* TODO(ship): @agentAction() on JobService.getTechSchedule */}</code>
      </pre>

      {/* Step 3 — createAgentContext + invocation */}
      <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-4 font-mono text-sm text-neutral-100">
        <code>{/* TODO(ship): createAgentContext(tenantId, userId) + invoke + tenant-scoped audit */}</code>
      </pre>
    </section>
  );
}
