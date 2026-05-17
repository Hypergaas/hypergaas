// Layer 1 — Runtime / @agentAction() decorator (PoC internal form).
//
// TC39 stage-3 method decorator (Node 22+ / TS 5.0+; decorator-mode approved
// 2026-05-15). The signature accepts (target, context) per
// ClassMethodDecoratorContext. Registration happens via `addInitializer`,
// which fires once per *instance* construction and gives us access to
// `this`, so the registered `invoke` thunk closes over the right instance.
//
// Per spec §8.a staging: the PoC accepts raw-string `audienceRoles`.
// The v0.1 public-type-surface commit (approve-tier, separate session)
// narrows this to the registry-aware generic form. Notes on the migration
// path are inline at the relevant types.

import type { AgentContext } from "../context/types.js";
import type { ActionRegistry } from "./registry.js";
import type {
  ActionDescriptor,
  AgentActionOptionsInternal,
} from "./types.js";

/**
 * Factory: build an `@agentAction()` decorator bound to a specific registry.
 *
 * The PoC form takes the registry directly. The v0.1 public form takes the
 * developer's role registry via `createActionRegistry(roles)` and returns
 * `{ agentAction }` — that binding is what enables the
 * `audienceRoles: RoleOf<R>[]` typing. The runtime semantics here are
 * identical; only the type signature changes at the public-surface commit.
 */
export function createAgentActionDecorator(registry: ActionRegistry) {
  /**
   * The decorator factory. Accepts options, returns the decorator function.
   *
   * Stage-3 signature: a method decorator returns `void` (we don't replace
   * the method) and uses `context.addInitializer` to run code on instance
   * construction. The initializer registers a per-instance descriptor on
   * the process-wide registry.
   */
  return function agentAction<This, P>(options: AgentActionOptionsInternal<P>) {
    return function decorate(
      target: (this: This, ctx: AgentContext, params: P) => Promise<unknown>,
      context: ClassMethodDecoratorContext<
        This,
        (this: This, ctx: AgentContext, params: P) => Promise<unknown>
      >,
    ): void {
      if (context.kind !== "method") {
        throw new Error(
          "@agentAction() may only decorate methods. " +
            `Received decorator kind "${context.kind}".`,
        );
      }
      if (context.static || context.private) {
        throw new Error(
          "@agentAction() may not decorate static or private methods. " +
            "Action methods must be instance methods on a public surface.",
        );
      }

      const methodName = String(context.name);

      context.addInitializer(function (this: This) {
        // `this` here is the instance under construction. Capture the
        // class name from its constructor for the default action key.
        const className =
          (this as { constructor?: { name?: string } }).constructor?.name ??
          "AnonymousService";
        const key = options.actionKey ?? `${className}.${methodName}`;

        // The thunk closes over `this` so subsequent `registry.invoke(...)`
        // calls dispatch against the correct instance. Type-erased at the
        // descriptor boundary (see ActionDescriptor in types.ts).
        const invoke = async (ctx: AgentContext, params: unknown) => {
          // The cast is safe: the decorator's type guarantees `target`'s
          // params type matches the action's `P`; the registry's schema
          // validation step (Gate 2) is responsible for ensuring the
          // runtime params shape matches. In the PoC the schema step is
          // permissive, so we trust the caller — same trade documented in
          // spec §3.b.
          return target.call(this, ctx, params as P);
        };

        const descriptor: ActionDescriptor = {
          key,
          className,
          methodName,
          // Widen P to unknown at the descriptor boundary — the runtime
          // never inspects P; it's the developer-facing type carrier.
          options: options as AgentActionOptionsInternal<unknown>,
          invoke,
        };
        registry.register(descriptor);
      });
    };
  };
}
