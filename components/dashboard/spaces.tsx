"use client";

import { useState } from "react";
import { DUE_TYPES, type Due } from "@/lib/rep/models";
import { canCreateSpace } from "@/lib/rep/permissions";
import { selectedUser, type DemoAction } from "@/lib/demo/store";
import { configuredSignatories, demoEmail, dueLock, nairaToKobo, spacePermission, TEAM_ROLES, visibleSpaces, type TeamRole } from "@/lib/demo/spaces";
import { trustScore } from "@/lib/demo/withdrawals";
import { useDemo } from "./demo-provider";

export const label = (value: string) => value.replaceAll("_", " ");
export const money = (kobo: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);

export function Spaces() {
  const { state, dispatch } = useDemo();
  const actor = selectedUser(state);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState(() => typeof window === "undefined" ? "" : new URL(window.location.href).searchParams.get("invite") ?? "");
  const [editing, setEditing] = useState<Due | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const spaces = visibleSpaces(state);
  const space = spaces.find(item => item.id === state.selectedSpaceId);
  const can = (action: Parameters<typeof spacePermission>[2]) => !!space && spacePermission(state, space.id, action);
  function act(action: DemoAction, message: string) {
    try { dispatch(action); setError(""); setFeedback(message); return true; }
    catch (cause) { setFeedback(""); setError(cause instanceof Error ? cause.message : "Please try again."); return false; }
  }
  const members = state.members.filter(item => item.spaceId === space?.id && item.status === "active");
  const eligible = members.filter(item => ["treasurer", "adviser"].includes(item.role));
  const signatories = space ? configuredSignatories(state, space.id) : [];
  const invitations = state.invites.filter(item => item.email === demoEmail(actor.id) && item.status === "pending");
  const editDue = editing && editing.spaceId === space?.id ? state.dues.find(due => due.id === editing.id) : null;
  return <section id="spaces" className="dash-section dash-spaces">
    <div className="dash-section-title"><h2>Spaces & dues</h2><span className="dash-status">{spaces.length} accessible {spaces.length === 1 ? "space" : "spaces"}</span></div>
    <p className="dash-muted">One shared workspace for your class, its dues and the people helping you manage them.</p>
    <div role="status" aria-live="polite" className={feedback ? "dash-feedback" : ""}>{feedback}</div>
    {error && <p role="alert" className="dash-error">{error}</p>}
    <div className="dash-space-toolbar">
      {spaces.length > 0 && <label>Current space<select value={space?.id ?? ""} onChange={event => { act({ type: "select_space", spaceId: event.target.value }, "Space selected."); setEditing(null); }}><option value="" disabled>Select a space</option>{spaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {canCreateSpace(actor) ? <details><summary>Create a space</summary><form onSubmit={event => { event.preventDefault(); const form = event.currentTarget; if (act({ type: "create_space", name: String(new FormData(form).get("name")) }, "Space created. Share its join code with your class.")) { form.reset(); setEditing(null); } }}><label>Space name<input name="name" required maxLength={80} placeholder="e.g. Computer Science · 200 level" /></label><p className="dash-muted">School: University of Lagos. Your join code is generated automatically.</p><button className="dash-button">Create space</button></form></details> : <p>Rep approval is required to create your own space. You can still accept a co-rep invitation.</p>}
    </div>
    {!space ? <div className="dash-state"><h3>No space selected yet</h3><p>Create a class space as an approved rep, or accept an invitation below. Use Zainab in demo controls to try a verified owner.</p></div> : <div key={`${actor.id}-${space.id}`}>
      <div className="dash-space-heading"><div><h3>{space.name}</h3><p className="dash-muted">University of Lagos · {members.find(item => item.userId === actor.id)?.role} access</p></div><div><span className="dash-muted">Student join code</span><p><strong className="dash-code">{space.joinCode}</strong></p></div></div>
      <TrustBadge spaceId={space.id} />
      <div className="dash-section-title"><h3>Dues</h3><span className="dash-status">{state.dues.filter(item => item.spaceId === space.id).length} total</span></div>
      {!can("publish_dues") && <p className="dash-muted">Publishing needs an owner or treasurer role and a verified, approved space owner.</p>}
      <div className="dash-due-list">{state.dues.filter(item => item.spaceId === space.id).map(due => <article key={due.id} className="dash-due-row"><div><h3>{due.title} <span className="dash-status">{due.status}</span></h3><p className="dash-muted">{label(due.type)} · Due {due.deadline} · {due.allowInstalments ? "Instalments allowed" : "Full payment"}</p></div><strong>{money(due.amountKobo)}</strong><div className="dash-actions">{can("manage_dues") && due.status !== "closed" && (dueLock(state, due.id) ? <span className="dash-muted">{dueLock(state, due.id).startsWith("Vendor") ? "Vendor price locked" : "Locked: has payments"}</span> : <button className="dash-button secondary" onClick={() => setEditing(due)}>Edit {due.title}</button>)}{can("publish_dues") && due.status === "draft" && <button className="dash-button" onClick={() => act({ type: "publish_due", spaceId: space.id, dueId: due.id }, `${due.title} published. Available to the student demo contract.`)}>Publish {due.title}</button>}</div></article>)}</div>
      {!state.dues.some(item => item.spaceId === space.id) && <p className="dash-empty">No dues yet. Add a draft with the amount and deadline your class needs.</p>}
      {can("manage_dues") && <form className="dash-due-form" key={`${editDue?.id ?? "new"}-${formVersion}`} onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        try {
          const amountKobo = nairaToKobo(String(data.get("amount")));
          if (act({ type: "save_due", spaceId: space.id, dueId: editDue?.id, due: { title: String(data.get("title")), type: data.get("type") as Due["type"], amountKobo, deadline: String(data.get("deadline")), allowInstalments: data.get("instalments") === "on" } }, "Draft saved. Review and publish when ready.")) { setEditing(null); setFormVersion(value => value + 1); }
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid amount."); setFeedback(""); }
      }}><h3>{editDue ? `Edit ${editDue.title}` : "Add a due"}</h3>{editDue?.status === "published" && <p className="dash-notice">Saving will return this due to draft and remove it from payable dues until republished.</p>}
        <div className="dash-form-row"><label>Due title<input name="title" required maxLength={100} defaultValue={editDue?.title} /></label><label>Due type<select name="type" defaultValue={editDue?.type ?? "departmental_due"}>{DUE_TYPES.map(type => <option key={type} value={type}>{label(type)}</option>)}</select></label></div>
        <div className="dash-form-row"><label>Amount (₦)<input name="amount" inputMode="decimal" required defaultValue={editDue ? (editDue.amountKobo / 100).toFixed(2) : ""} placeholder="e.g. 2500.00" /></label><label>Deadline (Lagos date)<input name="deadline" type="date" required defaultValue={editDue?.deadline} /></label></div>
        <label className="dash-checkbox"><input type="checkbox" name="instalments" defaultChecked={editDue?.allowInstalments} />Allow instalment payments</label><div className="dash-actions"><button className="dash-button">Save draft</button>{editDue && <button type="button" className="dash-button secondary" onClick={() => setEditing(null)}>Cancel edit</button>}</div>
      </form>}
      <section id="team" className="dash-team"><h3>Co-rep team</h3><p className="dash-muted">Treasurers draft and publish. Secretaries draft. PROs view reports and can announce in a later milestone. Advisers can be signatories.</p>
        <ul className="dash-team-list">{members.map(member => <li key={member.userId}><div><strong>{state.users.find(user => user.id === member.userId)?.name}</strong><p className="dash-muted">{member.role}{member.isSignatory ? " · Signatory" : ""}</p></div>{can("manage_team") && member.role !== "owner" && <button className="dash-button secondary" onClick={() => act({ type: "revoke_member", spaceId: space.id, userId: member.userId }, "Member access revoked. If they signed, configure the pair again.")}>Revoke {state.users.find(user => user.id === member.userId)?.name.split(" ")[0]}</button>}</li>)}</ul>
        <h3>Withdrawal signatories</h3><p>{signatories.length ? `Configured: ${signatories.map(member => state.users.find(user => user.id === member.userId)?.name).join(" + ")}.` : "Not configured. Withdrawals will require exactly two distinct signatories."}</p><p className="dash-muted">The owner plus one accepted treasurer or adviser. Revoking a signatory clears the pair. Each withdrawal sends a separate code to both.</p>
        {can("manage_team") && <><form onSubmit={event => { event.preventDefault(); act({ type: "set_signatories", spaceId: space.id, secondId: String(new FormData(event.currentTarget).get("second")) }, "Two distinct signatories configured."); }}><label>Second signatory<select name="second" required defaultValue=""><option value="" disabled>Choose an accepted treasurer or adviser</option>{eligible.map(member => <option key={member.userId} value={member.userId}>{state.users.find(user => user.id === member.userId)?.name} · {member.role}</option>)}</select></label><button className="dash-button secondary" disabled={!eligible.length}>Save signatories</button>{!eligible.length && <p className="dash-muted">Invite a treasurer or adviser and have them accept first.</p>}</form>
          <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); if (act({ type: "invite", spaceId: space.id, email: String(data.get("email")), role: data.get("role") as TeamRole }, "Invitation added to the recipient’s demo inbox. No email was sent.")) form.reset(); }}><h3>Invite a co-rep</h3><div className="dash-form-row"><label>Demo email<select name="email" required defaultValue=""><option value="" disabled>Select a demo recipient</option>{state.users.filter(user => user.id !== actor.id && !user.isAdmin && user.schoolId === actor.schoolId).map(user => <option key={user.id} value={demoEmail(user.id)}>{demoEmail(user.id)}</option>)}</select></label><label>Team role<select name="role">{TEAM_ROLES.map(role => <option key={role} value={role}>{role === "pro" ? "PRO" : role}</option>)}</select></label></div><button className="dash-button">Create invitation</button></form>
          <div className="dash-invites">{state.invites.filter(item => item.spaceId === space.id).map(invite => <div key={invite.id} className="dash-invite"><p><strong>{invite.email}</strong> · {invite.role} · {invite.status}</p><p className="dash-muted">Expires {new Date(invite.expiresAt).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos" })}</p>{invite.status === "pending" && <><a className="dash-invite-link" href={`/dashboard?invite=${encodeURIComponent(invite.id)}#invitations`}>Open invitation link</a><p className="dash-muted">Switch to the recipient identity to accept.</p><button className="dash-button secondary" onClick={() => act({ type: "revoke_invite", spaceId: space.id, inviteId: invite.id }, "Invitation revoked.")}>Revoke invitation to {invite.email}</button></>}</div>)}</div>
        </>}
      </section>
    </div>}
    <section id="invitations" className="dash-team"><h3>Your invitation inbox</h3><p className="dash-muted">{demoEmail(actor.id)} · Synthetic invitations only. Valid for seven days; acceptance checks the current identity and expiry.</p>
      {invitations.length ? invitations.map(invite => <div className="dash-invite" key={invite.id}><p><strong>{state.spaces.find(item => item.id === invite.spaceId)?.name}</strong> · {invite.role}</p><p className="dash-muted">Expires {new Date(invite.expiresAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos" })} Lagos</p><button className="dash-button" onClick={() => act({ type: "accept_invite", inviteId: invite.id }, "Invitation accepted. Your space is ready above.")}>Accept invitation</button></div>) : <p className="dash-empty">No pending invitations for this identity.</p>}
      <form onSubmit={event => { event.preventDefault(); let token = inviteLink.trim(); try { token = new URL(token, window.location.origin).searchParams.get("invite") ?? token; } catch { /* Raw invitation IDs also work. */ } if (act({ type: "accept_invite", inviteId: token }, "Invitation accepted through the demo link.")) setInviteLink(""); }}><label>Invitation link or ID<input value={inviteLink} onChange={event => setInviteLink(event.target.value)} required /></label><button className="dash-button secondary">Accept from link</button></form>
    </section>
  </section>;
}

/** Every input is shown, and unknown inputs say so instead of counting as perfect. */
function TrustBadge({ spaceId }: { spaceId: string }) {
  const { state } = useDemo();
  const trust = trustScore(state, spaceId);
  return <details className="dash-trust">
    <summary><span className="dash-status">{trust.score === null ? trust.level : `${trust.level} · ${trust.score}/100`}</span> <span className="dash-muted">Trust badge · based on {trust.known} of {trust.inputs.length} inputs</span></summary>
    <dl className="dash-permissions">{trust.inputs.map(input => <div key={input.label}><dt>{input.label}</dt><dd>{input.value === null ? "Unknown" : `${Math.round(input.value * 100)}/100`}<span className="dash-muted"> · {input.detail}</span></dd></div>)}</dl>
    <p className="dash-muted">The score averages known inputs and appears once at least two are known. Trust never skips KYC, signatures or anomaly review.</p>
  </details>;
}
