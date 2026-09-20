"use client";

import { useState } from "react";
import { cohort } from "@/lib/demo/collections";
import { generateDrafts, LANGUAGES, MAX_NUDGE_LENGTH, nudgeTargets, type Draft, type Language } from "@/lib/demo/nudges";
import { spacePermission, visibleSpaces } from "@/lib/demo/spaces";
import { money } from "./spaces";
import { useDemo } from "./demo-provider";

const LIMIT = 20;
const when = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const BEHAVIOUR = { part_paid: "Part-paid", paid_other: "Paid other dues", not_paid: "No payment yet" };

export function Nudges() {
  const { state, dispatch } = useDemo();
  const [language, setLanguage] = useState<Language>("en");
  const [selected, setSelected] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<(Draft & { include: boolean })[]>([]);
  const [generating, setGenerating] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const space = visibleSpaces(state).find(item => item.id === state.selectedSpaceId);

  if (!space) return <section id="nudges" className="dash-section">
    <div className="dash-section-title"><h2>Defaulter nudges</h2><span className="dash-status">No space</span></div>
    <p className="dash-muted">Select a space to remind students who still owe.</p>
  </section>;

  const canMessage = spacePermission(state, space.id, "post_announcement");
  const targets = nudgeTargets(state, space.id);
  const shown = targets.slice(0, LIMIT);
  const names = new Map(cohort(space.id).map(student => [student.id, student.name]));
  const sent = state.nudges.filter(item => item.spaceId === space.id).reverse();
  const toSend = drafts.filter(draft => draft.include);
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id]);

  async function generate() {
    setGenerating(true); setError(""); setFeedback(""); setDrafts([]);
    try {
      const result = await generateDrafts(state, space!.id, selected, language, { fail: failNext });
      setDrafts(result.map(draft => ({ ...draft, include: true })));
      setFeedback(`${result.length} simulated ${result.length === 1 ? "draft is" : "drafts are"} ready to review.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Generation failed. Try again."); }
    finally { setGenerating(false); setFailNext(false); }
  }
  function send() {
    try {
      dispatch({ type: "send_nudges", spaceId: space!.id, messages: toSend.map(({ studentId, language, text, suggestedAt }) => ({ studentId, language, text, suggestedAt })) });
      setError(""); setFeedback(`${toSend.length} ${toSend.length === 1 ? "nudge" : "nudges"} delivered to the demo inbox.`);
      setDrafts([]); setSelected([]);
    } catch (cause) { setFeedback(""); setError(cause instanceof Error ? cause.message : "Please try again."); }
  }

  return <section id="nudges" className="dash-section dash-nudges">
    <div className="dash-section-title"><h2>Defaulter nudges</h2><span className="dash-status">{targets.length} owing</span></div>
    <p className="dash-muted">{space.name} · Reminders are written from each student’s balance, nearest deadline and payment history. Students who have paid everything never appear.</p>
    <div role="status" aria-live="polite" className={feedback ? "dash-feedback" : ""}>{feedback}</div>
    {error && <p role="alert" className="dash-error">{error}</p>}

    {!canMessage ? <p className="dash-muted">Only the owner, secretary or PRO of an active space can message students.</p>
      : !targets.length ? <p className="dash-empty">{state.dues.some(due => due.spaceId === space.id && due.status === "published") ? "Everyone has paid. Nobody needs a nudge." : "Publish a due to see who owes."}</p>
      : <>
        <div className="dash-filters">
          <label>Language<select value={language} onChange={event => setLanguage(event.target.value as Language)}>{Object.entries(LANGUAGES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        </div>
        <div className="dash-section-title"><h3>Who owes</h3><div className="dash-actions">
          <button type="button" className="dash-button secondary" onClick={() => setSelected(shown.filter(target => !target.coolingDown).map(target => target.student.id))}>Select all shown</button>
          <button type="button" className="dash-button secondary" onClick={() => setSelected([])} disabled={!selected.length}>Clear</button>
        </div></div>
        <ul className="dash-rows">{shown.map(target => <li key={target.student.id}>
          <label className="dash-checkbox"><input type="checkbox" checked={selected.includes(target.student.id)} disabled={target.coolingDown} onChange={() => toggle(target.student.id)} />
            <span><strong>{target.student.name}</strong><span className="dash-muted"> · {BEHAVIOUR[target.behaviour]} · {target.daysLeft < 0 ? `${-target.daysLeft}d overdue` : `${target.daysLeft}d left`}{target.coolingDown ? " · nudged in the last 24 h" : ""}</span></span></label>
          <div className="dash-amount"><strong>{money(target.remainingKobo)}</strong><p className="dash-muted">{target.dueTitles.join(", ")}</p></div>
        </li>)}</ul>
        {targets.length > LIMIT && <p className="dash-muted">Showing the {LIMIT} most urgent of {targets.length} students who owe.</p>}
        <label className="dash-checkbox"><input type="checkbox" checked={failNext} onChange={event => setFailNext(event.target.checked)} />Presenter: make the next generation fail</label>
        <button className="dash-button" onClick={() => void generate()} disabled={generating || !selected.length} aria-busy={generating}>{generating ? "Writing drafts…" : `Generate ${selected.length ? `${selected.length} ` : ""}${LANGUAGES[language]} ${selected.length === 1 ? "draft" : "drafts"}`}</button>
        {generating && <p className="dash-loading-inline" role="status"><progress aria-label="Generating drafts" /> Simulated AI is writing {selected.length} {selected.length === 1 ? "draft" : "drafts"}…</p>}

        {drafts.length > 0 && <div className="dash-drafts">
          <h3>Review drafts <span className="dash-ai-tag">Simulated AI</span></h3>
          <p className="dash-muted">Written by deterministic templates, not a live model. Edit anything before sending.</p>
          {drafts.map((draft, index) => <div key={draft.studentId} className="dash-draft">
            <label className="dash-checkbox"><input type="checkbox" checked={draft.include} onChange={event => setDrafts(drafts.map((item, at) => at === index ? { ...item, include: event.target.checked } : item))} />Send to {names.get(draft.studentId)}</label>
            <label>Message<textarea value={draft.text} maxLength={MAX_NUDGE_LENGTH} rows={4} onChange={event => setDrafts(drafts.map((item, at) => at === index ? { ...item, text: event.target.value } : item))} /></label>
            <p className="dash-muted">Suggested send time: {when(draft.suggestedAt)} Lagos · {draft.timing}</p>
          </div>)}
          <button className="dash-button" onClick={send} disabled={!toSend.length}>Send {toSend.length} to demo inbox</button>
        </div>}
      </>}

    <div className="dash-inbox" aria-label="Demo student inbox">
      <h3>Demo inbox</h3>
      {sent.length ? sent.slice(0, 10).map(item => <p key={item.id}><strong>To {names.get(item.studentId)}</strong> · {LANGUAGES[item.language]}<br />{item.text}<span className="dash-muted"> Delivered {when(item.sentAt)} · suggested {when(item.suggestedAt)}</span></p>) : <p>No nudges sent yet.</p>}
      <p className="dash-footnote">Delivered only inside this browser. Nothing is emailed, texted or sent on WhatsApp. A student can be nudged once every 24 hours.</p>
    </div>
  </section>;
}
