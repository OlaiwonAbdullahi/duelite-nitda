"use client";

import { use, useSyncExternalStore } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, Tag } from "@/components/admin/ui";
import Qr from "@/components/public/qr";
import { Logo } from "@/components/site-header";
import {
  dueBreakdown,
  naira,
  shortDate,
  spaceByCode,
  spaceTotals,
  useDemo,
  userById,
} from "@/lib/admin/store";

export default function TransparencyPage({ params }: PageProps<"/t/[code]">) {
  const { code } = use(params);
  const demo = useDemo();
  // Browser-only value: empty on the server, the real URL after hydration.
  const url = useSyncExternalStore(
    () => () => {},
    () => window.location.href,
    () => "",
  );

  const space = spaceByCode(demo, code);
  if (!space) notFound();

  const totals = spaceTotals(demo, space.id);
  const school = demo.schools.find((s) => s.id === space.schoolId);
  const owner = userById(demo, space.ownerId);
  const breakdown = dueBreakdown(demo, space.id);
  const withdrawals = demo.withdrawals
    .filter((w) => w.spaceId === space.id && w.status === "sent")
    .sort((a, b) => b.at - a.at);

  return (
    <div className="min-h-screen bg-[#fafafa] pb-16">
      <header className="border-b border-black/[0.06] bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/" aria-label="Duelite home">
            <Logo />
          </Link>
          <Tag tone="brand">Public — no login</Tag>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">
            {space.name}
          </h1>
          <p className="mt-1 text-[14px] text-ink-muted">
            {school?.name} · collected by {owner?.name} · {space.memberIds.length}{" "}
            members
          </p>
          <p className="mt-3 text-[14px] text-ink-muted">
            Anyone with this link can see where the money is. Names, matric
            numbers and individual payments are not shown here.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["Collected", naira(totals.collected), "text-brand"],
            ["Withdrawn", naira(totals.withdrawn), "text-flame"],
            ["Balance", naira(totals.balance), "text-mint"],
          ].map(([label, value, tone]) => (
            <Card key={label} className="p-5">
              <p className="text-[12px] font-medium uppercase tracking-wide text-ink-muted">
                {label}
              </p>
              <p className={`mt-2 text-[24px] font-semibold tracking-tight ${tone}`}>
                {value}
              </p>
            </Card>
          ))}
        </div>

        <Card className="p-5">
          <h2 className="text-[17px] font-semibold tracking-tight">
            What has been collected
          </h2>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            {totals.payers} of {space.memberIds.length} members have paid
            something.
          </p>
          <div className="mt-4 space-y-4">
            {breakdown.map(({ due, collected, payers, members, expected }) => (
              <div key={due.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{due.title}</p>
                  <p className="text-[13.5px] text-ink-muted">
                    {naira(collected)} of {naira(expected)} · {payers}/{members}{" "}
                    paid
                  </p>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/[0.06]">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{
                      width: `${expected ? Math.min((collected / expected) * 100, 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[17px] font-semibold tracking-tight">
            Where it went
          </h2>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Every withdrawal, with the purpose given at the time. Each one
            needed two signatories.
          </p>
          <ul className="mt-4 space-y-3">
            {withdrawals.length === 0 && (
              <li className="text-[14px] text-ink-muted">
                Nothing has been withdrawn yet.
              </li>
            )}
            {withdrawals.map((w) => (
              <li
                key={w.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/[0.05] pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{w.purpose}</p>
                  <p className="text-[13px] text-ink-muted">
                    {shortDate(w.at)} · {naira(w.fee)} withdrawal fee
                  </p>
                </div>
                <p className="font-medium text-flame">−{naira(w.amount)}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex flex-wrap items-center justify-between gap-6 p-5">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight">
              Share this page
            </h2>
            <p className="mt-1 max-w-sm text-[13.5px] text-ink-muted">
              Drop the link in the class group, or let people scan it. No
              account is needed to open it.
            </p>
            <Link
              href={`/t/${space.joinCode}/report`}
              className="mt-3 inline-flex items-center rounded-full bg-ink px-4 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-brand"
            >
              Open the audit report
            </Link>
          </div>
          {url && <Qr value={url} />}
        </Card>

        <p className="text-center text-[12.5px] text-ink-muted">
          Demo data. Every name, number and transaction on this page is invented.
        </p>
      </main>
    </div>
  );
}
