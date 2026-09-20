"use client";

import Link from "next/link";

import { useSchoolScope } from "@/components/admin/shell";
import { Card, Cell, Row, SectionTitle, Stat, Table, Tag } from "@/components/admin/ui";
import {
  dateTime,
  naira,
  spaceTotals,
  useDemo,
  userById,
} from "@/lib/admin/store";

export default function AdminOverview() {
  const demo = useDemo();
  const { schoolId } = useSchoolScope();

  const spaces = demo.spaces.filter(
    (s) => schoolId === "all" || s.schoolId === schoolId,
  );
  const spaceIds = new Set(spaces.map((s) => s.id));
  const totals = spaces.map((s) => spaceTotals(demo, s.id));

  const sum = (key: "collected" | "fees" | "withdrawn" | "balance") =>
    totals.reduce((acc, t) => acc + t[key], 0);

  const students = new Set(spaces.flatMap((s) => s.memberIds)).size;
  const pendingReps = demo.users.filter(
    (u) => u.repStatus === "pending" && (schoolId === "all" || u.schoolId === schoolId),
  );
  const flagged = demo.withdrawals.filter(
    (w) => w.flagged && spaceIds.has(w.spaceId),
  );
  const openDisputes = demo.refunds.filter(
    (r) => r.status === "pending" && spaceIds.has(r.spaceId),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-[14px] text-ink-muted">
          {schoolId === "all"
            ? `All ${demo.schools.length} institutions`
            : demo.schools.find((s) => s.id === schoolId)?.name}{" "}
          · {spaces.length} spaces · {students.toLocaleString()} students
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Collected"
          value={naira(sum("collected"))}
          note={`${naira(sum("fees"))} of that is Duelite fees`}
          tone="brand"
        />
        <Stat
          label="Withdrawn"
          value={naira(sum("withdrawn"))}
          note="Payouts to rep accounts, fees included"
        />
        <Stat
          label="Sitting in spaces"
          value={naira(sum("balance"))}
          note="Collected minus everything paid out"
          tone="mint"
        />
        <Stat
          label="Needs a human"
          value={`${pendingReps.length + openDisputes.length + flagged.length}`}
          note={`${pendingReps.length} reps · ${openDisputes.length} disputes · ${flagged.length} flagged`}
          tone="flame"
        />
      </div>

      {(pendingReps.length > 0 || flagged.length > 0) && (
        <Card className="p-5">
          <SectionTitle
            title="Waiting on you"
            hint="Nothing collects money until a person signs off on it."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {pendingReps.length > 0 && (
              <Link
                href="/admin/reps"
                className="rounded-xl border border-black/[0.07] p-4 transition-colors hover:bg-lilac"
              >
                <Tag tone="warn">{pendingReps.length} pending</Tag>
                <p className="mt-2 font-medium">Rep approvals</p>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {pendingReps.map((r) => r.name).join(", ")}
                </p>
              </Link>
            )}
            {flagged.length > 0 && (
              <Link
                href="/admin/transactions"
                className="rounded-xl border border-black/[0.07] p-4 transition-colors hover:bg-lilac"
              >
                <Tag tone="bad">{flagged.length} flagged</Tag>
                <p className="mt-2 font-medium">Blocked withdrawals</p>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {flagged[0].flagReason}
                </p>
              </Link>
            )}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <SectionTitle
          title="Spaces"
          hint="Every space, what it has taken in, and what is left."
          action={
            <Link
              href="/admin/spaces"
              className="text-[13.5px] font-medium text-brand hover:underline"
            >
              Manage spaces
            </Link>
          }
        />
        <Table
          head={["Space", "Institution", "Members", "Collected", "Balance", ""]}
        >
          {spaces.map((space) => {
            const t = spaceTotals(demo, space.id);
            const school = demo.schools.find((s) => s.id === space.schoolId);
            return (
              <Row key={space.id}>
                <Cell className="font-medium">{space.name}</Cell>
                <Cell className="text-ink-muted">{school?.short}</Cell>
                <Cell>{space.memberIds.length}</Cell>
                <Cell>{naira(t.collected)}</Cell>
                <Cell className="font-medium">{naira(t.balance)}</Cell>
                <Cell>
                  <Link
                    href={`/t/${space.joinCode}`}
                    className="text-[13px] font-medium text-brand hover:underline"
                  >
                    Public page
                  </Link>
                </Cell>
              </Row>
            );
          })}
        </Table>
      </Card>

      <Card className="p-5">
        <SectionTitle
          title="Latest activity"
          hint="The same log the transparency page and the audit report are built from."
          action={
            <Link
              href="/admin/activity"
              className="text-[13.5px] font-medium text-brand hover:underline"
            >
              Full log
            </Link>
          }
        />
        <Table head={["When", "Who", "Did what", "On"]}>
          {demo.activity.slice(0, 8).map((a) => (
            <Row key={a.id}>
              <Cell className="whitespace-nowrap text-ink-muted">
                {dateTime(a.at)}
              </Cell>
              <Cell>{userById(demo, a.actorId)?.name ?? "Duelite"}</Cell>
              <Cell className="font-medium">{a.action}</Cell>
              <Cell className="text-ink-muted">{a.target}</Cell>
            </Row>
          ))}
        </Table>
      </Card>
    </div>
  );
}
