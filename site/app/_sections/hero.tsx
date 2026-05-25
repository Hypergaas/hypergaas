// Section 1 — Hero.
// Directive spec: one-sentence value prop, ONE @agentAction() code snippet
// (decorator on an existing service method, showing zero parallel schemas),
// two CTAs (npm install + GitHub link).
// Copy + the exact snippet are GTM's. This is the structural shell only.
export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="flex flex-col gap-8">
      {/* TODO(gtm): one-sentence value prop. Directive lean:
          "Add agents to your SaaS — without rewriting your service layer." */}
      <h1 id="hero-heading" className="text-4xl font-semibold tracking-tight sm:text-5xl">
        {/* TODO(gtm): headline */}
      </h1>

      {/* TODO(gtm): supporting subhead (optional) */}
      <p className="text-lg text-neutral-600">{/* TODO(gtm): subhead */}</p>

      {/* Code snippet: an @agentAction() decorator on an existing service method.
          TODO(gtm/ship): drop in the canonical snippet once v0.1 public surface lands. */}
      <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-4 font-mono text-sm text-neutral-100">
        <code>{/* TODO: @agentAction() decorator snippet — zero parallel schemas */}</code>
      </pre>

      {/* Two CTAs */}
      <div className="flex flex-wrap gap-4">
        {/* TODO(gtm): primary CTA — `npm install hypergaas` (copy-to-clipboard) */}
        <a
          href="#quickstart"
          className="rounded-md bg-accent px-5 py-2.5 font-medium text-accent-fg"
        >
          {/* TODO(gtm): CTA label */}
        </a>
        {/* TODO(gtm): secondary CTA — GitHub link (github.com/hypergaas, post-approval) */}
        <a
          href="https://github.com/hypergaas"
          className="rounded-md border border-neutral-300 px-5 py-2.5 font-medium"
        >
          {/* TODO(gtm): GitHub CTA label */}
        </a>
      </div>
    </section>
  );
}
