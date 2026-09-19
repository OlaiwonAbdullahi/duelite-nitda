"use client";

import { useState } from "react";
import { BURST_SIZE, COHORT_SIZE, dueProgress, outstandingRows, paymentRows, publishedDues, spaceTotals } from "@/lib/demo/collections";
import { spacePermission, visibleSpaces } from "@/lib/demo/spaces";
import { label, money } from "./spaces";
import { useDemo } from "./demo-provider";

const LIMIT = 20;
const time = (value: string) => new Date(value).toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

export function Collections() {
  const { state, feed, connectFeed, disconnectFeed, setTrickle, burst, replayLast, simulateDrop, simulateError } = useDemo();
  const [dueFilter, setDueFilter] = useState("");
  const [query, setQuery] = useState("");
  const space = visibleSpaces(state).find(item => item.id === state.selectedSpaceId);

  if (!space) return <section id="collections" className="dash-section">
    <div className="dash-section-title"><h2>Live collections</h2><span className="dash-status">No space</span></div>
    <p className="dash-muted">Select or create a space above to watch confirmed payments arrive.</p>
  </section>;

  const dues = publishedDues(state, space.id);
  const filter = { dueId: dues.some(due => due.id === dueFilter) ? dueFilter : undefined, query };
  const totals = spaceTotals(state, space.id);
  const progress = dueProgress(state, space.id);
  const payments = paymentRows(state, space.id, filter);
  const outstanding = outstandingRows(state, space.id, filter);
  const canCollect = spacePermission(state, space.id, "publish_dues");
  const live = feed.status === "live";
  const busy = feed.status === "connecting" || feed.status === "reconnecting";
  const tile = (name: string, value: string, note: string) => <div key={name}><dt>{name}</dt><dd>{value}</dd><p className="dash-muted">{note}</p></div>;

  return <section id="collections" className="dash-section dash-collections">
    <div className="dash-section-title"><h2>Live collections</h2><span className={`dash-status dash-feed-${feed.status}`}>{feed.status === "offline" ? "Not connected" : feed.status}</span></div>
    <p className="dash-muted">{space.name} · Only confirmed payments count. The space is credited the face amount; the student service fee is charged on top and never added to your balance.</p>

    <div className="dash-rail">
      <p className="dash-rail-status" role="status" aria-live="polite"><span className={`dash-dot dash-feed-dot-${feed.status}`} />{feed.message || "The simulated payment rail is not connected. Connect it to receive confirmed payments."}</p>
      {!dues.length ? <p className="dash-empty">Publish a due first — the rail only confirms payments against published dues.</p> : !canCollect ? <p className="dash-muted">This space cannot collect yet: it needs an approved, verified owner.</p> : <div className="dash-actions">
        {live || busy
          ? <button className="dash-button secondary" onClick={disconnectFeed} disabled={busy}>Disconnect rail</button>
          : <button className="dash-button" onClick={connectFeed}>Connect simulated rail</button>}
        <button className="dash-button secondary" onClick={() => setTrickle(!feed.trickle)} disabled={!live} aria-pressed={feed.trickle}>{feed.trickle ? "Pause trickle" : "Start trickle"}</button>
        <button className="dash-button secondary" onClick={() => burst()} disabled={!live}>Send burst of {BURST_SIZE}</button>
        <button className="dash-button secondary" onClick={replayLast} disabled={!totals.paymentCount}>Replay last payment</button>
        <button className="dash-button secondary" onClick={simulateDrop} disabled={!live}>Simulate dropped connection</button>
        <button className="dash-button secondary" onClick={simulateError} disabled={feed.status === "offline" || feed.status === "error"}>Simulate rail error</button>
      </div>}
      <p className="dash-footnote">Presenter controls for a simulated rail. Track 3 owns the real demo rail; these events are local fixtures and no money moves.</p>
    </div>

    {busy ? <p className="dash-loading-inline" role="status">Waiting for the simulated rail…</p> : null}

    <dl className="dash-tiles">
      {tile("Collected", money(totals.collectedKobo), `${percent(totals.collectedKobo, totals.expectedKobo)}% of expected`)}
      {tile("Expected", money(totals.expectedKobo), `${dues.length} published ${dues.length === 1 ? "due" : "dues"} × ${COHORT_SIZE} students`)}
      {tile("Outstanding", money(totals.outstandingKobo), "Face value still owed")}
      {tile("Students paid", `${totals.payerCount}`, `of ${COHORT_SIZE} in the cohort`)}
      {tile("Confirmed payments", `${totals.paymentCount}`, totals.lastAt ? `Last at ${time(totals.lastAt)} Lagos` : "None yet")}
      {tile("Student service fees", money(totals.studentFeesKobo), "Paid by students, not credited here")}
    </dl>

    <h3>Progress by due</h3>
    {progress.length ? <ul className="dash-progress">{progress.map(row => <li key={row.due.id}>
      <div><strong>{row.due.title}</strong><p className="dash-muted">{label(row.due.type)} · {money(row.due.amountKobo)} · due {row.due.deadline}{row.due.allowInstalments ? " · instalments allowed" : ""}</p></div>
      <progress max={row.expectedKobo} value={row.collectedKobo} aria-label={`${row.due.title} collected`}>{percent(row.collectedKobo, row.expectedKobo)}%</progress>
      <p className="dash-muted">{money(row.collectedKobo)} collected · {money(row.outstandingKobo)} outstanding · {row.settled} paid in full · {row.partial} part-paid</p>
    </li>)}</ul> : <p className="dash-empty">No published dues yet.</p>}

    <div className="dash-filters">
      <label>Filter by due<select value={dueFilter} onChange={handle => setDueFilter(handle.target.value)}><option value="">All published dues</option>{dues.map(due => <option key={due.id} value={due.id}>{due.title}</option>)}</select></label>
      <label>Find a student<input value={query} onChange={handle => setQuery(handle.target.value)} placeholder="Name or matric number" /></label>
    </div>

    <div className="dash-section-title"><h3>Recent payments</h3><span className="dash-status">{payments.length} shown</span></div>
    {payments.length ? <><ul className="dash-rows">{payments.slice(0, LIMIT).map(row => <li key={row.key}>
      <div><strong>{row.studentName}</strong><p className="dash-muted">{row.matric} · {row.dueTitle} · {row.reference}</p></div>
      <div className="dash-amount"><strong>{money(row.amountKobo)}</strong><p className="dash-muted">{time(row.confirmedAt)}{row.feeKobo ? ` · ${money(row.feeKobo)} fee` : ""}</p></div>
    </li>)}</ul>{payments.length > LIMIT && <p className="dash-muted">Showing the {LIMIT} most recent of {payments.length} matching payments.</p>}</>
      : <p className="dash-empty">{totals.paymentCount ? "No payment matches these filters." : "No confirmed payments yet. Connect the rail and start a trickle or burst."}</p>}

    <div className="dash-section-title"><h3>Still outstanding</h3><span className="dash-status">{outstanding.length} balances</span></div>
    {outstanding.length ? <><ul className="dash-rows">{outstanding.slice(0, LIMIT).map(row => <li key={`${row.student.id}/${row.due.id}`}>
      <div><strong>{row.student.name}</strong><p className="dash-muted">{row.student.matric} · {row.due.title}{row.paidKobo ? ` · ${money(row.paidKobo)} part-paid` : ""}</p></div>
      <div className="dash-amount"><strong>{money(row.remainingKobo)}</strong><p className="dash-muted">{row.paidKobo ? "remaining" : "unpaid"}</p></div>
    </li>)}</ul>{outstanding.length > LIMIT && <p className="dash-muted">Showing {LIMIT} of {outstanding.length} outstanding balances. Filter by due or student to narrow the list.</p>}</>
      : <p className="dash-empty">{dues.length ? "Every student in this cohort has settled every published due." : "Publish a due to track outstanding balances."}</p>}
  </section>;
}
