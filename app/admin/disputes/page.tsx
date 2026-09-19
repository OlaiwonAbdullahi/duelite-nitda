"use client";

import { useState } from "react";

import { useSchoolScope } from "@/components/admin/shell";
import {
  Button,
  Card,
  SectionTitle,
  Tag,
  TextInput,
} from "@/components/admin/ui";
import {
  dateTime,
  naira,
  resolveRefund,
  shortDate,
  spaceById,
  useDemo,
  userById,
  type Refund,
} from "@/lib/demo/store";

const TONE = {
  pending: "warn",
  approved: "good",
  rejected: "bad",
  escalated: "brand",
} as const;

export default function DisputesPage() {
  const demo = useDemo();
  const { schoolId } = useSchoolScope();

  const inScope = (r: Refund) =>
    schoolId === "all" || spaceById(demo, r.spaceId)?.schoolId === schoolId;

  const refunds = demo.refunds.filter(inScope).sort((a, b) => b.at - a.at);
  const open = refunds.filter((r) => r.status === "pending");
  const closed = refunds.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">
          Refunds and disputes
        </h1>
        <p className="mt-1 text-[14px] text-ink-muted">
          A student who paid the wrong thing gets a route that does not depend
          on the rep&apos;s goodwill. Every decision is logged with its reason.
        </p>
      </div>

      <section>
        <SectionTitle
          title={`Open queue (${open.length})`}
          hint="The payment, the reason and the payer's history come attached."
        />
        <div className="space-y-4">
          {open.length === 0 && (
            <Card className="p-10 text-center text-ink-muted">
              Queue is clear.
            </Card>
          )}
          {open.map((refund) => (
            <DisputeCard key={refund.id} refund={refund} />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle title="Settled" hint="Kept for the audit trail." />
        <div className="space-y-3">
          {closed.map((refund) => {
            const user = userById(demo, refund.userId);
            return (
              <Card key={refund.id} className="p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Tag tone={TONE[refund.status]}>{refund.status}</Tag>
                  <span className="font-medium">{naira(refund.amount)}</span>
                  <span className="text-[13.5px] text-ink-muted">
                    {user?.name} · {user?.matric} · {shortDate(refund.at)}
                  </span>
                </div>
                <p className="mt-2 text-[14px]">{refund.reason}</p>
                {refund.note && (
                  <p className="mt-1 text-[13.5px] text-ink-muted">
                    Decision: {refund.note}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function DisputeCard({ refund }: { refund: Refund }) {
  const demo = useDemo();
  const [note, setNote] = useState("");

  const user = userById(demo, refund.userId);
  const space = spaceById(demo, refund.spaceId);
  const payment = demo.payments.find((p) => p.id === refund.paymentId);
  const history = demo.payments.filter(
    (p) => p.userId === refund.userId && p.status === "paid",
  );

  const decide = (status: Refund["status"]) => resolveRefund(refund.id, status, note);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="warn">pending</Tag>
            <span className="text-[17px] font-semibold">
              {naira(refund.amount)}
            </span>
            <span className="text-[13.5px] text-ink-muted">
              raised {dateTime(refund.at)}
            </span>
          </div>
          <p className="mt-2 text-[14.5px]">{refund.reason}</p>
          <p className="mt-2 text-[13px] text-ink-muted">
            {user?.name} · {user?.matric} · {space?.name}
          </p>
        </div>

        <div className="rounded-xl bg-lilac/70 px-4 py-3 text-[13px]">
          <p className="font-medium text-brand">Attached payment</p>
          <p className="mt-1 font-mono text-[12.5px]">{payment?.reference}</p>
          <p className="mt-1 text-ink-muted">
            {payment ? naira(payment.total) : "—"} on{" "}
            {payment ? shortDate(payment.at) : "—"}
          </p>
          <p className="mt-1 text-ink-muted">
            {history.length} successful payments in total
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-black/[0.06] pt-4">
        <div className="min-w-[240px] flex-1">
          <TextInput
            value={note}
            onChange={setNote}
            placeholder="Reason for the decision (goes into the log)"
          />
        </div>
        <Button variant="danger" onClick={() => decide("rejected")}>
          Reject
        </Button>
        <Button onClick={() => decide("escalated")}>Escalate</Button>
        <Button variant="primary" onClick={() => decide("approved")}>
          Approve refund
        </Button>
      </div>
    </Card>
  );
}
