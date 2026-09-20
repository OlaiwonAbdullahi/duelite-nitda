/* Seeded demo world for Duelite.
 *
 * There is no database. Everything below is generated once, deterministically,
 * from a fixed PRNG seed and a fixed clock so the server and the browser render
 * exactly the same thing. Changes made during a demo live in memory only
 * (see ./store.ts) and disappear on refresh or reset. */

export type School = {
  id: string;
  name: string;
  short: string;
  faculties: string[];
  departments: string[];
};

export type Kyc = "none" | "pending" | "verified";
export type RepStatus = "none" | "pending" | "approved" | "rejected";

export type User = {
  id: string;
  name: string;
  matric: string;
  phone: string;
  email: string;
  schoolId: string;
  isRep: boolean;
  kyc: Kyc;
  repStatus: RepStatus;
  joinedAt: number;
};

export type SpaceRole = "rep" | "treasurer" | "secretary" | "pro" | "member";

export type Space = {
  id: string;
  schoolId: string;
  ownerId: string;
  name: string;
  kind: "department" | "class" | "association";
  joinCode: string;
  status: "active" | "paused";
  createdAt: number;
  memberIds: string[];
  signatoryIds: string[];
};

export type Due = {
  id: string;
  spaceId: string;
  title: string;
  type: "dues" | "handout" | "levy" | "project" | "wear";
  amount: number;
  deadline: number;
  allowInstalments: boolean;
};

export type Payment = {
  id: string;
  userId: string;
  spaceId: string;
  total: number;
  fee: number;
  status: "paid" | "pending" | "failed";
  reference: string;
  at: number;
  lines: { dueId: string; amount: number }[];
};

export type Withdrawal = {
  id: string;
  spaceId: string;
  requestedBy: string;
  amount: number;
  fee: number;
  purpose: string;
  status: "sent" | "pending" | "blocked";
  flagged: boolean;
  flagReason?: string;
  at: number;
};

export type Refund = {
  id: string;
  paymentId: string;
  userId: string;
  spaceId: string;
  amount: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "escalated";
  at: number;
  note?: string;
};

export type ActivityKind =
  | "auth"
  | "approval"
  | "dues"
  | "money"
  | "role"
  | "dispute"
  | "api";

export type Activity = {
  id: string;
  actorId: string;
  action: string;
  target: string;
  kind: ActivityKind;
  at: number;
};

export type ApiKey = {
  id: string;
  schoolId: string;
  key: string;
  createdAt: number;
  lastUsedAt?: number;
  revoked: boolean;
};

export type DemoState = {
  schools: School[];
  users: User[];
  spaces: Space[];
  dues: Due[];
  payments: Payment[];
  withdrawals: Withdrawal[];
  refunds: Refund[];
  activity: Activity[];
  apiKeys: ApiKey[];
};

/* --------------------------------------------------------------- fee model */

/** Student pays 2% of the payment, capped at ₦250. */
export const studentFee = (total: number) =>
  Math.min(Math.round(total * 0.02), 250);

/** Rep pays ₦100 up to ₦50,000, ₦200 above it. */
export const withdrawalFee = (amount: number) => (amount <= 50_000 ? 100 : 200);

/* ------------------------------------------------------------------- clock */

/** Fixed "now" for the demo. A real clock would desync server and client
 *  markup on every relative date, and re-seeding would never be repeatable. */
export const DEMO_NOW = Date.parse("2026-09-19T09:00:00.000Z");
const DAY = 86_400_000;
const days = (n: number) => DEMO_NOW + n * DAY;

/* --------------------------------------------------------------- generator */

