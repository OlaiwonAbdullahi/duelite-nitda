"use client";

import { useState } from "react";

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
import { dateTime, useDemo, userById, type ActivityKind } from "@/lib/demo/store";

const KINDS: { value: string; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "auth", label: "Sign in and sign up" },
  { value: "approval", label: "Approvals" },
  { value: "dues", label: "Spaces and dues" },
  { value: "money", label: "Money" },
  { value: "role", label: "Roles" },
  { value: "dispute", label: "Disputes" },
  { value: "api", label: "Institution API" },
];

const TONE: Record<ActivityKind, "neutral" | "brand" | "good" | "warn" | "bad"> = {
  auth: "neutral",
  approval: "good",
  dues: "brand",
  money: "warn",
  role: "brand",
  dispute: "bad",
  api: "neutral",
};

export default function ActivityPage() {
  const demo = useDemo();
  const { schoolId } = useSchoolScope();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [limit, setLimit] = useState(60);

  const q = query.trim().toLowerCase();
  const rows = demo.activity.filter((a) => {
    const actor = userById(demo, a.actorId);
    if (schoolId !== "all" && actor && actor.schoolId !== schoolId) return false;
    if (kind !== "all" && a.kind !== kind) return false;
    if (!q) return true;
    return (
      a.action.toLowerCase().includes(q) ||
      a.target.toLowerCase().includes(q) ||
      (actor?.name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">Activity log</h1>
        <p className="mt-1 text-[14px] text-ink-muted">
          Who did what, and when. Entries are written by the same code that
          changes the money, so there is no version of events that skips one.
        </p>
      </div>

      <Card className="p-5">
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Field label="Search">
            <TextInput
              value={query}
              onChange={setQuery}
              placeholder="Person, action or target"
            />
          </Field>
          <Field label="Kind">
            <Select value={kind} onChange={setKind} options={KINDS} />
          </Field>
        </div>

        <p className="mb-2 text-[13px] text-ink-muted">
          {rows.length.toLocaleString()} entries
        </p>

        <Table
          head={["When", "Who", "Action", "Target", "Kind"]}
          empty="No log entries match that."
        >
          {rows.slice(0, limit).map((a) => (
            <Row key={a.id}>
              <Cell className="whitespace-nowrap text-ink-muted">
                {dateTime(a.at)}
              </Cell>
              <Cell>{userById(demo, a.actorId)?.name ?? "Duelite"}</Cell>
              <Cell className="font-medium">{a.action}</Cell>
              <Cell className="max-w-[320px] truncate text-ink-muted">
                {a.target}
              </Cell>
              <Cell>
                <Tag tone={TONE[a.kind]}>{a.kind}</Tag>
              </Cell>
            </Row>
          ))}
        </Table>

        {rows.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((n) => n + 80)}
            className="mt-4 w-full rounded-xl border border-black/10 py-2.5 text-[13.5px] font-medium hover:bg-lilac"
          >
            Show more ({(rows.length - limit).toLocaleString()} left)
          </button>
        )}
      </Card>
    </div>
  );
}
