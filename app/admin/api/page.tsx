"use client";

import { useState } from "react";

import { useSchoolScope } from "@/components/admin/shell";
import {
  Button,
  Card,
  Cell,
  Field,
  Row,
  SectionTitle,
  Select,
  Table,
  Tag,
  TextInput,
} from "@/components/admin/ui";
import {
  issueApiKey,
  naira,
  revokeApiKey,
  shortDate,
  touchApiKey,
  useDemo,
  type DemoState,
} from "@/lib/admin/store";

/* The institution API is simulated: there is no server in this build. The
 * handlers below read the same seed the console does, so a school can see the
 * exact shape it would integrate against. */

type Endpoint = {
  id: string;
  method: "GET";
  path: string;
  param: string;
  paramLabel: string;
  sample: (s: DemoState, schoolId: string, value: string) => unknown;
  summary: string;
};

const ENDPOINTS: Endpoint[] = [
  {
    id: "dues",
    method: "GET",
    path: "/v1/students/{matric}/dues",
    param: "matric",
    paramLabel: "Matric number",
    summary: "Every due owed by one student, with what has been paid so far.",
    sample: (s, schoolId, matric) => {
      const user = s.users.find(
        (u) => u.matric.toLowerCase() === matric.trim().toLowerCase(),
      );
      if (!user) return { error: "student_not_found", matric };
      if (user.schoolId !== schoolId)
        return { error: "out_of_scope", detail: "Key is scoped to another institution." };

      const spaces = s.spaces.filter(
        (sp) => sp.schoolId === schoolId && sp.memberIds.includes(user.id),
      );
      const paidLines = s.payments
        .filter((p) => p.userId === user.id && p.status === "paid")
        .flatMap((p) => p.lines);

      return {
        matric: user.matric,
        name: user.name,
        dues: s.dues
          .filter((d) => spaces.some((sp) => sp.id === d.spaceId))
          .map((d) => {
            const paid = paidLines
              .filter((l) => l.dueId === d.id)
              .reduce((sum, l) => sum + l.amount, 0);
            return {
              id: d.id,
              title: d.title,
              amount: d.amount,
              paid,
              status:
                paid >= d.amount ? "paid" : paid > 0 ? "part_paid" : "unpaid",
              deadline: new Date(d.deadline).toISOString().slice(0, 10),
            };
          }),
      };
    },
  },
  {
    id: "clearance",
    method: "GET",
    path: "/v1/students/{matric}/clearance",
    param: "matric",
    paramLabel: "Matric number",
    summary: "One boolean for the clearance desk: is this student square?",
    sample: (s, schoolId, matric) => {
      const user = s.users.find(
        (u) => u.matric.toLowerCase() === matric.trim().toLowerCase(),
      );
      if (!user) return { error: "student_not_found", matric };
      const spaces = s.spaces.filter(
        (sp) => sp.schoolId === schoolId && sp.memberIds.includes(user.id),
      );
      const paidLines = s.payments
        .filter((p) => p.userId === user.id && p.status === "paid")
        .flatMap((p) => p.lines);
      const owed = s.dues
        .filter((d) => spaces.some((sp) => sp.id === d.spaceId))
        .reduce((sum, d) => {
          const paid = paidLines
            .filter((l) => l.dueId === d.id)
            .reduce((n, l) => n + l.amount, 0);
          return sum + Math.max(d.amount - paid, 0);
        }, 0);
      return {
        matric: user.matric,
        name: user.name,
        cleared: owed === 0,
        outstanding: owed,
      };
    },
  },
  {
    id: "spaces",
    method: "GET",
    path: "/v1/spaces",
    param: "",
    paramLabel: "",
    summary: "Spaces belonging to the institution, with collection totals.",
    sample: (s, schoolId) => ({
      spaces: s.spaces
        .filter((sp) => sp.schoolId === schoolId)
        .map((sp) => ({
          id: sp.id,
          name: sp.name,
          kind: sp.kind,
          members: sp.memberIds.length,
          collected: s.payments
            .filter((p) => p.spaceId === sp.id && p.status === "paid")
            .reduce((sum, p) => sum + p.total, 0),
        })),
    }),
  },
];

