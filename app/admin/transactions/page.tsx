"use client";

import { useMemo, useState } from "react";

import { useSchoolScope } from "@/components/admin/shell";
import {
  Card,
  Cell,
  Field,
  Row,
  Select,
  Table,
  Tag,
  TextInput,
} from "@/components/admin/ui";
import {
  dateTime,
  naira,
  useDemo,
  userById,
  type DemoState,
} from "@/lib/demo/store";

type Txn = {
  id: string;
  kind: "payment" | "withdrawal";
  at: number;
  spaceId: string;
  who: string;
  detail: string;
  amount: number;
  fee: number;
  status: string;
  reference: string;
  flagReason?: string;
};

/** Payments in and withdrawals out are one list here: an operator chasing a
 *  complaint does not know in advance which of the two they are looking for. */
function toTransactions(demo: DemoState, spaceIds: Set<string>): Txn[] {
  const dueTitle = (id: string) =>
    demo.dues.find((d) => d.id === id)?.title ?? "Unknown due";

  const payments: Txn[] = demo.payments
    .filter((p) => spaceIds.has(p.spaceId))
    .map((p) => ({
      id: p.id,
      kind: "payment",
      at: p.at,
      spaceId: p.spaceId,
      who: userById(demo, p.userId)?.name ?? "Unknown",
      detail: p.lines.map((l) => dueTitle(l.dueId)).join(", "),
      amount: p.total,
      fee: p.fee,
      status: p.status,
      reference: p.reference,
    }));

  const withdrawals: Txn[] = demo.withdrawals
    .filter((w) => spaceIds.has(w.spaceId))
    .map((w) => ({
      id: w.id,
      kind: "withdrawal",
      at: w.at,
      spaceId: w.spaceId,
      who: userById(demo, w.requestedBy)?.name ?? "Unknown",
      detail: w.purpose,
      amount: -w.amount,
      fee: w.fee,
      status: w.status,
      reference: w.id.toUpperCase(),
      flagReason: w.flagReason,
    }));

  return [...payments, ...withdrawals].sort((a, b) => b.at - a.at);
}

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  paid: "good",
  sent: "good",
  pending: "warn",
  failed: "bad",
  blocked: "bad",
};

export default function TransactionsPage() {
  const demo = useDemo();
  const { schoolId } = useSchoolScope();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [space, setSpace] = useState("all");
  const [limit, setLimit] = useState(40);

  const spaces = demo.spaces.filter(
    (s) => schoolId === "all" || s.schoolId === schoolId,
  );
  const spaceIds = useMemo(() => new Set(spaces.map((s) => s.id)), [spaces]);
  const all = useMemo(() => toTransactions(demo, spaceIds), [demo, spaceIds]);

  const q = query.trim().toLowerCase();
  const rows = all.filter(
    (t) =>
      (kind === "all" || t.kind === kind) &&
      (status === "all" || t.status === status) &&
      (space === "all" || t.spaceId === space) &&
      (!q ||
        t.who.toLowerCase().includes(q) ||
        t.detail.toLowerCase().includes(q) ||
        t.reference.toLowerCase().includes(q)),
  );

  const flagged = rows.filter((t) => t.flagReason);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">Transactions</h1>
        <p className="mt-1 text-[14px] text-ink-muted">
          Money in and money out, in one list, searchable by name, reference or
          purpose.
        </p>
      </div>

      {flagged.map((t) => (
        <Card key={t.id} className="border-red-200 bg-red-50/60 p-5">
          <Tag tone="bad">Blocked by the anomaly check</Tag>
          <p className="mt-2 font-medium">
            {naira(-t.amount)} — {t.detail}
          </p>
          <p className="mt-1 text-[13.5px] text-ink-muted">{t.flagReason}</p>
        </Card>
      ))}

      <Card className="p-5">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search">
            <TextInput
              value={query}
              onChange={setQuery}
              placeholder="Name, reference or purpose"
            />
          </Field>
          <Field label="Direction">
            <Select
              value={kind}
              onChange={setKind}
              options={[
                { value: "all", label: "Everything" },
                { value: "payment", label: "Payments in" },
                { value: "withdrawal", label: "Withdrawals out" },
              ]}
            />
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "Any status" },
                ...["paid", "pending", "failed", "sent", "blocked"].map((s) => ({
                  value: s,
                  label: s,
                })),
              ]}
            />
          </Field>
          <Field label="Space">
            <Select
              value={space}
              onChange={setSpace}
              options={[
                { value: "all", label: "All spaces" },
                ...spaces.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </Field>
        </div>

        <p className="mb-2 text-[13px] text-ink-muted">
          {rows.length.toLocaleString()} matching{" "}
          {rows.length === 1 ? "transaction" : "transactions"}
        </p>

        <Table
          head={["When", "Reference", "Who", "What", "Amount", "Fee", "Status"]}
          empty="Nothing matches those filters."
        >
          {rows.slice(0, limit).map((t) => (
            <Row key={t.id}>
              <Cell className="whitespace-nowrap text-ink-muted">
                {dateTime(t.at)}
              </Cell>
              <Cell className="font-mono text-[12.5px]">{t.reference}</Cell>
              <Cell>{t.who}</Cell>
              <Cell className="max-w-[260px] truncate text-ink-muted">
                {t.detail}
              </Cell>
              <Cell
                className={`font-medium ${t.amount < 0 ? "text-flame" : "text-ink"}`}
              >
                {t.amount < 0 ? "−" : "+"}
                {naira(Math.abs(t.amount))}
              </Cell>
              <Cell className="text-ink-muted">{naira(t.fee)}</Cell>
              <Cell>
                <Tag tone={STATUS_TONE[t.status] ?? "neutral"}>{t.status}</Tag>
              </Cell>
            </Row>
          ))}
        </Table>

        {rows.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((n) => n + 60)}
            className="mt-4 w-full rounded-xl border border-black/10 py-2.5 text-[13.5px] font-medium hover:bg-lilac"
          >
            Show more ({(rows.length - limit).toLocaleString()} left)
          </button>
        )}
      </Card>
    </div>
  );
}
