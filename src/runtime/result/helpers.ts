// Layer 1 — Runtime / Result helpers.
//
// `ok(value)` / `err(error)` are the only constructors. Hand-rolling the
// object literal is allowed but discouraged — the helpers exist so call sites
// read as `return ok(x)` / `return err({ kind: "...", ... })`.

import type { Err, Ok, Result } from "./types.js";

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return !r.ok;
}
