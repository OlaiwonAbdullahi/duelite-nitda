"use client";

import Link from "next/link";

import { useSchoolScope } from "@/components/admin/shell";
import {
  Button,
  Card,
  Cell,
  Row,
  Table,
  Tag,
} from "@/components/admin/ui";
import {
  dueBreakdown,
  naira,
  setSpaceStatus,
  shortDate,
  spaceTotals,
  useDemo,
  userById,
} from "@/lib/admin/store";

export default function SpacesPage() {
  const demo = useDemo();
  const { schoolId } = useSchoolScope();

  const spaces = demo.spaces.filter(
    (s) => schoolId === "all" || s.schoolId === schoolId,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">Spaces</h1>
        <p className="mt-1 text-[14px] text-ink-muted">
          Every space belongs to one institution. Switching institutions in the
          header changes what this page can see at all.
        </p>
      </div>

      {spaces.length === 0 && (
        <Card className="p-10 text-center text-ink-muted">
          No spaces in this institution yet.
        </Card>
      )}

      {spaces.map((space) => {
        const t = spaceTotals(demo, space.id);
        const school = demo.schools.find((s) => s.id === space.schoolId);
        const owner = userById(demo, space.ownerId);
        const breakdown = dueBreakdown(demo, space.id);

        return (
          <Card key={space.id} className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[0.06] p-5">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[18px] font-semibold tracking-tight">
                    {space.name}
                  </h2>
                  <Tag tone={space.status === "active" ? "good" : "warn"}>
                    {space.status}
                  </Tag>
                </div>
                <p className="mt-1 text-[13.5px] text-ink-muted">
                  {school?.short} · {space.kind} · owned by {owner?.name} ·
                  opened {shortDate(space.createdAt)}
                </p>
                <p className="mt-2 font-mono text-[12.5px] text-ink-muted">
                  join code <span className="text-ink">{space.joinCode}</span> ·
                  {" "}
                  {space.memberIds.length} members ·{" "}
                  {space.signatoryIds.length} signatories
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/t/${space.joinCode}`}
                  className="inline-flex items-center rounded-full border border-black/10 px-3.5 py-2 text-[13.5px] font-medium transition-colors hover:bg-lilac"
                >
                  Transparency page
                </Link>
                <Link
                  href={`/t/${space.joinCode}/report`}
                  className="inline-flex items-center rounded-full border border-black/10 px-3.5 py-2 text-[13.5px] font-medium transition-colors hover:bg-lilac"
                >
                  Audit report
                </Link>
                <Button
                  variant={space.status === "active" ? "danger" : "primary"}
                  onClick={() =>
                    setSpaceStatus(
                      space.id,
                      space.status === "active" ? "paused" : "active",
                    )
                  }
                >
                  {space.status === "active" ? "Pause collection" : "Reactivate"}
                </Button>
              </div>
            </div>

            <div className="grid gap-px bg-black/[0.06] sm:grid-cols-4">
              {[
                ["Collected", naira(t.collected)],
                ["Withdrawn", naira(t.withdrawn)],
                ["Balance", naira(t.balance)],
                ["Paid at least once", `${t.payers} of ${space.memberIds.length}`],
              ].map(([label, value]) => (
                <div key={label} className="bg-white px-5 py-4">
                  <p className="text-[11.5px] font-medium uppercase tracking-wide text-ink-muted">
                    {label}
                  </p>
                  <p className="mt-1 text-[17px] font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <Table head={["Due", "Type", "Amount", "Payers", "Collected", "Deadline"]}>
              {breakdown.map(({ due, collected, payers, members }) => (
                <Row key={due.id}>
                  <Cell className="font-medium">
                    {due.title}
                    {due.allowInstalments && (
                      <span className="ml-2 text-[12px] text-ink-muted">
                        instalments on
                      </span>
                    )}
                  </Cell>
                  <Cell className="text-ink-muted">{due.type}</Cell>
                  <Cell>{naira(due.amount)}</Cell>
                  <Cell>
                    {payers} / {members}
                  </Cell>
                  <Cell className="font-medium">{naira(collected)}</Cell>
                  <Cell className="whitespace-nowrap text-ink-muted">
                    {shortDate(due.deadline)}
                  </Cell>
                </Row>
              ))}
            </Table>
          </Card>
        );
      })}
    </div>
  );
}
