"use client";

import Link from "next/link";
import { Advance } from "./advance";
import { Collections } from "./collections";
import { Nudges } from "./nudges";
import { Spaces } from "./spaces";
import { Vendors } from "./vendors";
import { Withdrawals } from "./withdrawals";
import { useState } from "react";
import { DEPARTMENTS, selectedUser, type DemoAction } from "@/lib/demo/store";
import { money } from "./spaces";
import { canCollect, canCreateSpace } from "@/lib/rep/permissions";
import { useDemo } from "./demo-provider";

export function Dashboard() {
  const { state, ready, notice, dispatch, reset, loadStage } = useDemo();
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resetConfirm, setResetConfirm] = useState<"" | "reset" | "stage">("");
  const actor = selectedUser(state);
  const approved = canCreateSpace(actor);
  const verified = canCollect(actor);
  function act(action: DemoAction, success: string) {
    try { dispatch(action); setError(""); setMessage(success); }
    catch (cause) { setMessage(""); setError(cause instanceof Error ? cause.message : "Please try again."); }
  }
  const nav = <><a href="#overview" onClick={() => setMenuOpen(false)}>Overview</a><a href="#spaces" onClick={() => setMenuOpen(false)}>Spaces & dues</a><a href="#collections" onClick={() => setMenuOpen(false)}>Live collections</a><a href="#nudges" onClick={() => setMenuOpen(false)}>Nudges</a><a href="#advance" onClick={() => setMenuOpen(false)}>Advance</a><a href="#vendors" onClick={() => setMenuOpen(false)}>Vendors</a><a href="#withdrawals" onClick={() => setMenuOpen(false)}>Withdrawals</a><a href="#registration" onClick={() => setMenuOpen(false)}>Rep application</a><a href="#verification" onClick={() => setMenuOpen(false)}>Verification</a><a href="#demo-controls" onClick={() => setMenuOpen(false)}>Demo controls</a></>;
  return <div className="dashboard">
    <a href="#dashboard-main" className="dash-skip">Skip to dashboard</a>
    <aside className="dash-sidebar">
      <Link href="/" className="dash-logo">Duelite<span>Rep workspace</span></Link>
      <nav aria-label="Dashboard">{nav}</nav>
      <div className="dash-sidebar-note"><span className="dash-dot" />Frontend demo<p>Synthetic identities. No real money or external messages.</p></div>
    </aside>
    <div className="dash-workspace">
      <header className="dash-topbar"><span>University of Lagos <span className="dash-muted">/ Rep dashboard</span></span><button className="dash-menu" aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>Menu</button><span className="dash-demo-tag">Demo mode</span></header>
      {menuOpen && <nav id="mobile-navigation" className="dash-mobile-nav" aria-label="Mobile dashboard">{nav}</nav>}
      <main id="dashboard-main" tabIndex={-1}>
        {!ready ? <div className="dash-loading" role="status">Loading your demo workspace…</div> : <>
          <section id="overview" className="dash-intro"><p className="dash-muted">Your rep workspace</p><h1>Hello, {actor.name.split(" ")[0]}.</h1><p>Get ready to bring your class dues together.</p><div className="dash-badges"><span>Student access active</span>{actor.isRep && <span>Rep · {actor.approvalStatus.replace("_", " ")}</span>}{actor.isAdmin && <span>Demo administrator</span>}</div></section>
          {notice && <p className="dash-notice" role="status">{notice}</p>}
          <div aria-live="polite" role="status" className={message ? "dash-feedback" : ""}>{message}</div>
          {error && <p role="alert" className="dash-error">{error}</p>}
          <section className={`dash-banner ${verified ? "is-verified" : ""}`} aria-label="Collection readiness"><div><h2>{verified ? "You’re verified and ready for the next step." : approved ? "Prepare now. Verify before collecting." : "Your first step: get approved as a rep."}</h2><p>{verified ? "Your account meets the approval and KYC requirements for collection." : approved ? "You can create spaces and draft dues. Publishing and collecting stay locked until verification passes." : "Submit your rep application, then use the demo administrator to review it. Student access remains available without KYC."}</p></div><a className="dash-button secondary" href={approved ? "#verification" : "#registration"}>{approved ? "View verification" : "View application"} <span aria-hidden="true">↗</span></a></section>
          <Spaces key={actor.id} />
          <Collections key={`collections-${actor.id}-${state.selectedSpaceId ?? "none"}`} />
          <Nudges key={`nudges-${actor.id}-${state.selectedSpaceId ?? "none"}`} />
          <Advance key={`advance-${actor.id}-${state.selectedSpaceId ?? "none"}`} />
          <Vendors key={`vendors-${actor.id}-${state.selectedSpaceId ?? "none"}`} />
          <Withdrawals key={`withdrawals-${actor.id}-${state.selectedSpaceId ?? "none"}`} />
          <div className="dash-columns">
            <div>
              <section id="registration" className="dash-section"><div className="dash-section-title"><h2>Rep application</h2><span className="dash-status">{actor.approvalStatus === "not_applied" ? "Not submitted" : actor.approvalStatus}</span></div>
                <p className="dash-muted">Your student identity stays with you when you become a rep.</p>
                {actor.approvalStatus === "pending" ? <div className="dash-state"><h3>Application received</h3><p>Waiting for a demo administrator to review your department and role.</p><a href="#demo-controls">Open demo controls →</a></div> : actor.approvalStatus === "approved" ? <div className="dash-state"><h3>You’re approved as a representative</h3><p>{state.applications[actor.id] ? `${state.applications[actor.id].department} · ${state.applications[actor.id].level} level` : "Approved demo profile · Computer Science"}</p><p>Continue to verification when you’re ready to collect.</p></div> : <>
                  {actor.approvalStatus === "rejected" && <p className="dash-error">Application not approved. {state.applications[actor.id]?.rejection}</p>}
                  <form key={actor.id} onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); act({ type: "apply", department: String(data.get("department")), level: String(data.get("level")), position: String(data.get("position")) }, "Application submitted. Switch to Demo administrator to review it."); }}>
                    <div className="dash-identity"><strong>{actor.name}</strong><span>University of Lagos · Demo student</span></div>
                    <label>Department<select name="department" defaultValue={state.applications[actor.id]?.department ?? ""} required><option value="" disabled>Select department</option>{DEPARTMENTS.map(value => <option key={value}>{value}</option>)}</select></label>
                    <div className="dash-form-row"><label>Level<select name="level" defaultValue={state.applications[actor.id]?.level ?? ""} required><option value="" disabled>Select level</option>{[100, 200, 300, 400, 500].map(value => <option key={value} value={value}>{value} level</option>)}</select></label><label>Representative role<select name="position" defaultValue={state.applications[actor.id]?.position ?? ""} required><option value="" disabled>Select role</option><option>Course representative</option><option>Association representative</option></select></label></div>
                    <button className="dash-button" type="submit">{actor.approvalStatus === "rejected" ? "Resubmit application" : "Submit application"} <span aria-hidden="true">→</span></button>
                  </form>
                </>}
              </section>
              <section id="verification" className="dash-section"><div className="dash-section-title"><h2>Identity verification</h2><span className="dash-status">{actor.kycStatus.replace("_", " ")}</span></div>
                {!approved ? <p>Verification opens after rep approval. Students do not need KYC.</p> : actor.kycStatus === "verified" ? <div className="dash-state" role="status"><h3>Demo verification passed</h3><p>Publishing and collection are permitted by your account policy.</p></div> : actor.kycStatus === "pending" ? <div className="dash-state" role="status"><h3>Checking your synthetic identity…</h3><p>This takes about three seconds. You can switch identities or reload; the result will be saved for this rep.</p></div> : <>
                  {actor.kycStatus === "failed" && <p className="dash-error" role="alert">Demo verification failed. Collection remains locked. Choose a scenario to try again.</p>}
                  <p>Use a synthetic identity check to preview verification. No BVN or identity documents are requested or stored.</p>
                  <form key={`kyc-${actor.id}`} onSubmit={event => { event.preventDefault(); const outcome = new FormData(event.currentTarget).get("outcome"); act({ type: "start_kyc", outcome: outcome === "failed" ? "failed" : "verified" }, "Simulated verification started."); }}>
                    <label>Simulated result<select name="outcome"><option value="verified">Pass — synthetic details match</option><option value="failed">Fail — synthetic details do not match</option></select></label><button className="dash-button" type="submit">{actor.kycStatus === "failed" ? "Retry demo verification" : "Start demo verification"}</button>
                  </form>
                </>}
              </section>
            </div>
            <aside className="dash-readiness"><h2>Your next steps</h2><ol><li><span className={approved ? "step-done" : ""}>{approved ? "✓" : "1"}</span><div><h3>Get rep approval</h3><p>Confirm your department and role.</p></div></li><li><span className={verified ? "step-done" : ""}>{verified ? "✓" : "2"}</span><div><h3>Verify your identity</h3><p>Required to publish and collect.</p></div></li><li><span>3</span><div><h3>Collect and track</h3><p>Create a space, publish dues and watch payments land live.</p></div></li></ol><h3>Account permissions</h3><dl className="dash-permissions"><div><dt>Student access</dt><dd>Active</dd></div><div><dt>Create spaces & draft dues</dt><dd>{approved ? "Allowed" : "Locked"}</dd></div><div><dt>Publish & collect</dt><dd>{verified ? "Allowed" : "Locked"}</dd></div></dl><p className="dash-muted">These show account eligibility. Each space also applies your team role permissions.</p></aside>
          </div>
          <section id="demo-controls" className="dash-controls"><div><h2>Demo controls</h2><p>Presenter tools for this browser. Identities and admin decisions are simulated.</p></div><label>Demo identity<select value={actor.id} onChange={event => { act({ type: "select", userId: event.target.value }, "Demo identity changed."); setResetConfirm(""); }}>{state.users.map(user => <option key={user.id} value={user.id}>{user.name}{user.isAdmin ? "" : ` · ${user.approvalStatus.replace("_", " ")}`}</option>)}</select></label>
            {actor.isAdmin && <div className="dash-review"><h3>Application review</h3>{state.users.filter(user => user.approvalStatus === "pending").length === 0 ? <p>No applications waiting. Submit one as Ada to try a review.</p> : state.users.filter(user => user.approvalStatus === "pending").map(user => <div key={user.id} className="dash-review-row"><div><strong>{user.name}</strong><p>{state.applications[user.id]?.department} · {state.applications[user.id]?.level} · {state.applications[user.id]?.position}</p></div><div className="dash-actions"><button className="dash-button" onClick={() => act({ type: "review", userId: user.id, decision: "approved" }, `${user.name} approved. Switch back to continue verification.`)}>Approve</button><button className="dash-button secondary" onClick={() => act({ type: "review", userId: user.id, decision: "rejected" }, `${user.name} rejected with a reason. They can correct and resubmit.`)}>Reject</button></div></div>)}</div>}
            {actor.isAdmin && <div className="dash-review"><h3>Anomaly review · Track 3 demo reviewer</h3><p className="dash-muted">Simulated Track 3 action. Approving releases a request only once both signatories have signed; rejecting releases the reservation.</p>{state.withdrawals.filter(item => item.status === "pending_review").length === 0 ? <p>No withdrawals paused for review.</p> : state.withdrawals.filter(item => item.status === "pending_review").map(item => <div key={item.id} className="dash-review-row"><div><strong>{money(item.amountKobo)} · {item.reference}</strong><p>{state.spaces.find(space => space.id === item.spaceId)?.name} · {item.purpose} · {state.approvals.filter(entry => entry.withdrawalId === item.id && entry.usedAt).length} of 2 signed</p><ul>{item.flagReasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div><div className="dash-actions"><button className="dash-button" onClick={() => act({ type: "resolve_review", withdrawalId: item.id, decision: "approve" }, `${item.reference} cleared in review.`)}>Approve {item.reference}</button><button className="dash-button secondary" onClick={() => act({ type: "resolve_review", withdrawalId: item.id, decision: "reject" }, `${item.reference} rejected. Its reservation is released.`)}>Reject {item.reference}</button></div></div>)}</div>}
            <div className="dash-reset">{resetConfirm ? <><p>{resetConfirm === "stage" ? "Replace everything in this browser with the stage demo: Zainab's Computer Science 200L space, a published ₦5,000 departmental due, Ada as treasurer signatory and 150 confirmed payments?" : "Reset all identities, applications, verification results, spaces, dues, teams, collections, nudges, advances, vendor orders and withdrawals in this browser?"}</p><div className="dash-actions"><button className="dash-button" onClick={() => { if (resetConfirm === "stage") { loadStage(); setMessage("Stage demo loaded. You are Zainab; connect the rail in Live collections."); } else { reset(); setMessage("Demo reset. All profiles are back to their starting state."); } setResetConfirm(""); setError(""); }}>{resetConfirm === "stage" ? "Load stage demo" : "Confirm reset"}</button><button className="dash-button secondary" onClick={() => setResetConfirm("")}>Cancel</button></div></> : <div className="dash-actions"><button className="dash-button" onClick={() => setResetConfirm("stage")}>Load stage demo</button><button className="dash-button secondary" onClick={() => setResetConfirm("reset")}>Reset demo</button></div>}</div>
            <p className="dash-footnote">Saved on this browser when storage is available. Use one tab for the demo. Reset clears pending checks too.</p>
          </section>
        </>}
      </main>
    </div>
  </div>;
}
