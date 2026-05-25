// Section 5 — Docs / GitHub links.
// Directive spec: docs at hypergaas.dev/docs or a subdomain; GitHub link with
// a star-count badge via shields.io. Final URLs + labels are GTM's.
// Structural shell only.
export function DocsAndGithub() {
  return (
    <section aria-labelledby="docs-heading" className="flex flex-col gap-6">
      <h2 id="docs-heading" className="text-3xl font-semibold tracking-tight">
        {/* TODO(gtm): section heading */}
      </h2>
      <div className="flex flex-wrap gap-4">
        {/* TODO(gtm): docs link — hypergaas.dev/docs or subdomain (post-domain-setup) */}
        <a href="#" className="font-medium text-accent">
          {/* TODO(gtm): docs link label */}
        </a>
        {/* TODO(gtm): GitHub link + shields.io star badge (github.com/hypergaas, post-approval) */}
        <a href="https://github.com/hypergaas" className="font-medium text-accent">
          {/* TODO(gtm): GitHub link label + star badge */}
        </a>
      </div>
    </section>
  );
}
