"use client";

import { useState } from "react";
import { SINGLE_TRANSACTION_LIMIT_KOBO, withdrawalQuote } from "@/lib/rep/money";
import { configuredSignatories, nairaToKobo, spacePermission, visibleSpaces } from "@/lib/demo/spaces";
import { VENDORS } from "@/lib/demo/vendors";
import { balances, BANKS, CODE_TTL_MS, MAX_CODE_ATTEMPTS } from "@/lib/demo/withdrawals";
import { money } from "./spaces";
import { useDemo } from "./demo-provider";

const when = (value: string | number) => new Date(value).toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const OPEN = ["pending_review", "awaiting_signatories"];

export function Withdrawals() {
  const { state, inbox, failNextPayout, dispatch, requestWithdrawal, signWithdrawal, resendCode, setPayoutFailure } = useDemo();
  const [amount, setAmount] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const space = visibleSpaces(state).find(item => item.id === state.selectedSpaceId);
  const actorId = state.selectedId;
  const name = (userId: string) => state.users.find(user => user.id === userId)?.name ?? userId;

  async function run(task: () => unknown, success: string) {
    setBusy(true);
    try { await task(); setError(""); setFeedback(success); return true; }
    catch (cause) { setFeedback(""); setError(cause instanceof Error ? cause.message : "Please try again."); return false; }
    finally { setBusy(false); }
  }

  if (!space) return <section id="withdrawals" className="dash-section">
    <div className="dash-section-title"><h2>Withdrawals</h2><span className="dash-status">No space</span></div>
    <p className="dash-muted">Select a space to see its balance and withdrawals.</p>
  </section>;

  const funds = balances(state, space.id);
  const canRequest = spacePermission(state, space.id, "request_withdrawal");
  const pair = configuredSignatories(state, space.id);
  const destinations = state.destinations.filter(item => item.userId === actorId);
  const withdrawals = state.withdrawals.filter(item => item.spaceId === space.id).reverse();
  const myCodes = inbox.filter(message => message.userId === actorId && state.approvals.some(entry => entry.withdrawalId === message.withdrawalId && entry.userId === actorId && !entry.usedAt) && OPEN.includes(state.withdrawals.find(item => item.id === message.withdrawalId)?.status ?? ""));
  let quote: ReturnType<typeof withdrawalQuote> | null = null;
  try { quote = amount ? withdrawalQuote(nairaToKobo(amount)) : null; } catch { quote = null; }
  const tile = (title: string, value: number, note: string) => <div key={title}><dt>{title}</dt><dd>{money(value)}</dd><p className="dash-muted">{note}</p></div>;

  return <section id="withdrawals" className="dash-section dash-withdrawals">
    <div className="dash-section-title"><h2>Withdrawals</h2><span className="dash-status">{withdrawals.length} {withdrawals.length === 1 ? "request" : "requests"}</span></div>
    <p className="dash-muted">{space.name} · Money leaves only to the owner’s own bank account, after both signatories enter their own one-time code.</p>
    <div role="status" aria-live="polite" className={feedback ? "dash-feedback" : ""}>{feedback}</div>
    {error && <p role="alert" className="dash-error">{error}</p>}

    <dl className="dash-tiles">
      {tile("Available", funds.availableKobo, funds.advancedKobo ? "Collected + advance, minus repayments, withdrawn and reserved" : "Collected, minus withdrawn and reserved")}
      {tile("Reserved", funds.reservedKobo, "Amount + fee held for open requests")}
      {tile("Withdrawn", funds.withdrawnKobo, "Paid out, including fees")}
      {tile("Collected", funds.collectedKobo, "Confirmed face value")}
    </dl>

    {myCodes.length > 0 && <div className="dash-inbox" aria-label="Your demo code inbox">
      <h3>Your demo inbox</h3>
      {myCodes.map(message => <p key={message.withdrawalId}>Duelite: your code for withdrawal {message.reference} is <strong className="dash-code">{message.code}</strong>. Valid for {CODE_TTL_MS / 60000} minutes. Never share it.<span className="dash-muted"> Sent {when(message.sentAt)}</span></p>)}
      <p className="dash-footnote">Simulated SMS. Nothing is sent outside this browser, and codes are not saved: after a reload, request a new code.</p>
    </div>}

    {canRequest ? <div className="dash-columns-even">
      <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void run(() => dispatch({ type: "add_destination", bank: String(data.get("bank")), accountNumber: String(data.get("account")).trim() }), "Account saved. The simulated name check matched your name.").then(ok => ok && form.reset()); }}>
        <h3>Your bank accounts</h3>
        {destinations.length ? <ul className="dash-plain">{destinations.map(item => <li key={item.id}>{item.bank} ···{item.accountNumber.slice(-4)} · {item.accountName}</li>)}</ul> : <p className="dash-muted">No account saved yet.</p>}
        <div className="dash-form-row"><label>Bank<select name="bank" required defaultValue=""><option value="" disabled>Select bank</option>{BANKS.map(bank => <option key={bank}>{bank}</option>)}</select></label><label>Account number<input name="account" required inputMode="numeric" pattern="\d{10}" maxLength={10} placeholder="10 digits" /></label></div>
        <p className="dash-muted">Simulated name check: only accounts in your own name are accepted.</p>
        <button className="dash-button secondary">Save account</button>
      </form>

      <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void run(() => requestWithdrawal({ spaceId: space.id, destinationId: String(data.get("destination")), purpose: String(data.get("purpose")), amountKobo: nairaToKobo(amount) }), "Request created. Each signatory has a separate code in their demo inbox.").then(ok => { if (ok) { form.reset(); setAmount(""); } }); }}>
        <h3>Request a withdrawal</h3>
        {!pair.length && <p className="dash-notice">Configure two signatories in <a href="#team">Co-rep team</a> first.</p>}
        <label>Destination<select name="destination" required defaultValue=""><option value="" disabled>Choose your account</option>{destinations.map(item => <option key={item.id} value={item.id}>{item.bank} ···{item.accountNumber.slice(-4)}</option>)}</select></label>
        <label>Purpose<input name="purpose" required minLength={3} maxLength={140} placeholder="e.g. Printing 200 lab manuals" /></label>
        <label>Amount (₦)<input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" required placeholder="e.g. 20000.00" /></label>
        <dl className="dash-quote" aria-live="polite">
          <div><dt>Amount</dt><dd>{quote ? money(quote.amountKobo) : "—"}</dd></div>
          <div><dt>Withdrawal fee</dt><dd>{quote ? money(quote.feeKobo) : "—"}</dd></div>
          <div><dt>Total debited</dt><dd>{quote ? money(quote.totalDebitKobo) : "—"}</dd></div>
          <div><dt>Available after</dt><dd>{quote ? money(funds.availableKobo - quote.totalDebitKobo) : money(funds.availableKobo)}</dd></div>
        </dl>
        <p className="dash-muted">Fee: ₦100 up to ₦50,000, ₦200 above. Limits: {money(SINGLE_TRANSACTION_LIMIT_KOBO)} per withdrawal, ₦10,000,000 per day.</p>
        {quote && quote.totalDebitKobo > funds.availableKobo && <p className="dash-error">Available balance does not cover the amount plus the fee.</p>}
        <p className="dash-muted">Before payout, requests are checked for unusually large amounts, 00:00–04:59 Lagos time, accounts saved under 24 hours ago and nearly all of the balance. Demo: your seeded GTBank account is established, so a modest daytime request goes straight to signing; a new account or most of the balance is paused for review.</p>
        <p className="dash-muted">Codes go to {pair.length ? pair.map(member => name(member.userId)).join(" and ") : "two signatories"}.</p>
        <button className="dash-button" disabled={busy || !pair.length || !destinations.length}>Request withdrawal</button>
      </form>
    </div> : <p className="dash-muted">Only the verified owner of this space can request withdrawals. Signatories approve from the list below.</p>}

    <label className="dash-checkbox"><input type="checkbox" checked={failNextPayout} onChange={event => setPayoutFailure(event.target.checked)} />Presenter: make the simulated rail fail the next payout</label>

    <h3>Requests</h3>
    {withdrawals.length ? <ul className="dash-withdrawal-list">{withdrawals.map(item => {
      const approvals = state.approvals.filter(entry => entry.withdrawalId === item.id);
      const mine = approvals.find(entry => entry.userId === actorId);
      const destination = state.destinations.find(entry => entry.id === item.destinationId) ?? VENDORS.find(entry => entry.id === item.destinationId);
      const open = OPEN.includes(item.status);
      return <li key={item.id}>
        <div className="dash-section-title"><div><strong>{money(item.amountKobo)}</strong> <span className="dash-muted">+ {money(item.feeKobo)} fee · {item.reference}</span><p className="dash-muted">{item.purpose} · {item.orderId ? `${destination?.accountName}, ` : ""}{destination?.bank} ···{destination?.accountNumber.slice(-4)}</p></div><span className={`dash-status dash-wd-${item.status}`}>{item.status.replace("_", " ")}</span></div>
        {item.status === "pending_review" && <div className="dash-notice" role="note"><strong>Paused for anomaly review.</strong> Valid codes are still collected, but no payout happens until a Track 3 reviewer clears it.<ul>{item.flagReasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
        <p className="dash-muted">Signatures: {approvals.map(entry => `${name(entry.userId)} ${entry.usedAt ? "✓ signed" : "pending"}`).join(" · ")}</p>
        {open && mine && !mine.usedAt && <form className="dash-sign" onSubmit={event => { event.preventDefault(); const form = event.currentTarget; void run(() => signWithdrawal(item.id, String(new FormData(form).get("code"))), "Code accepted. Your signature is recorded.").then(ok => ok && form.reset()); }}>
          <label>Your 5-digit code<input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="\d{5}" maxLength={5} /></label>
          <div className="dash-actions"><button className="dash-button" disabled={busy}>Sign withdrawal</button><button type="button" className="dash-button secondary" disabled={busy} onClick={() => void run(() => resendCode(item.id), "New code sent to your demo inbox. The previous code no longer works.")}>Send a new code</button></div>
          <p className="dash-muted">{mine.failedAttempts ? `${MAX_CODE_ATTEMPTS - mine.failedAttempts} of ${MAX_CODE_ATTEMPTS} attempts left. ` : ""}Expires {when(mine.expiresAt)} Lagos.</p>
        </form>}
        {open && item.requestedBy === actorId && <button className="dash-button secondary" disabled={busy} onClick={() => void run(() => dispatch({ type: "cancel_withdrawal", withdrawalId: item.id }), "Request cancelled. The reservation was released.")}>Cancel request</button>}
        <details><summary>Status history</summary><ol className="dash-history">{item.history.map((entry, index) => <li key={index}><span className="dash-muted">{when(entry.at)}</span> {entry.note}</li>)}</ol></details>
      </li>;
    })}</ul> : <p className="dash-empty">No withdrawals yet.</p>}
    <p className="dash-footnote">Simulated Track 3 payout rail. No real money moves. Each reference is paid at most once, and a failed payout releases the reservation.</p>
  </section>;
}
