"use client";

import { useState } from "react";
import { ADVANCE_RULES, advanceOffer, advanceStatus } from "@/lib/demo/advance";
import { nairaToKobo, spacePermission, visibleSpaces } from "@/lib/demo/spaces";
import { money } from "./spaces";
import { useDemo } from "./demo-provider";

export function Advance() {
  const { state, dispatch } = useDemo();
  const [amount, setAmount] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const space = visibleSpaces(state).find(item => item.id === state.selectedSpaceId);

  if (!space) return <section id="advance" className="dash-section">
    <div className="dash-section-title"><h2>Dues advance</h2><span className="dash-status">No space</span></div>
    <p className="dash-muted">Select a space to see what it could receive early.</p>
  </section>;

  const offer = advanceOffer(state, space.id);
  const active = state.advances.filter(item => item.spaceId === space.id).map(item => ({ item, status: advanceStatus(state, item) })).find(entry => !entry.status.repaid);
  const repaidCount = state.advances.filter(item => item.spaceId === space.id).length - (active ? 1 : 0);
  const canTake = spacePermission(state, space.id, "request_withdrawal");
  let amountKobo: number | null = null;
  try { amountKobo = amount ? nairaToKobo(amount) : null; } catch { amountKobo = null; }
  const share = `${ADVANCE_RULES.repaymentShare * 100}%`;

  function take(event: React.FormEvent) {
    event.preventDefault();
    try {
      dispatch({ type: "take_advance", spaceId: space!.id, amountKobo: nairaToKobo(amount) });
      setError(""); setAmount(""); setFeedback("Advance credited to the space balance. Spending it still needs both signatories in Withdrawals.");
    } catch (cause) { setFeedback(""); setError(cause instanceof Error ? cause.message : "Please try again."); }
  }

  return <section id="advance" className="dash-section">
    <div className="dash-section-title"><h2>Dues advance</h2><span className="dash-ai-tag">Lending concept</span></div>
    <p className="dash-notice" role="note">An idea, not a live lending product. It shows how a space could receive up to {ADVANCE_RULES.capShare * 100}% of expected dues early and repay automatically from later payments. No credit is offered and no real money moves.</p>
    <div role="status" aria-live="polite" className={feedback ? "dash-feedback" : ""}>{feedback}</div>
    {error && <p role="alert" className="dash-error">{error}</p>}

    <dl className="dash-tiles">
      <div><dt>Confirmed payments</dt><dd>{offer.paymentCount}</dd><p className="dash-muted">At least {ADVANCE_RULES.minPayments} needed</p></div>
      <div><dt>Collected so far</dt><dd>{Math.floor(offer.collectedShare * 100)}%</dd><p className="dash-muted">Of expected dues; {ADVANCE_RULES.minCollectedShare * 100}% needed</p></div>
      <div><dt>Still owed on eligible dues</dt><dd>{money(offer.expectedKobo)}</dd><p className="dash-muted">Published dues not yet past deadline</p></div>
      <div><dt>Advance limit</dt><dd>{money(offer.capKobo)}</dd><p className="dash-muted">{ADVANCE_RULES.capShare * 100}% of that, in whole naira</p></div>
    </dl>

    {active ? <div className="dash-state">
      <h3>Repaying {money(active.item.principalKobo)}</h3>
      <p>{money(active.status.repaidKobo)} repaid · {money(active.status.owedKobo)} left. {share} of each new confirmed payment goes to repayment until it is cleared.</p>
      <progress max={active.item.principalKobo} value={active.status.repaidKobo} aria-label="Advance repaid" />
      {active.status.deductions.length > 0 && <ul className="dash-plain">{active.status.deductions.slice(-5).reverse().map(entry => <li key={entry.eventId} className="dash-muted">{entry.reference}: {money(entry.deductedKobo)} of {money(entry.collectedKobo)} collected</li>)}</ul>}
    </div> : !canTake ? <p className="dash-muted">Only the verified owner of an active space can take an advance.</p> : <form onSubmit={take}>
      <h3>Advance calculator</h3>
      {!offer.eligible && <ul className="dash-notice">{offer.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
      <label>Amount (₦)<input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" required placeholder={`Up to ${(offer.capKobo / 100).toLocaleString("en-NG")}`} disabled={!offer.eligible} /></label>
      <dl className="dash-quote" aria-live="polite">
        <div><dt>Credited to space now</dt><dd>{amountKobo ? money(amountKobo) : "—"}</dd></div>
        <div><dt>Repaid from</dt><dd>{share} of each later payment</dd></div>
        <div><dt>Cleared after about</dt><dd>{amountKobo ? `${money(amountKobo / ADVANCE_RULES.repaymentShare)} more collected` : "—"}</dd></div>
      </dl>
      {amountKobo !== null && amountKobo > offer.capKobo && <p className="dash-error">That is above this space’s advance limit.</p>}
      <button className="dash-button" disabled={!offer.eligible}>Take advance</button>
    </form>}
    {repaidCount > 0 && <p className="dash-muted">{repaidCount} earlier {repaidCount === 1 ? "advance" : "advances"} fully repaid.</p>}
  </section>;
}
