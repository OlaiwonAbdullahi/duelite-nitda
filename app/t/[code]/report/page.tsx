"use client";

import { use, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Select } from "@/components/admin/ui";
import {
  DEMO_NOW,
  dateTime,
  naira,
  shortDate,
  spaceByCode,
  useDemo,
  userById,
} from "@/lib/admin/store";

/* Exportable audit report.
 *
 * "Export to PDF" is the browser's own print-to-PDF, driven by the print
 * stylesheet in globals.css. A PDF library would add a second rendering engine
 * to keep in sync with this page for no gain the HOD can see.
 * ponytail: print-to-PDF, swap in a renderer if the file has to be generated
 * server-side (emailed statements, scheduled reports). */

const PERIODS = [
  { value: "0", label: "Everything to date" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

export default function AuditReport({ params }: PageProps<"/t/[code]/report">) {
  const { code } = use(params);
  const demo = useDemo();
  const [period, setPeriod] = useState("0");

  const space = spaceByCode(demo, code);
  if (!space) notFound();

  const days = Number(period);
  // Pegged to the demo clock, like the rest of the seeded world.
  const since = days ? DEMO_NOW - days * 86_400_000 : 0;
  const within = (at: number) => at >= since;

  const school = demo.schools.find((s) => s.id === space.schoolId);
  const owner = userById(demo, space.ownerId);

  const payments = demo.payments.filter(
    (p) => p.spaceId === space.id && p.status === "paid" && within(p.at),
  );
  const withdrawals = demo.withdrawals
    .filter((w) => w.spaceId === space.id && w.status === "sent" && within(w.at))
    .sort((a, b) => a.at - b.at);

  const collected = payments.reduce((sum, p) => sum + p.total, 0);
  const studentFees = payments.reduce((sum, p) => sum + p.fee, 0);
  const paidOut = withdrawals.reduce((sum, w) => sum + w.amount, 0);
  const withdrawalFees = withdrawals.reduce((sum, w) => sum + w.fee, 0);

  // Opening balance is everything that happened before the chosen window.
  const priorIn = demo.payments
    .filter((p) => p.spaceId === space.id && p.status === "paid" && !within(p.at))
    .reduce((sum, p) => sum + p.total, 0);
  const priorOut = demo.withdrawals
    .filter((w) => w.spaceId === space.id && w.status === "sent" && !within(w.at))
    .reduce((sum, w) => sum + w.amount + w.fee, 0);
  const opening = priorIn - priorOut;
  const closing = opening + collected - paidOut - withdrawalFees;

  const lines = payments.flatMap((p) => p.lines.map((l) => ({ ...l, userId: p.userId })));
  const byDue = demo.dues
    .filter((d) => d.spaceId === space.id)
    .map((due) => {
      const mine = lines.filter((l) => l.dueId === due.id);
      return {
        due,
        collected: mine.reduce((sum, l) => sum + l.amount, 0),
        payers: new Set(mine.map((l) => l.userId)).size,
      };
    })
    .filter((r) => r.collected > 0 || days === 0);

  return (
    <div className="min-h-screen bg-[#fafafa] py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-5 flex max-w-[820px] flex-wrap items-center justify-between gap-3 px-5">
        <Link
          href={`/t/${space.joinCode}`}
          className="text-[13.5px] font-medium text-brand hover:underline"
        >
          ← Back to the transparency page
        </Link>
        <div className="flex items-center gap-2">
          <Select
            value={period}
            onChange={setPeriod}
            options={PERIODS}
            className="w-[190px]"
          />
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full bg-ink px-4 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-brand"
          >
            Export as PDF
          </button>
        </div>
      </div>

      <article className="mx-auto max-w-[820px] bg-white px-10 py-10 text-[13.5px] leading-relaxed shadow-sm print:max-w-none print:px-0 print:shadow-none">
        <header className="border-b-2 border-ink pb-4">
          <p className="font-mono text-[11.5px] uppercase tracking-widest text-ink-muted">
            Duelite financial statement
          </p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-tight">
            {space.name}
          </h1>
          <p className="mt-1 text-ink-muted">
            {school?.name} · {space.kind} space · {space.memberIds.length} members
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-3">
            {[
              ["Prepared for", "Head of Department"],
              ["Collected by", owner?.name ?? "—"],
              ["Period", PERIODS.find((p) => p.value === period)!.label],
              ["Generated", dateTime(DEMO_NOW)],
              ["Space code", space.joinCode],
              ["Signatories", String(space.signatoryIds.length)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] uppercase tracking-wide text-ink-muted">
                  {k}
                </dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <Section title="1. Summary">
          <table className="w-full border-collapse">
            <tbody>
              {[
                ["Opening balance", opening],
                ["Collected from students", collected],
                ["Withdrawn by the rep", -paidOut],
                ["Withdrawal fees", -withdrawalFees],
              ].map(([label, value]) => (
                <tr key={label as string} className="border-b border-black/[0.07]">
                  <td className="py-2">{label}</td>
                  <td className="py-2 text-right font-mono">
                    {(value as number) < 0 ? "−" : ""}
                    {naira(Math.abs(value as number))}
                  </td>
                </tr>
              ))}
              <tr className="border-b-2 border-ink">
                <td className="py-2.5 font-semibold">Closing balance</td>
                <td className="py-2.5 text-right font-mono font-semibold">
                  {naira(closing)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[12.5px] text-ink-muted">
            Students paid {naira(studentFees)} in Duelite fees on top of the
            amounts above. The space itself is never charged — every due arrives
            at its full face value.
          </p>
        </Section>

        <Section title="2. Collections by due">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-ink text-left">
                <th className="py-2 font-semibold">Due</th>
                <th className="py-2 font-semibold">Amount</th>
                <th className="py-2 font-semibold">Payers</th>
                <th className="py-2 text-right font-semibold">Collected</th>
              </tr>
            </thead>
            <tbody>
              {byDue.map(({ due, collected: c, payers }) => (
                <tr key={due.id} className="border-b border-black/[0.07]">
                  <td className="py-2">
                    {due.title}
                    <span className="ml-2 text-[12px] text-ink-muted">
                      {due.type}
                    </span>
                  </td>
                  <td className="py-2 font-mono">{naira(due.amount)}</td>
                  <td className="py-2">
                    {payers} / {space.memberIds.length}
                  </td>
                  <td className="py-2 text-right font-mono">{naira(c)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2.5 font-semibold" colSpan={3}>
                  Total collected
                </td>
                <td className="py-2.5 text-right font-mono font-semibold">
                  {naira(collected)}
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Section title="3. Withdrawals">
          {withdrawals.length === 0 ? (
            <p className="text-ink-muted">
              No money left the space in this period.
            </p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-ink text-left">
                  <th className="py-2 font-semibold">Date</th>
                  <th className="py-2 font-semibold">Purpose</th>
                  <th className="py-2 font-semibold">Fee</th>
                  <th className="py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-black/[0.07]">
                    <td className="py-2 whitespace-nowrap">{shortDate(w.at)}</td>
                    <td className="py-2">{w.purpose}</td>
                    <td className="py-2 font-mono">{naira(w.fee)}</td>
                    <td className="py-2 text-right font-mono">{naira(w.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2.5 font-semibold" colSpan={3}>
                    Total withdrawn, fees included
                  </td>
                  <td className="py-2.5 text-right font-mono font-semibold">
                    {naira(paidOut + withdrawalFees)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="mt-3 text-[12.5px] text-ink-muted">
            Each withdrawal above was released only after two separate
            signatories entered their one-time codes.
          </p>
        </Section>

        <footer className="mt-10 border-t border-black/[0.1] pt-4 text-[11.5px] text-ink-muted">
          <p>
            Generated by Duelite from the space&apos;s activity log. Verify any
            line against the public page at /t/{space.joinCode}.
          </p>
          <p className="mt-1">
            Demo data — every name, number and transaction here is invented, and
            no real money moved.
          </p>
        </footer>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 break-inside-avoid">
      <h2 className="mb-3 text-[15px] font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}
