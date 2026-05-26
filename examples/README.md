# Examples

Worked, illustrative examples that consume the **public** `hypergaas` surface —
the shape a developer actually imports, not package internals.

| Example | What it shows |
|---|---|
| [`forgepro-multitenant/`](./forgepro-multitenant) | Two tenants, one process, one shared action registry. Static-role and `audience.self(...)` audiences, tenant-scoped audit, no cross-tenant leakage. |

## Note on what's "canonical"

These examples are **illustrative** and type-checked against the published
package (`pnpm --filter <example> typecheck` proves they compile against the real
exports). The **executable, asserted** copy of each scenario lives in the SDK's
own test suite (`packages/hypergaas/src/__tests__/public-surface.test.ts` and
`two-tenant-demo.test.ts`) — that is the regression source of truth. Keeping the
runnable assertions in the package's vitest run (rather than here) means the
move did not relocate any tested surface out of the package.

Whether `examples/` should additionally become a fully runnable workspace
(adding a TypeScript runner such as `tsx`) is intentionally deferred — the SDK
itself avoids a runtime `tsx`/`ts-node` dependency, and adding one belongs with
the npm-publish topology decision, not this restructure.
