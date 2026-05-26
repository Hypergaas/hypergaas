// Result<T, ActionError> + ok/err/isOk/isErr (spec §2.c).

import { describe, expect, it } from "vitest";
import { err, isErr, isOk, ok } from "../runtime/index.js";
import type { ActionError, Result } from "../runtime/index.js";

describe("Result helpers", () => {
  it("ok() narrows via isOk", () => {
    const r: Result<number, ActionError> = ok(42);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (isOk(r)) {
      expect(r.value).toBe(42);
    }
  });

  it("err() narrows via isErr", () => {
    const r: Result<number, ActionError> = err({
      kind: "ActionNotFound",
      key: "JobService.missing",
    });
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
    if (isErr(r)) {
      expect(r.error.kind).toBe("ActionNotFound");
    }
  });
});