/** mulberry32 — 4 lines of deterministic PRNG, no dependency. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Adeola", "Chinedu", "Fatima", "Tobiloba", "Ngozi", "Ibrahim", "Oluwaseun",
  "Amaka", "Yusuf", "Temiloluwa", "Blessing", "Emeka", "Halima", "Damilare",
  "Chiamaka", "Suleiman", "Folake", "Kelechi", "Zainab", "Ayomide", "Ifeoma",
  "Musa", "Bukola", "Obinna", "Aisha", "Segun", "Nkechi", "Abdulrahman",
  "Motunrayo", "Uchenna", "Rukayat", "Babajide", "Chisom", "Idris", "Morenike",
];

const LAST = [
  "Adebayo", "Okonkwo", "Bello", "Ogunleye", "Eze", "Abdullahi", "Balogun",
  "Nwosu", "Sanusi", "Oyelaran", "Adeyemi", "Chukwu", "Lawal", "Akintola",
  "Obi", "Yakubu", "Fasasi", "Ibekwe", "Mohammed", "Ajayi", "Onyeka",
  "Danjuma", "Salami", "Anyanwu", "Garba", "Olatunji", "Ude", "Aliyu",
];

const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];

const ref = (r: () => number) =>
  "DLT-" + Math.floor(r() * 9_000_000 + 1_000_000).toString(36).toUpperCase();

/* ------------------------------------------------------------------- build */

