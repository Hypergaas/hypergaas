// Layer 4 — SaaS Integration / DbClient stub.
//
// Simulated database for the PoC's JobService worked example. Real users
// bring their own ORM; the SDK does not own data access. What the registry
// guarantees is that `ctx.tenantId` is correct; the developer is responsible
// for using it in their queries (spec §4 final paragraph).

export interface ScheduleEntry {
  readonly tenantId: string;
  readonly techId: string;
  readonly date: Date;
  readonly jobId: string;
  readonly customerName: string;
}

export interface Credit {
  readonly tenantId: string;
  readonly customerId: string;
  readonly amountCents: number;
  readonly reason: string;
  readonly issuedAtMs: number;
}

export interface DbClient {
  readonly schedule: {
    find(query: {
      tenantId: string;
      techId: string;
      date: Date;
    }): Promise<ReadonlyArray<ScheduleEntry>>;
  };
  readonly credits: {
    create(input: {
      tenantId: string;
      customerId: string;
      amountCents: number;
      reason: string;
    }): Promise<Credit>;
  };
}

/** PoC stub returning deterministic data per (tenantId, techId, date). */
export function createStubDbClient(): DbClient {
  return {
    schedule: {
      async find(query) {
        return [
          {
            tenantId: query.tenantId,
            techId: query.techId,
            date: query.date,
            jobId: `${query.tenantId}-${query.techId}-job-1`,
            customerName: "Stub Customer A",
          },
          {
            tenantId: query.tenantId,
            techId: query.techId,
            date: query.date,
            jobId: `${query.tenantId}-${query.techId}-job-2`,
            customerName: "Stub Customer B",
          },
        ];
      },
    },
    credits: {
      async create(input) {
        return {
          tenantId: input.tenantId,
          customerId: input.customerId,
          amountCents: input.amountCents,
          reason: input.reason,
          issuedAtMs: Date.now(),
        };
      },
    },
  };
}
