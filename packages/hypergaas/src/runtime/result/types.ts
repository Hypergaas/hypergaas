// Layer 1 — Runtime / Result types.
//
// All gate failures in the action registry resolve as Result<T, ActionError>.
// No throw-based control flow inside the registry — spec §2.c. Developer
// methods may still throw (we can't constrain what they do); the registry
// catches and reifies as `ExecutionFailed`.

/**
 * Discriminated union of every gate failure the registry can produce.
 *
 * Cross-ref: sdk/docs/specs/action-registry.md §2.c.
 *
 * `cause: unknown` on `ExecutionFailed` is intentional — the decorator can't
 * constrain what the developer's method throws; the runtime never branches on
 * `cause`, only logs it. (`useUnknownInCatchVariables` enforces this at the
 * type level.)
 */
export type ActionError =
  | { readonly kind: "ActionNotFound"; readonly key: string }
  | {
      readonly kind: "SchemaValidationError";
      readonly path: string;
      readonly expected: string;
      readonly got: string;
    }
  | { readonly kind: "TenantScopeViolation"; readonly reason: string }
  | { readonly kind: "PermissionDenied"; readonly missing: readonly string[] }
  | { readonly kind: "AudienceDenied"; readonly tried: readonly string[] }
  | {
      readonly kind: "CostCapExceeded";
      readonly capCents: number;
      readonly spentCents: number;
    }
  | {
      readonly kind: "PauseForApproval";
      readonly approverRoles: readonly string[];
      readonly reason: string;
      /**
       * Information a future workflow engine needs to durably suspend on
       * and resume. The PoC doesn't suspend (no workflow engine exists),
       * but the shape is designed so the workflow engine can persist this
       * record and resume invocation when an approval arrives.
       */
      readonly suspension: {
        readonly actionKey: string;
        readonly tenantId: string;
        readonly proposerUserId: string;
        readonly proposerRole: string;
        readonly reversibility: "irreversible";
        readonly proposedAtMs: number;
      };
    }
  | { readonly kind: "ExecutionFailed"; readonly cause: unknown };

/** Successful gate / invocation. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failed gate / invocation. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * The library-internal Result type. Discriminated on `ok` for narrowing.
 * Spec §2.c: errors are typed, not exceptions.
 */
export type Result<T, E> = Ok<T> | Err<E>;