export function buildSeed(): DemoState {
  const r = rng(20250919);

  const schools: School[] = [
    {
      id: "sch_lautech",
      name: "Ladoke Akintola University of Technology",
      short: "LAUTECH",
      faculties: ["Computing and Informatics", "Engineering", "Pure Sciences"],
      departments: ["Computer Science", "Cyber Security", "Mechanical Engineering"],
    },
    {
      id: "sch_oau",
      name: "Obafemi Awolowo University",
      short: "OAU",
      faculties: ["Technology", "Science"],
      departments: ["Electronic Engineering", "Microbiology"],
    },
    {
      id: "sch_futa",
      name: "Federal University of Technology, Akure",
      short: "FUTA",
      faculties: ["Computing", "Agriculture"],
      departments: ["Software Engineering", "Crop Science"],
    },
  ];

  const users: User[] = [];
  const mk = (u: Omit<User, "id">): User => {
    const user = { id: `usr_${users.length + 1}`, ...u };
    users.push(user);
    return user;
  };

  const staff = (
    name: string,
    schoolId: string,
    repStatus: RepStatus,
    kyc: Kyc,
    joinedAt: number,
  ) =>
    mk({
      name,
      matric: "—",
      phone: `+23480${Math.floor(r() * 90_000_000 + 10_000_000)}`,
      email: `${name.split(" ")[0].toLowerCase()}@${schoolId.slice(4)}.demo`,
      schoolId,
      isRep: repStatus === "approved",
      kyc,
      repStatus,
      joinedAt,
    });

  // One approved rep, two co-reps who act as signatories, and reps awaiting
  // approval — the admin console's first job.
  const rep = staff("Tunde Akinyele", "sch_lautech", "approved", "verified", days(-84));
  const treasurer = staff("Halima Sanusi", "sch_lautech", "none", "verified", days(-80));
  const secretary = staff("Chidi Nwankwo", "sch_lautech", "none", "verified", days(-80));
  const oauRep = staff("Bisi Oyelaran", "sch_oau", "approved", "verified", days(-60));
  const pendingA = staff("Amina Garba", "sch_lautech", "pending", "pending", days(-2));
  const pendingB = staff("Efe Okpara", "sch_futa", "pending", "pending", days(-1));
  const pendingC = staff("Kunle Balogun", "sch_oau", "pending", "none", days(-1));

  // ~200 students in the LAUTECH Computer Science department.
  const students: User[] = [];
  for (let i = 0; i < 204; i++) {
    students.push(
      mk({
        name: `${pick(r, FIRST)} ${pick(r, LAST)}`,
        matric: `2021/CSC/${String(i + 1).padStart(3, "0")}`,
        phone: `+23481${Math.floor(r() * 90_000_000 + 10_000_000)}`,
        email: `csc${String(i + 1).padStart(3, "0")}@lautech.demo`,
        schoolId: "sch_lautech",
        isRep: false,
        kyc: "none",
        repStatus: "none",
        joinedAt: days(-70 + Math.floor(r() * 60)),
      }),
    );
  }

  const spaces: Space[] = [
    {
      id: "spc_csc400",
      schoolId: "sch_lautech",
      ownerId: rep.id,
      name: "CSC 400 Level — 2025/26",
      kind: "class",
      joinCode: "CSC400",
      status: "active",
      createdAt: days(-86),
      memberIds: students.map((s) => s.id),
      signatoryIds: [treasurer.id, secretary.id],
    },
    {
      id: "spc_nacos",
      schoolId: "sch_lautech",
      ownerId: rep.id,
      name: "NACOS LAUTECH",
      kind: "association",
      joinCode: "NACOS26",
      status: "active",
      createdAt: days(-60),
      memberIds: students.slice(0, 140).map((s) => s.id),
      signatoryIds: [treasurer.id],
    },
    {
      id: "spc_eee300",
      schoolId: "sch_oau",
      ownerId: oauRep.id,
      name: "EEE 300 Level — 2025/26",
      kind: "department",
      joinCode: "EEE300",
      status: "active",
      createdAt: days(-40),
      memberIds: students.slice(0, 48).map((s) => s.id),
      signatoryIds: [],
    },
  ];

  const dues: Due[] = [
    ["spc_csc400", "Departmental dues", "dues", 5000, -10, false],
    ["spc_csc400", "CSC 402 handout", "handout", 2500, -4, false],
    ["spc_csc400", "Final year project levy", "levy", 25000, 21, true],
    ["spc_csc400", "Faculty week levy", "levy", 3000, 7, false],
    ["spc_csc400", "Class wear", "wear", 12000, 14, true],
    ["spc_csc400", "Convocation levy", "levy", 8000, 30, false],
    ["spc_nacos", "NACOS annual dues", "dues", 3500, -6, false],
    ["spc_nacos", "Tech week ticket", "levy", 2000, 3, false],
    ["spc_eee300", "Departmental dues", "dues", 4500, -2, false],
    ["spc_eee300", "Lab manual", "handout", 1800, 9, false],
  ].map(([spaceId, title, type, amount, due, inst], i) => ({
    id: `due_${i + 1}`,
    spaceId: spaceId as string,
    title: title as string,
    type: type as Due["type"],
    amount: amount as number,
    deadline: days(due as number),
    allowInstalments: inst as boolean,
  }));

  /* Payments. Students pay several dues in one transfer, which is the whole
   * point of the product, so a payment carries lines rather than one due. */
  const payments: Payment[] = [];
  const payRate: Record<string, number> = {
    due_1: 0.86, due_2: 0.72, due_3: 0.4, due_4: 0.55, due_5: 0.33, due_6: 0.18,
    due_7: 0.64, due_8: 0.41, due_9: 0.7, due_10: 0.52,
  };

  for (const space of spaces) {
    const spaceDues = dues.filter((d) => d.spaceId === space.id);
    for (const memberId of space.memberIds) {
      const lines = spaceDues
        .filter((d) => r() < payRate[d.id])
        .map((d) => ({
          dueId: d.id,
          // Instalment dues are sometimes paid part-way.
          amount:
            d.allowInstalments && r() < 0.45
              ? Math.round((d.amount * (r() < 0.5 ? 0.5 : 0.25)) / 100) * 100
              : d.amount,
        }));
      if (!lines.length) continue;

      // Most people pay everything in one transfer; some come back later.
      const chunks =
        lines.length > 2 && r() < 0.35
          ? [lines.slice(0, 2), lines.slice(2)]
          : [lines];

      for (const chunk of chunks) {
        const total = chunk.reduce((s, l) => s + l.amount, 0);
        const roll = r();
        payments.push({
          id: `pay_${payments.length + 1}`,
          userId: memberId,
          spaceId: space.id,
          total,
          fee: studentFee(total),
          status: roll < 0.02 ? "failed" : roll < 0.04 ? "pending" : "paid",
          reference: ref(r),
          at: days(-55 + Math.floor(r() * 54)),
          lines: chunk,
        });
      }
    }
  }
  payments.sort((a, b) => a.at - b.at);

  const withdrawals: Withdrawal[] = [
    {
      id: "wdr_1", spaceId: "spc_csc400", requestedBy: rep.id, amount: 180_000,
      fee: withdrawalFee(180_000), purpose: "Printing CSC 402 handouts (200 copies)",
      status: "sent", flagged: false, at: days(-31),
    },
    {
      id: "wdr_2", spaceId: "spc_csc400", requestedBy: rep.id, amount: 45_000,
      fee: withdrawalFee(45_000), purpose: "Faculty week decoration and banners",
      status: "sent", flagged: false, at: days(-12),
    },
    {
      id: "wdr_3", spaceId: "spc_nacos", requestedBy: rep.id, amount: 96_000,
      fee: withdrawalFee(96_000), purpose: "Tech week venue deposit",
      status: "sent", flagged: false, at: days(-9),
    },
    {
      id: "wdr_4", spaceId: "spc_eee300", requestedBy: oauRep.id, amount: 60_000,
      fee: withdrawalFee(60_000), purpose: "Lab manual printing",
      status: "pending", flagged: false, at: days(-1),
    },
    {
      id: "wdr_5", spaceId: "spc_csc400", requestedBy: rep.id, amount: 420_000,
      fee: withdrawalFee(420_000), purpose: "Miscellaneous",
      status: "blocked", flagged: true,
      flagReason:
        "9.3x the rep's average withdrawal, requested 02:14 at night, and the purpose is blank of detail.",
      at: days(-1),
    },
  ];

  const paidIn = (spaceId: string) =>
    payments.filter((p) => p.spaceId === spaceId && p.status === "paid");

  const refunds: Refund[] = [
    {
      id: "ref_1", paymentId: paidIn("spc_csc400")[3].id,
      userId: paidIn("spc_csc400")[3].userId, spaceId: "spc_csc400",
      amount: paidIn("spc_csc400")[3].total,
      reason: "Paid the handout twice — the first transfer showed as failed but left my account.",
      status: "pending", at: days(-2),
    },
    {
      id: "ref_2", paymentId: paidIn("spc_csc400")[11].id,
      userId: paidIn("spc_csc400")[11].userId, spaceId: "spc_csc400",
      amount: 3000,
      reason: "Paid faculty week levy but I have deferred this session.",
      status: "pending", at: days(-1),
    },
    {
      id: "ref_3", paymentId: paidIn("spc_nacos")[6].id,
      userId: paidIn("spc_nacos")[6].userId, spaceId: "spc_nacos",
      amount: 2000,
      reason: "Bought two tech week tickets by mistake.",
      status: "approved", at: days(-8),
      note: "Duplicate confirmed against the ledger. Refunded to source.",
    },
    {
      id: "ref_4", paymentId: paidIn("spc_csc400")[20].id,
      userId: paidIn("spc_csc400")[20].userId, spaceId: "spc_csc400",
      amount: 5000,
      reason: "I no longer want to pay departmental dues.",
      status: "rejected", at: days(-15),
      note: "Dues already spent on the departmental printout. Not refundable.",
    },
  ];

  /* Activity log. Seeded from what already happened, then appended to live. */
  const activity: Activity[] = [];
  const log = (
    actorId: string,
    action: string,
    target: string,
    kind: ActivityKind,
    at: number,
  ) => activity.push({ id: `act_${activity.length + 1}`, actorId, action, target, kind, at });

  log(rep.id, "Signed up", "Duelite account", "auth", days(-86));
  log("usr_admin", "Approved rep", rep.name, "approval", days(-85));
  log(rep.id, "Created space", spaces[0].name, "dues", days(-86));
  for (const d of dues) log(d.spaceId === "spc_eee300" ? oauRep.id : rep.id, "Created due", `${d.title} — ₦${d.amount.toLocaleString()}`, "dues", d.deadline - 21 * DAY);
  log(rep.id, "Invited co-rep", `${treasurer.name} as treasurer`, "role", days(-78));
  log(rep.id, "Invited co-rep", `${secretary.name} as secretary`, "role", days(-78));
  log(treasurer.id, "Became signatory", spaces[0].name, "role", days(-77));
  for (const p of payments.slice(-24))
    log(p.userId, "Paid dues", `${p.reference} — ₦${p.total.toLocaleString()}`, "money", p.at);
  for (const w of withdrawals) {
    log(w.requestedBy, "Requested withdrawal", `₦${w.amount.toLocaleString()} — ${w.purpose}`, "money", w.at);
    if (w.status === "sent") log(w.requestedBy, "Withdrawal sent", `₦${w.amount.toLocaleString()} to rep account`, "money", w.at + 600_000);
    if (w.status === "blocked") log("usr_system", "Withdrawal blocked", `Anomaly check — ₦${w.amount.toLocaleString()}`, "money", w.at + 60_000);
  }
  for (const rf of refunds) {
    log(rf.userId, "Requested refund", `₦${rf.amount.toLocaleString()} — ${rf.reason.slice(0, 40)}…`, "dispute", rf.at);
    if (rf.status !== "pending") log("usr_admin", `Refund ${rf.status}`, rf.note ?? "", "dispute", rf.at + 3600_000);
  }
  for (const p of [pendingA, pendingB, pendingC])
    log(p.id, "Requested rep access", `${schools.find((s) => s.id === p.schoolId)!.short}`, "approval", p.joinedAt);
  activity.sort((a, b) => b.at - a.at);

  return {
    schools,
    users,
    spaces,
    dues,
    payments,
    withdrawals,
    refunds,
    activity,
    apiKeys: [
      {
        id: "key_1",
        schoolId: "sch_lautech",
        key: "dlt_live_lautech_7f3c9a21b6e04d8f",
        createdAt: days(-20),
        lastUsedAt: days(-1),
        revoked: false,
      },
    ],
  };
}

