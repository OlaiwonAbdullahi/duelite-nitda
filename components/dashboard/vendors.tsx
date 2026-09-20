"use client";

import { useState } from "react";
import { COHORT_SIZE } from "@/lib/demo/collections";
import { configuredSignatories, spacePermission, visibleSpaces } from "@/lib/demo/spaces";
import { findProduct, MAX_QUANTITY, orderSettlement, VENDORS } from "@/lib/demo/vendors";
import { label, money } from "./spaces";
import { useDemo } from "./demo-provider";

const SETTLEMENT = { unpaid: "Vendor not paid", in_progress: "Payment in progress", settled: "Vendor paid" };

export function Vendors() {
  const { state, dispatch, requestWithdrawal } = useDemo();
  const [productId, setProductId] = useState(VENDORS[0].products[0].id);
  const [quantity, setQuantity] = useState(String(COHORT_SIZE));
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const space = visibleSpaces(state).find(item => item.id === state.selectedSpaceId);

  async function run(task: () => unknown, success: string) {
    setBusy(true);
    try { await task(); setError(""); setFeedback(success); return true; }
    catch (cause) { setFeedback(""); setError(cause instanceof Error ? cause.message : "Please try again."); return false; }
    finally { setBusy(false); }
  }

  const catalogue = <ul className="dash-rows">{VENDORS.flatMap(vendor => vendor.products.map(product => <li key={product.id}>
    <div><strong>{product.name}</strong><p className="dash-muted">{vendor.name} · Approved vendor · {label(product.type)}</p></div>
    <div className="dash-amount"><strong>{money(product.priceKobo)}</strong><p className="dash-muted"><s>{money(product.listKobo)}</s> · {Math.round((1 - product.priceKobo / product.listKobo) * 100)}% off</p></div>
  </li>))}</ul>;

  if (!space) return <section id="vendors" className="dash-section">
    <div className="dash-section-title"><h2>Vendor marketplace</h2><span className="dash-status">No space</span></div>
    <p className="dash-muted">Select a space to attach discounted items as dues.</p>
    {catalogue}
  </section>;

  const canAttach = spacePermission(state, space.id, "manage_dues");
  const canPay = spacePermission(state, space.id, "request_withdrawal") && configuredSignatories(state, space.id).length > 0;
  const orders = state.orders.filter(item => item.spaceId === space.id).reverse();
  const chosen = findProduct(productId);
  const units = /^\d+$/.test(quantity) ? Number(quantity) : 0;

  return <section id="vendors" className="dash-section">
    <div className="dash-section-title"><h2>Vendor marketplace</h2><span className="dash-ai-tag">Seeded demo vendors</span></div>
    <p className="dash-muted">{space.name} · Attach an item as a due. Students pay you the discounted price through Duelite, and you pay the vendor from the space with the usual two signatures and review.</p>
    <div role="status" aria-live="polite" className={feedback ? "dash-feedback" : ""}>{feedback}</div>
    {error && <p role="alert" className="dash-error">{error}</p>}
    {catalogue}

    {canAttach ? <form onSubmit={event => { event.preventDefault(); const deadline = String(new FormData(event.currentTarget).get("deadline")); void run(() => dispatch({ type: "attach_vendor_item", spaceId: space.id, productId, quantity: units, deadline }), "Item attached as a draft due. Publish it in Spaces & dues when you’re ready."); }}>
      <h3>Attach to a due</h3>
      <div className="dash-form-row">
        <label>Item<select value={productId} onChange={event => setProductId(event.target.value)}>{VENDORS.map(vendor => <optgroup key={vendor.id} label={vendor.name}>{vendor.products.map(product => <option key={product.id} value={product.id}>{product.name} · {money(product.priceKobo)}</option>)}</optgroup>)}</select></label>
        <label>Quantity<input value={quantity} onChange={event => setQuantity(event.target.value)} inputMode="numeric" required pattern="\d+" /></label>
        <label>Deadline<input name="deadline" type="date" required /></label>
      </div>
      <p className="dash-muted">Each student’s due is {chosen ? money(chosen.product.priceKobo) : "—"}, paid in full. Vendor total: {chosen && units >= 1 && units <= MAX_QUANTITY ? money(chosen.product.priceKobo * units) : `enter 1–${MAX_QUANTITY} units`}.</p>
      <button className="dash-button" disabled={busy}>Attach as draft due</button>
    </form> : <p className="dash-muted">Only the owner, treasurer or secretary can attach vendor items.</p>}

    <h3>Vendor orders</h3>
    {orders.length ? <ul className="dash-rows">{orders.map(order => {
      const found = findProduct(order.productId)!;
      const due = state.dues.find(item => item.id === order.dueId);
      const settlement = orderSettlement(state, order.id).status;
      return <li key={order.id}>
        <div><strong>{order.quantity} × {found.product.name}</strong><p className="dash-muted">{found.vendor.name} · due {due ? label(due.status) : "removed"} · {SETTLEMENT[settlement]}</p></div>
        <div className="dash-amount"><strong>{money(order.totalKobo)}</strong>
          {canPay && settlement === "unpaid" && <button className="dash-button secondary" disabled={busy} onClick={() => void run(() => requestWithdrawal({ spaceId: space.id, destinationId: found.vendor.id, purpose: `Vendor order: ${order.quantity} × ${found.product.name}`, amountKobo: order.totalKobo, orderId: order.id }), "Vendor payment requested. Both signatories have codes; sign it in Withdrawals.")}>Pay vendor</button>}
        </div>
      </li>;
    })}</ul> : <p className="dash-empty">No vendor items attached yet.</p>}
    {!canPay && orders.length > 0 && <p className="dash-muted">Paying a vendor needs the verified owner and two configured signatories.</p>}
    <p className="dash-footnote">Vendors, prices and accounts are synthetic. Vendor payments are ordinary withdrawals: fee, limits, both codes and anomaly review all apply, and each order is paid at most once.</p>
  </section>;
}
