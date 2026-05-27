// Section 5 — Docs / GitHub links.
// Directive spec: docs at hypergaas.dev/docs or a subdomain; GitHub link with
// a star-count badge via shields.io. Final URLs + labels are GTM's.
// Structural shell only.
export function DocsAndGithub() {
  return (
    <section aria-labelledby="docs-heading" className="flex flex-col gap-6">
      <h2 id="docs-heading" className="text-3xl font-semibold tracking-tight">
        Read the code. Star the repo.
      </h2>

      <p className="max-w-2xl text-neutral-600">
        HyperGaaS is open source and TypeScript-first. The v0.1 public surface — the
        action registry, the typed role registry, and multi-tenant context — is on GitHub.
        Full documentation is on the way.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        {/* GitHub — the repo is public. */}
        <a
          href="https://github.com/Hypergaas/hypergaas"
          className="inline-flex items-center gap-2 font-medium text-accent"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://img.shields.io/github/stars/Hypergaas/hypergaas?style=social"
            alt="GitHub stars for Hypergaas/hypergaas"
            width={120}
            height={20}
          />
          <span>github.com/Hypergaas/hypergaas</span>
        </a>
        {/* Docs — none published yet; "coming soon" is accurate at v0.1. */}
        <span className="font-medium text-neutral-400">Docs — coming soon</span>
      </div>
    </section>
  );
}
