// Layer 4 — SaaS Integration / ForgePro role registry (v0.1 PUBLIC-surface
// worked example).
//
// The canonical role registry from spec §7 + `role-registry.md` § "Developer-
// side usage (canonical example)", now expressed through the REAL public
// surface (`defineRoles`). `RoleOf<typeof ForgeProRoles>` derives the typed
// role-key union that the registry-aware `@agentAction()` decorator narrows
// `audienceRoles` against — a typo like `'dispather'` is a compile error.

import { defineRoles, type RoleOf } from "./role-registry/index.js";

/** Forge Pro (home-services SaaS) role registry — the anchor scenario. */
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
  csr: { displayName: "CSR", seniority: 2, maxAgentSpendPerDayCents: 20_00 },
  technician: {
    displayName: "Technician",
    seniority: 1,
    maxAgentSpendPerDayCents: 10_00,
  },
});

/** `'owner' | 'dispatcher' | 'csr' | 'technician'`. */
export type ForgeProRole = RoleOf<typeof ForgeProRoles>;