/* --------------------------------------------------------------- selectors */

export type SpaceTotals = {
  collected: number;
  fees: number;
  withdrawn: number;
  balance: number;
  payers: number;
  outstanding: number;
};

export function spaceTotals(s: DemoState, spaceId: string): SpaceTotals {
  const paid = s.payments.filter((p) => p.spaceId === spaceId && p.status === "paid");
  const collected = paid.reduce((sum, p) => sum + p.total, 0);
  const fees = paid.reduce((sum, p) => sum + p.fee, 0);
  const sent = s.withdrawals.filter((w) => w.spaceId === spaceId && w.status === "sent");
  const withdrawn = sent.reduce((sum, w) => sum + w.amount + w.fee, 0);
  const space = s.spaces.find((sp) => sp.id === spaceId);
  const expected = s.dues
    .filter((d) => d.spaceId === spaceId)
    .reduce((sum, d) => sum + d.amount * (space?.memberIds.length ?? 0), 0);

  return {
    collected,
    fees,
    withdrawn,
    balance: collected - withdrawn,
    payers: new Set(paid.map((p) => p.userId)).size,
    outstanding: Math.max(expected - collected, 0),
  };
}

/** Per-due breakdown used by both the transparency page and the PDF report. */
export function dueBreakdown(s: DemoState, spaceId: string) {
  const space = s.spaces.find((sp) => sp.id === spaceId);
  const members = space?.memberIds.length ?? 0;
  return s.dues
    .filter((d) => d.spaceId === spaceId)
    .map((due) => {
      const lines = s.payments
        .filter((p) => p.spaceId === spaceId && p.status === "paid")
        .flatMap((p) => p.lines.filter((l) => l.dueId === due.id).map((l) => ({ ...l, userId: p.userId })));
      const collected = lines.reduce((sum, l) => sum + l.amount, 0);
      const payers = new Set(lines.map((l) => l.userId)).size;
      return {
        due,
        collected,
        payers,
        members,
        expected: due.amount * members,
      };
    });
}
