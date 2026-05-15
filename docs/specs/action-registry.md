# Spec — Action Registry (v0.1 public API)

**Status**: Draft. Internal — do not externalize. Externalizing or shipping any
part of this surface is `approve`-tier per `cycles/ship/CHARTER.md`.
**Locked dependencies (do not relitigate without `approve`-tier)**:
- `domains/engineering/CONTEXT.md` — TypeScript-first, no `any` in public surface, model-agnostic core, multi-tenant by default, reversibility classes are first-class.
- `domains/engineering/decisions/role-registry.md` — `audienceRoles` is a typed registry, not `string[]`. The first commit publishing `@agentAction()`'s public type signature ships the registry.
- `BRIEF.md` — action-registry pattern is the core DX innovation; one annotation, one place; no parallel code, no schema drift.

This spec defines the public TypeScript surface and the runtime contract of
the action registry. It is what enables a SaaS developer to take an existing
service-layer method and expose it to an agent with one decorator — and have
permission, audit, schema, reversibility, and tenant scoping handled for them.

---

## 0. Glossary (read this first)

- **Action** — a method on a developer's service class annotated with `@agentAction()`. Becomes a tool callable by the agent loop.
- **Registry** — process-wide map of action keys to `ActionDescriptor`s, populated at decoration time.
- **Audience** — who is allowed to invoke this action. Either a static role key (drawn from the developer's role registry) or a `self`-style predicate.
- **AgentContext (`ctx`)** — the per-invocation runtime object. Carries `tenantId`, `userId`, role, autonomy level, audit logger, memory handle, cost meter.
- **Reversibility class** — `idempotent` | `reversible` | `irreversible`. Declared at the action; consumed by the workflow engine.
- **Autonomy level** — per-tenant config: `low` | `medium` | `high`. Determines whether an `irreversible` action proceeds or pauses for approval.

---

## 1. Decorator signature

The decorator is **registry-aware**: its `audienceRoles` parameter is generic
over the developer's role registry. There is no `string[]` overload in the
v0.1 public surface.

```ts
// src/integration/action-registry/types.ts (sketch)

import type { RoleConfig, RoleOf, AudiencePredicate } from "../role-registry/types";
import type { AgentContext } from "../context/types";

export type Reversibility = "idempotent" | "reversible" | "irreversible";
export type AutonomyLevel = "low" | "medium" | "high";

/** A single audience entry: either a registry role key, or a predicate. */
export type AudienceEntry<R extends Record<string, RoleConfig>, P> =
  | RoleOf<R>
  | AudiencePredicate<P>;

/** Public options for `@agentAction()`. Generic over both the app's role
 *  registry `R` and the action's parameter type `P`. */
export interface AgentActionOptions<
  R extends Record<string, RoleConfig>,
  P,
> {
  /** Human-readable description; surfaces in tool schema and audit log. */
  description: string;
  /** Reversibility class — drives the workflow engine's autonomy gate. */
  reversibility: Reversibility;
  /** Permission strings the calling user must hold (RBAC, app-defined). */
  requiredPermissions: readonly string[];
  /** Who may invoke this action. Typed against the app's role registry. */
  audienceRoles: ReadonlyArray<AudienceEntry<R, P>>;
  /** Cost-attribution weight (multiplier on per-call accounting). */
  costWeight: number;
  /** Optional override for the action key; defaults to ClassName.methodName. */
  actionKey?: string;
}

/** The decorator factory. Returns a decorator that registers the method. */
export type AgentActionDecorator<R extends Record<string, RoleConfig>> =
  <P, T>(
    options: AgentActionOptions<R, P>,
  ) => (
    target: (this: T, ctx: AgentContext, params: P) => Promise<unknown>,
    context: ClassMethodDecoratorContext<T, typeof target>,
  ) => void;

/** Bound to the app's registry via a one-time SDK init step.
 *  Apps call `createActionRegistry(roles)` and destructure `agentAction`. */
export interface ActionRegistry<R extends Record<string, RoleConfig>> {
  agentAction: AgentActionDecorator<R>;
  /** Lookup by action key. Used by the runtime/loop. */
  get(key: string): ActionDescriptor | undefined;
  /** All registered actions (used for tool-schema emission). */
  list(): ReadonlyArray<ActionDescriptor>;
}

export function createActionRegistry<R extends Record<string, RoleConfig>>(
  roles: R,
): ActionRegistry<R>;
```

### Why this shape

- **Generic-over-`R`**: makes `audienceRoles: ['dispather', 'owner']` a compile error in the developer's IDE. `RoleOf<R>` is `keyof R & string` per the role-registry decision doc.
- **Generic-over-`P`**: `audience.self((ctx, params) => ...)` gets `params` typed exactly as the action receives them. No `any`, no generic widening.
- **`createActionRegistry(roles)`**: explicit binding of registry → decorator. The alternative ("import a free-floating `agentAction`") would force `string[]` because the decorator can't infer `R` from nothing. This shape is what makes the no-`string[]` invariant actually achievable.
- **TC39 stage-3 decorator signature** (`ClassMethodDecoratorContext`): assumes Node 22+ / TS 5.0+. The `experimentalDecorators` legacy form is incompatible with this `target`/`context` shape and is excluded from the v0.1 public surface. (See `Open questions / staging` for the staged build-tooling decision.)
- **`readonly` everywhere on options**: the registry never mutates user input.

### Hard no's at the type level

- `audienceRoles: string[]` — banned. Forces the developer-side typo escape hatch the role-registry decision was written to prevent.
- `requiredPermissions: string` (single string) — banned. Always a list; no special-casing the one-permission case.
- `description?` (optional) — banned. Tool schemas without descriptions degrade model performance; we make it mandatory.
- `params: any` or `params: unknown` in the implementation method — banned by the `noImplicitAny` + strict invariants; `P` carries through.

---

## 2. Runtime contract

When the agent loop selects a tool corresponding to an action `A` and invokes
it with arguments `args` for tenant `T` / user `U`, the registry executes the
following sequence. Each step is a hard gate: failure short-circuits with a
typed error class and writes a corresponding audit entry.

```
agent loop -> registry.invoke(actionKey, ctx, args)
  1. resolve descriptor          (ActionNotFound -> halt)
  2. validate args against schema (SchemaValidationError -> halt)
  3. tenant scope assertion      (TenantScopeViolation -> halt)
  4. permission check            (PermissionDenied -> halt)
  5. audience check              (AudienceDenied -> halt)
  6. cost gate                   (CostCapExceeded -> soft-stop, surface to user)
  7. audit-log: PROPOSED         (durably written before the gate)
  8. reversibility gate          (PauseForApproval | proceed)
  9. invoke target method        (raises -> caught, logged, rethrown)
 10. audit-log: COMPLETED|FAILED (durably written, includes return summary)
 11. memory write-back           (opinionated; see 2.b)
 12. return result to loop
```

### 2.a Step detail

1. **Resolve descriptor** — `O(1)` lookup in the per-process registry. No I/O.
2. **Validate args against schema** — schema is auto-derived from `P` (see §3). Validation is structural; failures carry the offending JSON Pointer and the expected type. The agent loop sees a typed failure it can correct on the next turn — not a thrown exception that crashes the worker.
3. **Tenant scope assertion** — `ctx.tenantId` must be present and non-empty. This is checked *before* any developer code runs; see §4 for why it can't be bypassed.
4. **Permission check** — `requiredPermissions` ⊆ `ctx.permissions`. Permissions come from the developer's existing RBAC layer; the SDK does not own permission storage.
5. **Audience check** — registry roles first (cheap static comparison against `ctx.role`), then predicate audiences in declaration order. First match passes. Per role-registry decision §"The `self` case is a relationship, not a role".
6. **Cost gate** — per-role daily cap (`maxAgentSpendPerDayCents` from the registry) and per-action `costWeight` are accumulated against `ctx.userId`. Exceeded → soft-stop returned to the loop with a typed `CostCapExceeded`; the loop surfaces this to the user, optionally requesting escalation to the next-senior role. Hard caps come from the agent runtime, not the registry.
7. **Audit-log: PROPOSED** — durably written *before* the reversibility gate. This is load-bearing: a crash between gate and execution leaves a record that an action was about to run, which the audit log can reconcile against the COMPLETED record. No silent disappearances.
8. **Reversibility gate** — only triggers for `reversibility: "irreversible"` and only when the tenant's autonomy level is below `high`. See §5.
9. **Invoke target method** — the developer's original method body runs. `ctx` is the same object passed to the registry; it is the only authoritative source of `tenantId`, `userId`, `role`. Anything the developer writes that "looks like" tenant scoping but reads from elsewhere is a developer bug, not an SDK escape hatch.
10. **Audit-log: COMPLETED|FAILED** — paired record. Includes truncated return summary (configurable redactors for PII).
11. **Memory write-back** — opinionated, automatic. See §2.b.
12. **Return result** — typed `Result<ReturnType<target>, ActionError>` to the loop.

### 2.b Memory write-back (sketch)

Per BRIEF.md "bad memory hygiene is a framework failure," write-back is *not* a developer responsibility. Default policy:

- **Episodic** — an entry per invocation: `{action, params summary, result summary, ts}`, scoped to `(tenantId, userId)`.
- **Business-object** — if the action's return value contains entity references (detected via TypeBrand or registered serializers), update entity-level facts.
- **Workflow** — if the action runs inside a workflow engine context, update the workflow's state record.

Other layers (semantic, procedural, organization) are written by the learning subsystem on a different cadence — not at action-invocation time.

The registry exposes a `memoryWriteBack` hook on `AgentActionOptions` for opt-out / customization, but the default is on. (Hook surface is `notify`-tier when added; not in v0.1.)

### 2.c Errors are typed, not exceptions

All gate failures resolve as `Result<T, ActionError>` where `ActionError` is a discriminated union:

```ts
export type ActionError =
  | { kind: "ActionNotFound"; key: string }
  | { kind: "SchemaValidationError"; path: string; expected: string; got: string }
  | { kind: "TenantScopeViolation"; reason: string }
  | { kind: "PermissionDenied"; missing: readonly string[] }
  | { kind: "AudienceDenied"; tried: readonly string[] }
  | { kind: "CostCapExceeded"; capCents: number; spentCents: number }
  | { kind: "PauseForApproval"; approverRoles: readonly string[]; reason: string }
  | { kind: "ExecutionFailed"; cause: unknown };
```

`unknown` in `cause` is acceptable because the decorator can't constrain what the developer's method throws; the runtime never inspects it for control flow, only logs it.

---

## 3. Schema auto-generation from TS types

The registry must turn a TypeScript parameter type `P` into a JSON Schema (or
the equivalent provider-specific tool schema) so the model knows the tool's
signature. Three paths considered.

### 3.a Options

| Path | Mechanism | When schema is built | Trade |
|---|---|---|---|
| **A. ts-morph build-time codegen** | Walk the TS AST; emit a `*.actions.json` artifact per file alongside `dist/`. Runtime loads the artifact and looks up by action key. | Build | Strict-mode safe. No runtime reflection cost. Produces *exactly* the type the developer wrote. Adds a build step; requires a tool like `tsup`/custom CLI to invoke. Requires source files (won't work on already-compiled `.d.ts`-only inputs — fine for v0.1). |
| **B. reflect-metadata runtime** | Use `experimentalDecorators` + `emitDecoratorMetadata`; read `Reflect.getMetadata("design:paramtypes", target)` at decoration time. | Runtime, at module load | Forces `experimentalDecorators` (incompatible with TC39 stage-3 signature in §1) — **disqualifies path A's decorator shape**. Erases generics: `params: { customerId: string }` becomes `Object`. Useless for our purposes. |
| **C. Manual zod/valibot schema** | Developer passes `paramSchema: z.object({...})` alongside the decorator. Schema is the source of truth; TS type is derived via `z.infer`. | Authoring | Universally supported; works under any decorator mode; runtime-validatable. Forces parallel definition (TS type + schema) — the exact "schema drift" problem the action registry exists to eliminate. Violates BRIEF.md "no parallel code, no schema drift." |

### 3.b Recommendation: **Path A (ts-morph build-time codegen)**

Rationale:

- Path B is disqualified by the decorator-mode incompatibility and the generic erasure.
- Path C violates the brief's no-schema-drift invariant. It's the easy answer — every other agent SDK does this — and it's the wrong answer. Eliminating schema drift is *the differentiator*.
- Path A is the only option that preserves the developer's exact TS type in the schema *and* is compatible with the TC39 stage-3 decorator signature *and* respects strict-mode + no-`any`.

Implementation sketch (not v0.1, just to prove the path):
- A `gaasdk extract` CLI walks `tsconfig.json` includes, finds `@agentAction()`-decorated methods, uses ts-morph to resolve `P`'s type, and emits a `gaasdk.actions.json` next to `dist/index.js`.
- The runtime, on `createActionRegistry()`, loads the JSON if present and indexes by action key. If not present, falls back to a permissive `Record<string, unknown>` schema and logs a `notify`-tier warning at init time.
- Provider-specific schema serializers (OpenAI tool spec, Anthropic tool spec, etc.) live in the runtime layer behind a small interface — keeps the action registry provider-agnostic per the locked invariant.

### 3.c Tension with `RoleOf<typeof X>` chains — surface as `notify`

Path A walks the developer's source AST. `audienceRoles: ['owner', 'dispatcher']` resolves cleanly because the AST sees the literal array. But if a developer writes:

```ts
const dispatcherOrOwner: ForgeProRole[] = ['dispatcher', 'owner'];
class JobService {
  @agentAction({ ..., audienceRoles: dispatcherOrOwner })
  async ...
}
```

ts-morph can follow the const reference, but only if it's in scope and resolvable. For computed audiences (e.g., `audienceRoles: getAudienceFor("schedule:read")`), Path A degrades to "I can't tell you who can call this without running your code" and the schema-emission step needs to either (a) refuse to compile (strict), or (b) emit a wide audience and log a warning (lenient).

**Recommendation:** the v0.1 emitter is **strict**: literal arrays only for `audienceRoles`. Computed audiences raise a build-time error with a clear message ("audienceRoles must be a literal array of role keys; compute audiences via `audience.self(...)` predicates instead"). This tension is **surfaced as `notify`-tier** so the operator sees it before the public-type-surface commit ships — see queue item.

---

## 4. Multi-tenant context injection

`AgentContext` is the only authoritative source of tenant identity inside an
action body. The registry guarantees that:

- Every action body's first parameter is `ctx: AgentContext`. The decorator's `target` type enforces this at compile time. There is no overload that omits `ctx`.
- `ctx.tenantId` is set before the registry calls the developer's method. It is the same `tenantId` that the agent loop was constructed with via `createAgentContext(tenantId, userId)`.
- The agent loop has no API to invoke an action with a forged `ctx`. The registry's `invoke()` takes a `ctx` argument, but the public agent loop does not expose `invoke()` directly — it routes through the loop's tool-dispatch path, which uses the loop's own bound `ctx`.
- `AgentContext` is **frozen** at construction. Mutation of `ctx.tenantId` raises at runtime in dev mode (assertion) and is a no-op in prod (the field is non-writable).
- The developer's database query layer is *not* automatically scoped — that's the developer's existing service-layer responsibility. What the registry guarantees is that `ctx.tenantId` is correct; what the developer does with it (`db.invoices.create({ tenantId: ctx.tenantId, ... })`) is the existing pattern they already use. The SDK doesn't replace the developer's ORM; it enforces the boundary at the action layer.

### Why it cannot be bypassed

Three layers of defense:

1. **Type level**: the decorator's `target` signature requires `(this, ctx: AgentContext, params: P) => Promise<unknown>`. A method without `ctx` fails to decorate.
2. **Runtime construction**: `createAgentContext(tenantId, userId)` validates non-empty `tenantId`, fetches the user's role from the developer-supplied resolver, and freezes the result. There is no constructor variant that takes neither.
3. **Invocation**: the registry's `invoke()` is internal. Public callers reach it via the agent loop, which only ever uses its own bound `ctx`. There is no `actionRegistry.invokeAs(actionKey, fakeCtx, params)` surface.

Anything that "looks like" a bypass — e.g., a developer constructing their own `AgentContext` literal — is caught by the construction validation. The frozen object means that even if a developer obtains a valid `ctx`, they can't mutate `tenantId` to escape scope.

---

## 5. Reversibility class system

Per `CONSTITUTION.md` "Reversibility classes (SDK product)":

- **idempotent** — safe to retry; running twice equals running once.
- **reversible** — has an inverse action.
- **irreversible** — pauses for approval when tenant autonomy level is below threshold.

The action's reversibility class is declared at decoration time and is read by
the workflow engine at gate step §2.a.8.

### 5.a Gate logic

```
if reversibility === "idempotent": proceed.
if reversibility === "reversible":
    proceed; record the inverse-action descriptor on the workflow's undo stack.
if reversibility === "irreversible":
    if ctx.tenant.autonomyLevel === "high": proceed.
    else:
        write audit-log "PROPOSED — paused for approval"
        return Err(PauseForApproval{ approverRoles, reason })
        // workflow engine durably suspends; resumes when approval arrives
```

### 5.b Who can approve

Per the role-registry decision doc:

- Approver candidate set = users whose role has `canApproveIrreversibleUpTo >= <gate-required level>` AND whose `seniority >= proposer's seniority`.
- Tenant autonomy level (`low` / `medium` / `high`) sets the *gate threshold*: at `low`, every irreversible action gates; at `medium`, only those marked `gate: medium`; at `high`, gating is opt-in per action. (The per-action gate level is a v0.2 extension; v0.1 treats all `irreversible` actions as gated whenever autonomy is below `high`.)

### 5.c Why this is in the action layer

The decorator carries the reversibility class because the developer is the one
who knows whether `createInvoice` is reversible. The workflow engine *acts on*
the class but does not *assign* it. This keeps the declaration colocated with
the operation.

The constitution's "surface risk at the boundary where a human can intervene
cheaply" applies: the boundary is the action invocation, not somewhere
downstream where the work has already partially executed.

---

## 6. Role registry — full v0.1 public surface

This section is the v0.1 public surface for the role-typing primitives.
It mirrors and absorbs `domains/engineering/decisions/role-registry.md`.
**Any change here requires `approve`-tier and a corresponding update to the
decision doc.**

### 6.a Public exports (v0.1)

```ts
// src/integration/role-registry/index.ts

export type AutonomyLevel = "low" | "medium" | "high";

export interface RoleConfig {
  /** Rendered in approval inbox + audit log UI. Single source of truth. */
  displayName: string;
  /** Numeric ordering for "may approve actions proposed by lower-seniority". */
  seniority: number;
  /** Whether a user with this role can run agents on behalf of other users. */
  canImpersonate?: boolean;
  /** Highest gate level this role can clear when approving irreversible actions. */
  canApproveIrreversibleUpTo?: AutonomyLevel;
  /** Per-day soft cap on agent spend attributed to this role. */
  maxAgentSpendPerDayCents?: number;
}

/** SDK-exported registry constructor. Returns the registry as-is to preserve
 *  the literal type for `RoleOf<typeof X>` derivation. */
export function defineRoles<R extends Record<string, RoleConfig>>(registry: R): R;

/** Type utility — extracts the role-key string-literal union. */
export type RoleOf<R> = keyof R & string;

/** Predicate audience entry — for dynamic relationships like "self". */
export interface AudiencePredicate<P> {
  readonly kind: "predicate";
  readonly label: string;
  check(ctx: AgentContext, params: P): boolean;
}

/** Predicate-audience constructors. Opinionated and small — adding a new
 *  flavor is an additive SDK change, not a developer ad-hoc lambda. */
export const audience: {
  self<P>(check: (ctx: AgentContext, params: P) => boolean, label?: string): AudiencePredicate<P>;
};
```

### 6.b Each metadata field maps to a runtime subsystem

This is what makes the registry "load-bearing, not decoration." If a future
spec adds a metadata field, the question to ask is *which subsystem reads it*;
fields that no subsystem reads do not belong in the registry.

| Field | Subsystem | Behavior |
|---|---|---|
| `displayName` | UI (`<AgentPanel>`, audit log renderer) | Rendered wherever the role appears. No hand-formatting at render time. |
| `seniority` | Approval system | "Approver's seniority ≥ proposer's seniority" rule. Composable with `canApproveIrreversibleUpTo`. |
| `canImpersonate` | Multi-tenant context | Gates `createAgentContext(tenantId, onBehalfOfUserId)` — only roles with `canImpersonate: true` may construct a context for someone else. |
| `canApproveIrreversibleUpTo` | Workflow engine — reversibility gate | Per §5: filter approver candidate set by this attribute against the action's gate level. |
| `maxAgentSpendPerDayCents` | Cost subsystem | Per-user, per-day soft cap accumulated against `ctx.userId`'s role. Exceeded → `CostCapExceeded`. |

### 6.c The `self` case

Static role-membership and dynamic predicates compose in one `audienceRoles`
field. Check order at runtime (per §2.a.5):

1. Cheap static check — is `ctx.role` in the registry-keyed entries of `audienceRoles`?
2. If no match — run predicate entries in declaration order; first `true` passes.
3. If none match → `AudienceDenied`.

Predicate audiences carry a `label` for the audit log (e.g., `"self: tech viewing own schedule"`). The `audience.self(...)` constructor is the only predicate flavor in v0.1; `audience.sameTeam(...)`, `audience.sameRegion(...)`, etc. are additive future work.

### 6.d Why a registry, not an enum

(Restating the decision doc for spec-completeness; do not re-litigate.)

- Enums don't carry per-entry metadata. The registry does, and that metadata is load-bearing.
- Enums are closed at the language level. The registry is closed at the *app boundary* and supports per-tenant config overrides (deferred past v0.1, but the surface is designed for it).
- `defineRoles()` is one constructor; minimal API surface.
- `RoleOf<typeof X>` gives full autocomplete + refactor-rename + compile-time typo prevention. Strictly better than enum string literals once metadata is in play.

---

## 7. Worked example

The canonical example. Uses the same `JobService` shape as the role-registry
decision doc to keep the two artifacts in lockstep.

```ts
// app code (developer's repo — Forge Pro, a home-services SaaS)
import {
  defineRoles,
  audience,
  createActionRegistry,
  type RoleOf,
  type AgentContext,
} from "gaasdk";

// 1. Define roles once. RoleOf<typeof X> gives the typed key union.
export const ForgeProRoles = defineRoles({
  owner: {
    displayName: "Owner",
    seniority: 4,
    canImpersonate: true,
    canApproveIrreversibleUpTo: "high",
    maxAgentSpendPerDayCents: 100_00,
  },
  dispatcher: {
    displayName: "Dispatcher",
    seniority: 3,
    canApproveIrreversibleUpTo: "medium",
    maxAgentSpendPerDayCents: 50_00,
  },
  csr:        { displayName: "CSR",        seniority: 2, maxAgentSpendPerDayCents: 20_00 },
  technician: { displayName: "Technician", seniority: 1, maxAgentSpendPerDayCents: 10_00 },
});
export type ForgeProRole = RoleOf<typeof ForgeProRoles>;
//        ^? 'owner' | 'dispatcher' | 'csr' | 'technician'

// 2. Bind the decorator to the registry. One-time SDK init.
const { agentAction } = createActionRegistry(ForgeProRoles);

// 3. Annotate existing service methods.
class JobService {
  constructor(private readonly db: DbClient) {}

  @agentAction({
    description: "Get a technician's schedule for a given date",
    reversibility: "idempotent",
    requiredPermissions: ["schedule:read"],
    audienceRoles: [
      "dispatcher",
      "owner",
      audience.self(
        (ctx, params: { techId: string }) => ctx.userId === params.techId,
        "self: tech viewing own schedule",
      ),
    ],
    costWeight: 1,
  })
  async getTechSchedule(
    ctx: AgentContext,
    params: { techId: string; date: Date },
  ): Promise<ScheduleEntry[]> {
    return this.db.schedule.find({
      tenantId: ctx.tenantId,    // already validated non-empty by the registry
      techId: params.techId,
      date: params.date,
    });
  }

  @agentAction({
    description: "Issue a goodwill credit to a customer",
    reversibility: "irreversible",
    requiredPermissions: ["billing:write"],
    audienceRoles: ["owner"],     // only owner may invoke; gates regardless of autonomy
    costWeight: 5,
  })
  async issueGoodwillCredit(
    ctx: AgentContext,
    params: { customerId: string; amountCents: number; reason: string },
  ): Promise<Credit> {
    return this.db.credits.create({ tenantId: ctx.tenantId, ...params });
  }
}
```

### What this example proves

- `audienceRoles: ["dispather", ...]` is a compile error. (Try it. The IDE underlines the typo.)
- `audience.self((ctx, params) => ...)` infers `params` as `{ techId: string }` — no `any`, no widening.
- `ctx.tenantId` is guaranteed present in the body of every action.
- `issueGoodwillCredit` will pause for approval whenever the tenant's autonomy level is below `high`. The approver candidate set: users whose role has `canApproveIrreversibleUpTo >= "high"` (i.e., `owner` only, in this registry) AND whose `seniority >= 4` (the owner's own seniority — i.e., owner only). At the gate, the workflow engine surfaces a typed `PauseForApproval`, the action's "PROPOSED" audit row is durably written, and the loop suspends until an owner approves via the React `<AgentPanel>`.
- One annotation per method. No parallel schema, no separate permission-check function, no manual audit-log call, no separate reversibility config file. **One annotation, one place.**

---

## 8. Open questions / staging

### 8.a Staging — what's PoC vs. what's v0.1 public

| Surface | PoC (today) | v0.1 public commit |
|---|---|---|
| `@agentAction()` decorator | OK to use raw-string `audienceRoles` internally to stand the demo up fast | **Must** ship with the registry-aware generic-over-`R` signature in §1. That commit is `approve`-tier. |
| `defineRoles()` / `RoleOf<>` | Not required for PoC | **Required.** Ships in the same commit. |
| `audience.self(...)` | Not required for PoC | **Required.** Ships in the same commit. |
| ts-morph schema codegen | Not required for PoC; runtime can fall back to a permissive schema with a warning log | Required for v0.1; `gaasdk extract` CLI lands ahead of the public-type-surface commit. |
| Memory write-back hook | Not in PoC | Default-on in v0.1; opt-out hook is `notify`-tier when added. |
| Reversibility gate at `medium`-level granularity | Not in v0.1 (binary: `irreversible` always gates when autonomy below `high`) | v0.2. |

### 8.b Open questions

1. **Action-key collisions.** Default key is `ClassName.methodName`. Two services with same class name (e.g., two `InvoiceService`s in different modules) collide. Resolution candidates: (a) require explicit `actionKey` when ambiguous and detect at registration time; (b) namespace by source-file path. Lean: (a). Surface as `notify` if ambiguity is detected at registration.

2. **Tool schema dialects per provider.** OpenAI, Anthropic, and Gemini have slightly different tool-schema shapes. The registry holds one canonical schema (JSON Schema); per-provider serializers live in the runtime layer. This is straightforward, but the *first* provider serializer commit defines the canonical-schema shape — keep it general (no OpenAI-specific extensions leaking in).

3. **Per-tenant role-config overrides.** Mentioned in the role-registry decision doc as deferred past v0.1. The registry surface (§6.a) doesn't expose any tenant-override API — that comes via `runtime.configureTenant({ roleOverrides: ... })`, not the action registry. Keep this in mind: don't paint into a corner where role config is statically baked into the descriptor at registration time. The descriptor should reference role *keys*, not role *configs* — config is resolved per-invocation via the registry the loop holds.

4. **The `RoleOf<typeof X>` ↔ ts-morph tension** — see §3.c. Surfaced as `notify`. Decision needed before the public-type-surface commit.

5. **`requiredPermissions` typing.** Currently `readonly string[]`. Could be made registry-typed similarly (`PermissionOf<typeof PermRegistry>`) to get the same compile-time safety. **Not in v0.1** — adds a second registry construct and the trade isn't justified yet. Surface as a future consideration.

6. **What happens to `costWeight` if the agent retries an `idempotent` action?** Charge once or per-attempt? Lean: charge per-attempt (matches what the model provider charges us). Surface as `notify` when the cost subsystem lands.

### 8.c What's blocked on operator decisions

The four batched build-tooling decisions in `inbox/pending.jsonl` (build tool, test framework, decorator mode, reflection mechanism). The *spec* in this document is independent of the four (it specifies the public type surface and the runtime contract, which are the same regardless of which package manager builds the code). But the *implementation* of §3 (schema codegen) is blocked on the reflection-mechanism decision, and §1's TC39-stage-3 decorator signature is blocked on the decorator-mode decision.

---

## Cross-references

- `domains/engineering/CONTEXT.md` — locked architecture invariants.
- `domains/engineering/decisions/role-registry.md` — the typed role registry decision this spec absorbs.
- `domains/product/use_cases/forgepro-action-registry.md` — the worked example whose `audienceRoles` field this spec types.
- `BRIEF.md` — action-registry pattern locked decision; `InvoiceService` reference snippet.
- `CONSTITUTION.md` — reversibility classes section; approval tiers; no-`any`-in-public-surface.
- `cycles/ship/CHARTER.md` — v0.1 public API locked inclusions; PoC priority.
- `cycles/ship/journal/2026-05-15.md` — day-0 session log.
