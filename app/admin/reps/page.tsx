"use client";

import { useSchoolScope } from "@/components/admin/shell";
import {
  Button,
  Card,
  Cell,
  Row,
  SectionTitle,
  Table,
  Tag,
} from "@/components/admin/ui";
import {
  approveRep,
  rejectRep,
  shortDate,
  spaceTotals,
  naira,
  useDemo,
} from "@/lib/admin/store";

export default function RepsPage() {
  const demo = useDemo();
  const { schoolId } = useSchoolScope();

  const inScope = (sid: string) => schoolId === "all" || sid === schoolId;
  const reps = demo.users.filter((u) => u.repStatus !== "none" && inScope(u.schoolId));
  const pending = reps.filter((u) => u.repStatus === "pending");
  const decided = reps.filter((u) => u.repStatus !== "pending");

  const school = (id: string) => demo.schools.find((s) => s.id === id)?.short ?? "—";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">Reps</h1>
        <p className="mt-1 text-[14px] text-ink-muted">
          A rep cannot collect a naira until someone here approves them. That
          human step is the first safeguard in the product.
        </p>
      </div>

      <Card className="p-5">
        <SectionTitle
          title="Pending approval"
          hint="KYC has run. What is left is a person deciding."
        />
        <Table head={["Name", "Institution", "KYC", "Requested", ""]} empty="Nobody is waiting.">
          {pending.map((u) => (
            <Row key={u.id}>
              <Cell>
                <p className="font-medium">{u.name}</p>
                <p className="text-[12.5px] text-ink-muted">{u.email}</p>
              </Cell>
              <Cell className="text-ink-muted">{school(u.schoolId)}</Cell>
              <Cell>
                <Tag tone={u.kyc === "verified" ? "good" : u.kyc === "pending" ? "warn" : "neutral"}>
                  {u.kyc === "none" ? "not started" : u.kyc}
                </Tag>
              </Cell>
              <Cell className="whitespace-nowrap text-ink-muted">
                {shortDate(u.joinedAt)}
              </Cell>
              <Cell>
                <div className="flex justify-end gap-2">
                  <Button variant="danger" onClick={() => rejectRep(u.id)}>
                    Reject
                  </Button>
                  <Button variant="primary" onClick={() => approveRep(u.id)}>
                    Approve
                  </Button>
                </div>
              </Cell>
            </Row>
          ))}
        </Table>
      </Card>

      <Card className="p-5">
        <SectionTitle
          title="Approved and rejected"
          hint="Every decision is written to the activity log with who made it."
        />
        <Table head={["Name", "Institution", "Status", "Spaces owned", "Collected"]}>
          {decided.map((u) => {
            const owned = demo.spaces.filter((s) => s.ownerId === u.id);
            const collected = owned.reduce(
              (sum, s) => sum + spaceTotals(demo, s.id).collected,
              0,
            );
            return (
              <Row key={u.id}>
                <Cell>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-[12.5px] text-ink-muted">{u.email}</p>
                </Cell>
                <Cell className="text-ink-muted">{school(u.schoolId)}</Cell>
                <Cell>
                  <Tag tone={u.repStatus === "approved" ? "good" : "bad"}>
                    {u.repStatus}
                  </Tag>
                </Cell>
                <Cell>{owned.length ? owned.map((s) => s.name).join(", ") : "—"}</Cell>
                <Cell>{collected ? naira(collected) : "—"}</Cell>
              </Row>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}