export default function ApiPage() {
  const demo = useDemo();
  const { schoolId } = useSchoolScope();

  const scopedSchool =
    schoolId === "all" ? demo.schools[0].id : schoolId;
  const keys = demo.apiKeys.filter((k) => k.schoolId === scopedSchool);
  const school = demo.schools.find((s) => s.id === scopedSchool)!;

  const [endpointId, setEndpointId] = useState(ENDPOINTS[0].id);
  const [param, setParam] = useState("2021/CSC/001");
  const [keyId, setKeyId] = useState<string>("");
  const [response, setResponse] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const endpoint = ENDPOINTS.find((e) => e.id === endpointId)!;
  const activeKey =
    keys.find((k) => k.id === keyId && !k.revoked) ?? keys.find((k) => !k.revoked);

  const send = () => {
    if (!activeKey) {
      setResponse(JSON.stringify({ error: "no_active_key" }, null, 2));
      return;
    }
    setBusy(true);
    setResponse("");
    // A short delay so the console reads like a network call rather than a
    // local function, which is all it actually is.
    setTimeout(() => {
      const body = endpoint.sample(demo, scopedSchool, param);
      setResponse(JSON.stringify(body, null, 2));
      touchApiKey(activeKey.id, `${endpoint.method} ${endpoint.path}`);
      setBusy(false);
    }, 450);
  };

  const url = `https://api.duelite.demo${endpoint.path.replace(
    "{matric}",
    encodeURIComponent(param || "{matric}"),
  )}`;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-[26px] font-semibold tracking-tight">
            Institution API
          </h1>
          <Tag tone="brand">Deferred — simulated here</Tag>
        </div>
        <p className="mt-1 text-[14px] text-ink-muted">
          A school&apos;s own portal reads dues data for its own students, so
          clearance stops being a queue at a desk. Keys are scoped to one
          institution: {school.short}.
        </p>
      </div>

      <Card className="p-5">
        <SectionTitle
          title="API keys"
          hint="Scoped to one institution. A revoked key stops working immediately."
          action={
            <Button variant="primary" onClick={() => issueApiKey(scopedSchool)}>
              Issue a key
            </Button>
          }
        />
        <Table head={["Key", "Created", "Last used", "Status", ""]} empty="No keys yet.">
          {keys.map((k) => (
            <Row key={k.id}>
              <Cell className="font-mono text-[12.5px]">{k.key}</Cell>
              <Cell className="text-ink-muted">{shortDate(k.createdAt)}</Cell>
              <Cell className="text-ink-muted">
                {k.lastUsedAt ? shortDate(k.lastUsedAt) : "never"}
              </Cell>
              <Cell>
                <Tag tone={k.revoked ? "bad" : "good"}>
                  {k.revoked ? "revoked" : "active"}
                </Tag>
              </Cell>
              <Cell className="text-right">
                {!k.revoked && (
                  <Button variant="danger" onClick={() => revokeApiKey(k.id)}>
                    Revoke
                  </Button>
                )}
              </Cell>
            </Row>
          ))}
        </Table>
      </Card>

      <Card className="p-5">
        <SectionTitle
          title="Console"
          hint="Send a request against the seeded data and read the response."
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Endpoint">
            <Select
              value={endpointId}
              onChange={(v) => {
                setEndpointId(v);
                setResponse("");
              }}
              options={ENDPOINTS.map((e) => ({
                value: e.id,
                label: `${e.method} ${e.path}`,
              }))}
            />
          </Field>
          <Field label={endpoint.param ? endpoint.paramLabel : "No parameters"}>
            <TextInput
              value={endpoint.param ? param : ""}
              onChange={setParam}
              placeholder={endpoint.param ? "2021/CSC/001" : "—"}
            />
          </Field>
          <Field label="Key">
            <Select
              value={activeKey?.id ?? ""}
              onChange={setKeyId}
              options={
                keys.filter((k) => !k.revoked).length
                  ? keys
                      .filter((k) => !k.revoked)
                      .map((k) => ({ value: k.id, label: k.key }))
                  : [{ value: "", label: "No active key" }]
              }
            />
          </Field>
        </div>

        <pre className="mt-4 overflow-x-auto rounded-xl bg-ink px-4 py-3 font-mono text-[12.5px] leading-relaxed text-white/90">
{`curl ${url} \\
  -H "Authorization: Bearer ${activeKey?.key ?? "dlt_live_…"}"`}
        </pre>

        <div className="mt-3 flex items-center gap-3">
          <Button variant="primary" onClick={send} disabled={busy}>
            {busy ? "Sending…" : "Send request"}
          </Button>
          <span className="text-[13px] text-ink-muted">
            Simulated. Reads the seeded data, not a network.
          </span>
        </div>

        {response && (
          <pre className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-black/[0.07] bg-[#fafafa] px-4 py-3 font-mono text-[12.5px] leading-relaxed">
            {response}
          </pre>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle title="Reference" hint="Three endpoints cover clearance." />
        <Table head={["Endpoint", "Returns"]}>
          {ENDPOINTS.map((e) => (
            <Row key={e.id}>
              <Cell className="font-mono text-[12.5px] whitespace-nowrap">
                {e.method} {e.path}
              </Cell>
              <Cell className="text-ink-muted">{e.summary}</Cell>
            </Row>
          ))}
        </Table>
        <p className="mt-4 text-[13px] text-ink-muted">
          Errors come back as{" "}
          <code className="font-mono">{`{ "error": "student_not_found" }`}</code>{" "}
          with the offending value echoed. A key scoped to {school.short} reading
          another institution&apos;s student gets{" "}
          <code className="font-mono">out_of_scope</code>, never the data. Fees
          are reported in naira ({naira(5000)} is <code className="font-mono">5000</code>).
        </p>
      </Card>
    </div>
  );
}
