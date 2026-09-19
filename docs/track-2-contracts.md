# Track 2 demo integration contract

Status: M1 foundation, M2 onboarding, M3 spaces/dues/team and M4 live collections implemented; M5–M9 operations remain planned. Source: Duevy PDF pages 10–14 and 18–20, overridden for architecture by the user's clarification: **frontend demo only; no real backend for now**. Existing Duelite branding remains unchanged.

## Runtime and ownership

Build `/dashboard` in Next.js with a shared client-side demo store, deterministic seeds, versioned localStorage persistence and reset controls. Simulate async services with delays and explicit success/failure outcomes. No Express, database, API routes, real authentication, provider webhooks, external messaging or live LLM integration. The normal Next.js runtime remains; application backend services are out of scope.

Track 1 owns simulated student identity, joining and checkout. Track 3 owns demo approval, rail, ledger/audit, review, transparency, reports and global reset. Track 2 consumes these frontend modules when available and uses local fixtures/adapters otherwise. Missing cross-track services must not block Track 2 development.

Pure `lib/rep` helpers apply consistently inside store actions as well as controls. Browser policies demonstrate intended behaviour; they are not production authorization or tamper resistance.

## Proposed demo service boundaries

These are planned JavaScript operations/events, not HTTP endpoints.

| Operation | Behaviour |
| --- | --- |
| Rep application | Add rep status to seeded identity; presenter approves/rejects. |
| KYC | Test-only inputs, pending state and delayed simulated result; never persist/log BVN; ignore duplicate/stale completions. |
| Spaces/dues | School scope, unique codes, nine types, valid amounts/dates, draft/publish gates. |
| Team | Simulated invite/acceptance, roles, revocation, exactly two distinct eligible signatories. No email delivery. |
| Collections | Confirmed events, due/student filters, timed trickle/manual bursts, subscription cleanup. |
| Withdrawal | Own demo bank destination, purpose, fee preview, balance reservation, anomaly checks, simulated payout progression. |
| Signatures | Separate five-digit codes in demo inboxes, hashed approval records, expiry, attempt limits, resend invalidation and single use. Inbox codes intentionally visible for demonstration. |
| Review | Seeded reviewer/presenter clears or rejects; codes cannot bypass pending review. |
| Nudges | Personalised English/Pidgin templates or cached drafts, simulated generation, review/edit then demo inbox delivery. Label simulated AI. |
| Advance | Concept-only offer up to 80% of eligible expected dues; repayment simulated once per collection. |
| Vendors | Two approved seeded vendors, discounts, attach-to-due and simulated settlement through withdrawal controls. |

## State and financial invariants

Use opaque IDs, school/space scope, ISO UTC timestamps, Africa/Lagos due dates and daily counters. Money is safe integer kobo. Validate forms and restored state. Version localStorage and handle malformed/stale data gracefully. Reset must clear timers/events as well as stored data. All people/bank details are synthetic.

Selected demo identity supplies the actor. Deduplicate actions/events by ID; conflicting reuse is rejected. Each reservation or settlement and its audit record is one store transition. Browser-tab persistence limitations may be documented; production concurrency is out of scope.

Student fee is 2%, rounded half-up to one kobo, capped at 25,000 kobo. Rounding is an implementation assumption. A 500,000-kobo due charges 10,000 fee and credits exactly 500,000 to the space. Withdrawal fee is 10,000 through 5,000,000 inclusive and 20,000 above. Reserve principal plus fee.

Demo limits: 250,000,000 kobo per payout, 1,000,000,000 daily committed payout principal including reservations. Keep Track 2/3 scope consistent. `ConfirmedCollection` lines sum to face amount; student/dues belong to the space. Deduplicate both payment and event IDs. Pending/failed payments never inflate totals. Refunds are separate adjustments.

Withdrawal progression: request → pending_review or awaiting_signatories → processing → succeeded/failed, with rejected/expired paths. Require both independent signatures and cleared review before settlement. Replayed completion never debits twice. Definitive failure/rejection/expiry releases reservations.

## Policy decisions

Approved unverified reps create spaces and draft dues; collection requires approved verified owner. Students never need KYC; co-reps need no separate rep account. Membership matches actor, school and space and must be active.

Owner manages team/requests withdrawal; treasurer may publish; secretary may draft; PRO may announce/view reports. Owner/treasurer/adviser may sign; exactly two distinct signatories are required. Adviser is permitted because the PDF explicitly mentions a lecturer adviser. Detailed role grants are implementation choices where the PDF gives examples only.

Active authorised members retain reports on suspended/archived spaces but cannot mutate them. High trust never bypasses KYC/signatures/review. Demo audit records actor, action, target, timestamp and operation reference; never codes/BVN. Entries are append-only until reset.

## Verification

Run `node tests/rep-domain.test.mjs`, `npx tsc --noEmit`, `npm run lint`. Later sessions verify store flows, persistence/reset, role switching, partial payments, duplicate events, wrong/expired codes, anomaly blocking and simulated failures in the browser. Backend setup and production-security testing are not acceptance criteria for this frontend demo.


## M2 implemented store boundary (historical v1; M3 changes below supersede it)

`lib/demo/store.ts` supplies `seedDemo`, `transition`, `restoreDemo`, `createDemoStore`, `selectedUser` and `requireRepCapability`. The framework-independent store exposes subscribe/getSnapshot, start/stop, dispatch and reset. `components/dashboard/demo-provider.tsx` mounts it inside `/dashboard` and provides `useDemo` to client screens. No Track 1/3 modules existed during M2; these are explicit local adapters.

- Four deterministic University of Lagos identities: Ada (student, no application), Tunde (approved, unverified), Zainab (approved, verified), and a demo administrator. Student access is additive for all profiles.
- `apply` validates selected department/level/role; `review` requires the selected admin and a pending same-school application. Rejected applicants can resubmit. Presenter identity switching is deliberate, not authentication.
- `start_kyc` requires approval and accepts only a synthetic pass/fail outcome. There is no BVN field, document upload or identity-provider call. A three-second request deadline is persisted. `finish_kyc` is the simulation-service completion action, ignores early/unknown/completed results, and updates the original user even if the presenter switches identity. A failed check can be retried with a fresh request ID.
- Persistence key: `duelite.demo.v1`, envelope version 1. Restored state is validated against seeded identities and known fields; malformed/incompatible state starts fresh with a notice. Unavailable browser storage shows a session-only notice. Pending checks resume on mount, stop on unmount, and are cleared on reset. One-tab operation only; cross-tab synchronization is not implemented.
- Application, review and KYC transitions append audit entries atomically. Reset intentionally clears all demo data. No monetary mutations exist in M2.
- `requireRepCapability(state, "create_space" | "draft_due" | "publish_due" | "collect")` enforces account eligibility. M3 must call this inside actual space/due mutations AND apply `canActInSpace` with scoped membership; UI labels alone are not enforcement. Space/due CRUD remains M3 work.
- When extending persisted state in M3, update the version/key or provide a validated migration; do not weaken the strict envelope validator just to accept new fields.

Verification: `node tests/demo-store.test.mjs` adds application/review authorization, failed/replayed KYC, identity isolation, restore validation, actual persistence, resumed timers, reset cleanup and storage-failure tests. Existing domain tests continue to cover account and per-space permissions.


## M3 implemented spaces, dues and team boundary

All operations below run through the existing `createDemoStore().dispatch` / `useDemo().dispatch`, with the selected identity as actor. `lib/demo/spaces.ts` owns pure transitions/selectors and validation; `lib/demo/store.ts` owns the single persisted envelope, notifications and audit. No second browser store, API route or external delivery was added.

### Actions and policy

- `create_space { name }`: approved rep only; derives school and owner from actor, creates active owner membership and selects the space. Generated codes are globally unique within the demo envelope (`DU000001`, etc.); these are join identifiers, not secrets. Names are trimmed, 1–80 characters.
- `select_space { spaceId }`: requires active same-school report access. Switching identity selects its first accessible space or none, preventing another actor’s selected space from leaking into the screen.
- `save_due { spaceId, dueId?, due }`: owner/treasurer/secretary of an active space with approved owner. Co-reps need no separate rep application or KYC. `due` contains title (1–100 characters), one of all nine `DUE_TYPES`, positive safe-integer `amountKobo`, real `YYYY-MM-DD` Lagos calendar deadline, and boolean `allowInstalments`. Naira inputs use exact decimal parsing; zero, negatives, fractions of a kobo and overflow are rejected.
- Creating or editing saves a draft. Editing a published due immediately removes it from payable results until republished; a closed due cannot be edited. Past deadlines remain valid so later outstanding-payment views can represent overdue dues. **Before adding collections in M4, lock financial edits after confirmed payments or introduce explicit due revisions; M3 has no payment records.**
- `publish_due { spaceId, dueId }`: draft in the same space only; owner/treasurer role and approved, verified owner required. Publishing twice is rejected. Publishing does not itself collect funds and does not require the withdrawal signatory pair.
- `invite { spaceId, email, role }`: owner only; synthetic, same-school, non-admin recipient other than owner, with role `treasurer | secretary | pro | adviser`. Emails normalize trim/case and map to seeded identities via `demoEmail(userId)` (`ada@demo.duelite.test`, etc.). No arbitrary external recipients or actual email delivery. A valid pending invite or active membership blocks duplicates.
- `accept_invite { inviteId }`: recipient identity must match, space must remain active and owner approved. Invitations expire after seven days, including exact-boundary denial. Accepted/revoked/expired invitations cannot be replayed. Expired invitations may be replaced; historical rows remain. Acceptance adds the role without changing the student’s rep/KYC account state.
- Inbox acceptance and `/dashboard?invite=<id>#invitations` both invoke the same action. Links work in the browser containing that demo state; they do not transfer state to another browser. Presenter switches to recipient before acceptance. The form also accepts a pasted full link or raw ID.
- Owner-only `revoke_invite { spaceId, inviteId }` and `revoke_member { spaceId, userId }` revoke pending invites and active co-reps respectively. Owner cannot be revoked. Active permissions end immediately. Reinvitation after revocation is allowed.
- `set_signatories { spaceId, secondId }` selects exactly two distinct active members: owner + one accepted treasurer/adviser. New spaces are explicitly unconfigured (zero designated signatories). Selecting a new pair atomically replaces the old one. Revoking either co-signatory clears both flags; an incomplete pair is never considered configured. `configuredSignatories(state, spaceId)` returns the valid pair or `[]`. M5 must require a pair and revalidate it before payout; no withdrawal feature exists yet.
- Every M3 mutation and audit append are one transition. Reusing an audit operation ID is rejected before mutation. Selecting space/identity is a view action and does not append audit. Permission-aware controls use the same `spacePermission` helper as transitions.

### Track 1 join and payable-due contract

Import `resolveJoinCode` and `payableDues` from `lib/demo/spaces.ts`; consume the same provider state or store snapshot. Do not copy it to a second localStorage key.

```ts
resolveJoinCode(state, student.schoolId, enteredCode): Space | null
payableDues(state, student.schoolId, spaceId): Due[]
```

Join lookup trims/case-normalizes the code and returns only an active matching-school space. It does not grant co-rep membership. Track 1 still owns student joining/membership and checkout. Payable selection returns only published dues from an active same-school space with an approved, verified owner; drafts, closed dues and blocked owners return no payable result. It intentionally includes overdue published dues. These selectors return store records for read-only consumption; callers must not mutate them. Track 1 must recheck state at simulated checkout confirmation and apply its student membership policy. `Due` supplies `id`, `spaceId`, `title`, `type`, integer `amountKobo`, `deadline`, `allowInstalments`, `status`. Face amount excludes the separate student fee. M4 will add confirmed payments and outstanding balances; this selector currently describes the full face amount, not remaining debt.

No Track 1/3 frontend modules were present to connect during M3. These exported local contracts are implemented and tested; student joining, checkout and real payment collection are not claimed complete.

### Persistence and verification

Version 2 uses `duelite.demo.v2`, adding `spaces`, `members`, `dues`, `invites`, `selectedSpaceId`. It validates exact fields, unique IDs/codes/membership keys, due values, membership relations/school scope, invite recipients and signatory-pair integrity before restore. Version 1 is not migrated: if only `duelite.demo.v1` exists, v2 starts fresh with an upgrade notice and leaves the old data untouched. Reset clears v2 applications/KYC/spaces/dues/invites/members/audit and pending KYC timers. Single-tab operation remains the supported demo mode.

`node tests/spaces.test.mjs`: seven tests cover all nine types, actual KYC publish blocking, join/payable selectors, cross-space/school and inactive-state denial, money/calendar validation, invite expiry/duplicates/replay/revocation, all four co-rep roles, signatory configuration/revocation, strict restore and actual store persistence/reset. Existing M1/M2 suites remain required.


## M4 implemented live collections boundary

`lib/demo/collections.ts` owns the synthetic cohort, the confirmed-collection transition and every read selector. The simulated rail lives in `createDemoStore` alongside the existing KYC timer; `components/dashboard/collections.tsx` renders it. No second store, API route, websocket or external service was added.

### Cohort and events

- `cohort(spaceId)` derives exactly `COHORT_SIZE` (200) synthetic students from a hash of the space id using a mulberry32 stream: `{ id: "<spaceId>-s001", name, matric }`. It is deterministic, memoised per space and deliberately **not** persisted, so the localStorage envelope stays small and the same space always shows the same class list.
- `collect { event }` appends one `ConfirmedCollection`. It validates an active space with an approved, verified owner, a payer inside that space's cohort, a non-empty reference, a parseable timestamp, at most one line per due, published dues in that same space, positive safe-integer line amounts, lines summing to `faceAmountKobo`, and `studentFeeKobo` equal to `studentFeeKobo(faceAmountKobo)`.
- A line may not exceed the payer's remaining balance for that due, and a part payment is rejected unless the due sets `allowInstalments`. Pending and failed payments have no representation here: only confirmed events exist, so they can never inflate a total.
- **Deduplication:** an event whose `eventId` *or* `paymentId` is already recorded returns the state unchanged — no ledger row, no audit entry, no error. Replay is therefore safe from any source (rail retry, reload, presenter button).
- Collection audit entries use the reserved actor id `demo-rail` and target the `eventId`.
- `nextCollection(state, spaceId, now)` produces the next simulated payment from the current per-space event count, so the same state always yields the same event, ids and reference. It picks an owing student, one of their unpaid published dues, and pays either the full remaining balance or roughly half when the due allows instalments. It returns `null` once the cohort has settled everything.

### Selectors for Track 1/3

```ts
spaceTotals(state, spaceId)   // collectedKobo, expectedKobo, outstandingKobo, studentFeesKobo, paymentCount, payerCount, lastAt
dueProgress(state, spaceId)   // per published due: collected, expected, outstanding, settled, partial
paymentRows(state, spaceId, { dueId?, query? })     // newest first, one row per line
outstandingRows(state, spaceId, { dueId?, query? }) // part-paid students first, settled students omitted
paidMap(state, spaceId)       // one pass -> `studentId/dueId` -> face kobo
```

`collectedKobo` is the sum of line face amounts only. `studentFeesKobo` is reported separately and is never added to the space balance, matching "space receives face amount only". `expectedKobo` is published due amounts times the cohort size. `query` matches student name or matric number. All selectors filter by `spaceId` first, so events never leak between spaces or schools.

### Simulated rail

`useDemo()` exposes `feed` plus `connectFeed`, `disconnectFeed`, `setTrickle`, `burst`, `replayLast`, `simulateDrop` and `simulateError`. `feed` is `{ status: "offline" | "connecting" | "live" | "reconnecting" | "error", trickle, message }` and is **runtime only** — it is part of the store snapshot, never the persisted envelope, so a reload starts disconnected while confirmed totals remain.

Connecting takes `LINK_DELAY_MS` (900ms), a simulated drop recovers after `RECONNECT_MS` (2500ms), and the trickle emits one payment every `TRICKLE_MS` (1500ms) into the currently selected space. A burst delivers `BURST_SIZE` (20) at once. Trickle, burst and drop require a live connection; an errored rail delivers nothing until reconnected. `stop()` and `reset()` clear the connect, reconnect and trickle timers. Track 3 may replace these controls with its own demo rail; the `collect` action and its deduplication are the integration point.

### Policy changes in M4

- A due with any confirmed payment can no longer be edited (`save_due` rejects it). This closes the M3 note about locking financial edits before collections; explicit revisions remain a possible later design.
- Persistence moves to `duelite.demo.v3` with a `collections` array. Versions 1 and 2 are left untouched and are not migrated; if only an older key exists, v3 starts fresh with an upgrade notice. Restore rejects a ledger with duplicate event or payment ids, unknown spaces or students, unknown fields, wrong fee arithmetic, lines that do not sum to the face amount, or cumulative payments above a due's amount.

`node tests/collections.test.mjs`: seven tests cover face-only crediting and the fee cap, replay and payment-id reuse, progressive partial payments with overpayment and non-instalment rejection, cross-space and unverified-owner isolation, payer/outstanding filters, paid-due edit locking, reload persistence and tampered-ledger rejection, and the full rail lifecycle (connect, trickle, drop, reconnect, burst, replay, error, disconnect, timer cleanup) under mocked timers.

## M5 implemented withdrawals boundary

`lib/demo/withdrawals.ts` owns destinations, withdrawal requests, signatory approvals, the balance selector, the M6 review hook and a simulated Track 3 payout rail. `createDemoStore` issues codes, holds the runtime inbox and runs payouts; `components/dashboard/withdrawals.tsx` renders it. Still no backend, API route or external message.

### Balance

`balances(state, spaceId, now?)` returns `collectedKobo` (confirmed face value), `withdrawnKobo` (amount + fee of `succeeded`), `reservedKobo` (amount + fee of `pending_review`, `awaiting_signatories`, `processing`), `availableKobo = collected − withdrawn − reserved`, and `dailyCommittedKobo` (principal of open or succeeded requests created on the current Africa/Lagos day). `failed`, `rejected` (cancelled) and `expired` requests release their reservation.

### Actions

- `add_destination { bank, accountNumber }` — one of five demo banks and a 10-digit number. A simulated name enquiry sets `accountName` to the actor's own name; only own accounts exist.
- `request_withdrawal { spaceId, destinationId, purpose, amountKobo, codeHashes, expiresAt }` — requires `request_withdrawal` (verified owner of an active space), a valid `configuredSignatories` pair, the actor's own destination, a 3–140 character purpose, and `checkWithdrawalFunds` against `balances` (₦2.5m single, ₦10m daily principal, amount + fee ≤ available). Creates reference `WD-…`, reserves amount + fee and stores one `SignatoryApproval` per signatory. `codeHashes` must contain exactly the two pair members' SHA-256 hex hashes.
- `sign_withdrawal { withdrawalId, codeHash }` — the actor's own approval only. Rejects (no state change) when the request is no longer open, the pair has changed since the request, the code is already used, locked after `MAX_CODE_ATTEMPTS` (3) wrong attempts, or past its `CODE_TTL_MS` (10 min) expiry. A wrong hash increments `failedAttempts` and moves no money. When both approvals are used **and** `flagReasons` is empty, the same transition moves the request to `processing` (atomic release).
- `resend_code { withdrawalId, codeHash, expiresAt }` — replaces the actor's unused hash, resets attempts and expiry. The previous code stops working immediately.
- `cancel_withdrawal { withdrawalId }` — requester only, while unsigned/unreleased → `rejected`.
- `settle_withdrawal { withdrawalId, outcome }` — rail callback, audit actor `demo-payout`. Only a `processing` request changes; repeats and late callbacks return the state unchanged.
- `expire_withdrawals` — every withdrawal action (and store start) first expires open requests older than `WITHDRAWAL_TTL_MS` (24 h).

### Codes and inbox

`hashCode(withdrawalId, userId, code)` is SHA-256 over all three, via Web Crypto, so the store call sites are async: `requestWithdrawal(input)`, `signWithdrawal(id, code)`, `resendCode(id)`. `randomCode()` draws each signatory's 5-digit code independently from `crypto.getRandomValues`. Plaintext codes live only in the store's runtime `inbox` snapshot (`{ userId, withdrawalId, reference, code, sentAt }`), never in the persisted envelope; after a reload a signatory requests a new code. A 5-digit hash is brute-forceable offline — hashing here shows the "never store the code" rule, not a security boundary.

### Payout rail and M6 hook

`createPayoutRail()` is the Track 3 adapter stand-in: `send(reference)` records one outcome per reference and returns it on every retry, so a reference is paid at most once. `failNext` (exposed as `setPayoutFailure`) fails the next new payout. The store sends every `processing` request after `PAYOUT_DELAY_MS` (2 s), including ones restored after a reload, then dispatches `settle_withdrawal`. `stop()`/`reset()` clear payout timers.

`reviewFlags(state, withdrawal)` runs at request time and currently returns `[]`. Any non-empty result puts the request in `pending_review`; signatures are still collected but release requires empty `flagReasons`. **M6 plugs its rules in here**, and needs a review-resolution action that clears flags and releases if both signatures exist.

### Persistence

`duelite.demo.v4` adds `destinations`, `withdrawals` and `approvals`. v1–v3 are untouched, with an upgrade notice. Restore rejects unknown fields (including a plaintext `code`), non-hex hashes, fees that disagree with `withdrawalQuote`, missing approvals, released/settled requests without both signatures, history whose last entry disagrees with the status, destinations not in the owner's name, and any space whose debits plus reservations exceed its collections.

`node tests/withdrawals.test.mjs`: seven tests cover amount + fee coverage and fee boundaries, owner-only and own-account rules, concurrent requests through the store, wrong/expired/locked/replayed/resent codes, atomic release, exactly-once settlement, failure/cancel/expiry/pair-change release, single and daily limits, strict restore, runtime-only inbox, reload-resumed payout and timer cleanup.

## M6 implemented anomaly review and trust boundary

### Review rules

`reviewFlags(state, withdrawal)` runs inside `request_withdrawal`, before any code is used or payout sent. It returns one plain-language sentence per matched rule; any sentence puts the request in `pending_review`. Thresholds live in `REVIEW_RULES` (`lib/demo/withdrawals.ts`):

| Rule | Threshold | Boundary |
|---|---|---|
| Unusually large | above `max(₦200,000, 3 × largest earlier succeeded payout from this space)` | exactly the threshold is not flagged |
| Odd hours | Africa/Lagos (UTC+1) hour in `[0, 5)`, 00:00–04:59 | 05:00 is normal |
| New destination | account saved less than 24 h before the request (`Destination.createdAt`) | exactly 24 h is established |
| Nearly all funds | amount + fee ≥ 90% of available balance (after other reservations) | exactly 90% is flagged |

Reasons are deterministic templates; no AI is used. A paused request still reserves amount + fee and still collects both signatures, but `sign_withdrawal` never releases it and `settle_withdrawal` ignores it.

### Review resolution (Track 3, simulated)

`resolve_review { withdrawalId, decision: "approve" | "reject" }`: only the demo administrator (`isAdmin`, same school), labelled in the UI as the Track 3 demo reviewer. Owners, treasurers and signatories cannot resolve. Only `pending_review` requests. Approve clears `flagReasons` (reasons remain in the status history) and moves to `processing` if both signatures are already used and the pair is unchanged, otherwise to `awaiting_signatories`. Reject → `rejected`, reservation released. Track 3 should replace this with its own review queue using the same transition semantics.

### Trust score

`trustScore(state, spaceId, signals?)` returns `{ score, known, level, inputs }` with four inputs, each `value` in 0–1 or `null`:

- Timely payouts (local): share of settled (succeeded + failed) payouts that succeeded within 24 h of request.
- Transparency usage (`signals.transparencyShare`, 0–1): Track 3.
- Dispute rate (`signals.disputeRate`, 0–1, inverted): Track 3.
- Student ratings (`signals.averageRating`, 1–5, normalised): Track 1.

Missing or out-of-range signals are `null` (unknown), never assumed perfect. `score` is the mean of known inputs ×100 and stays `null` ("Not enough data") until at least two inputs are known. Levels: ≥80 high, ≥50 moderate, else low. No transition reads trust, so it cannot bypass KYC, signatures or review. Until Tracks 1/3 supply `signals`, the badge can only know timely payouts.

### Seed and persistence

`seedDemo()` now includes an established GTBank account for Zainab (`seed-zainab-gtbank`, saved 2026-03-02) for the safe path; adding a new account and withdrawing most of the balance demonstrates the suspicious path. No envelope version bump: v4 already stored `flagReasons`. Restore additionally rejects a `pending_review` request without reasons, and an open or released request that still carries reasons.

`node tests/review.test.mjs`: eight tests cover the safe path, each rule on both sides of its boundary, all four reasons stacking, paused-despite-valid-codes, reviewer-only resolution, approve before/after signatures, reject releasing the reservation, pair change blocking approval, trust unknown/partial/invalid/high inputs, high trust not bypassing review, and restore rules.

## M7 implemented defaulter nudges boundary

All in `lib/demo/nudges.ts`. No model, server, email, SMS or WhatsApp integration; "AI" output is deterministic templates behind a simulated delay and is labelled "Simulated AI" in the UI.

### Selectors and generation

- `nudgeTargets(state, spaceId, now?)`: every cohort student in that space who still owes on a published due, with `remainingKobo`, `paidKobo`, owing `dueTitles`, `paidTitles`, nearest `deadline`, `daysLeft` (Lagos calendar days), `behaviour` (`part_paid` = paid part of an owing due; `paid_other` = settled another due in the space; `not_paid`), `lastNudgedAt` and `coolingDown`. Fully paid students are never returned. Sorted by urgency, part-payers first.
- `suggestSendTime(target, now)`: ≤ 2 days left or overdue → next 09:00 Lagos; part-paid → next 18:00; otherwise next 12:30. Returned with a plain `timing` reason.
- `draftText(target, "en" | "pcm", space, repName)`: English or Pidgin, mentions amount paid, amount left, dues, deadline/overdue, join code and the rep's first name.
- `generateDrafts(state, spaceId, studentIds, language, { now, delayMs = 1200, fail })`: async. Checks `post_announcement` permission and that every student currently owes in this space, then waits and returns drafts. `fail` (presenter toggle) rejects after the delay; no drafts, no state change.

### Sending

`send_nudges { spaceId, messages: [{ studentId, language, text, suggestedAt }] }`, routed through the shared store. Roles: owner, secretary, PRO (the existing `post_announcement` policy) of an active space with an approved owner; KYC is not required because no money moves. Rejects: reused operation id, empty batch, the same student twice in one batch, a student with no outstanding balance *at send time* (re-checked, so a student who paid after generation is refused), a student nudged in this space in the last 24 h (`NUDGE_COOLDOWN_MS`), text empty or over 480 characters after trimming, unknown language. The batch is all-or-nothing. Delivery is immediate to the local demo inbox; `suggestedAt` is recorded and shown but not scheduled.

### Persistence

Envelope v5 (`duelite.demo.v5`) adds `nudges: SentNudge[]` (`id, spaceId, studentId, language, text, balanceKobo, suggestedAt, sentAt, sentBy`) and audit action `send_nudges` targeting the space. v1–v4 are left untouched with an upgrade notice. Drafts are UI-only and not persisted. Restore rejects unknown fields, duplicate ids, non-cohort students, empty/long text, unknown language and non-positive balances.

`node tests/nudges.test.mjs`: six tests cover paid exclusion, partial balances and behaviour in drafts, deterministic English/Pidgin output, Lagos send times, space and role scoping, generation failure, edit/duplicate/replay/cooldown/paid-at-send refusal and v5 restore.

## M8 implemented dues advance and vendor marketplace boundary

Both features are simulated, per the PDF's DEFERRED status, but connect end to end through the shared store. The advance is labelled a **lending concept** in the UI; no credit product, fee or external call exists.

### Dues advance (`lib/demo/advance.ts`)

- `ADVANCE_RULES`: `capShare` 0.8, `repaymentShare` 0.5, `minPayments` 20, `minCollectedShare` 0.1. Change them there.
- `advanceOffer(state, spaceId, now?)` → `{ eligible, reasons, expectedKobo, capKobo, paymentCount, collectedShare }`. Eligible dues are published dues whose deadline is today or later (Lagos). `expectedKobo` is what the cohort still owes on them; `capKobo = floor(0.8 × expectedKobo)` to whole naira. History: at least 20 confirmed payments and at least 10% of all expected dues collected. Only one unrepaid advance per space.
- `take_advance { spaceId, amountKobo }`: verified-KYC owner of an active space (the `request_withdrawal` policy), ₦1 minimum, at most `capKobo`. It credits the space balance: `balances()` now returns `advancedKobo` and `repaidKobo`, and `availableKobo = collected + advanced − repaid − withdrawn − reserved`. Spending advanced money is an ordinary withdrawal (signatures, review, limits).
- `advanceStatus(state, advance)` → `{ repaidKobo, owedKobo, repaid, deductions }`. Repayment is derived, not stored: each confirmed collection *after* the advance (`startIndex` = the space's collection count at the time) contributes `floor(face × 0.5)`, capped by the remaining debt. It can never exceed the debt or any single collection. Replayed events are already deduplicated by the collection ledger.

### Vendor marketplace (`lib/demo/vendors.ts`)

- `VENDORS`: two approved synthetic vendors (Yaba Print Hub, Campus Threads), each with two discounted products (`listKobo`, `priceKobo`, due type) and a settlement account. It is a constant, not persisted state.
- `attach_vendor_item { spaceId, productId, quantity, deadline }`: `manage_dues` role (owner, treasurer, secretary; no KYC). Creates a **draft** due at the discounted unit price (full payment only) plus a `VendorOrder` (`quantity` 1–1000, `totalKobo = unit × quantity`). Publishing follows the normal KYC-gated flow. `save_due` refuses to edit a vendor-linked due.
- Settlement: `request_withdrawal` accepts `orderId`. Then the destination must be that order's vendor and the amount must equal `totalKobo`. The fee, limits, both signatory codes and anomaly review all apply unchanged. An order with a succeeded or open settlement refuses another. A failed, rejected or expired settlement allows a retry. `WithdrawalRecord` gains `orderId: string | null`. `orderSettlement(state, orderId)` → `unpaid | in_progress | settled`.

### Persistence

Envelope v6 (`duelite.demo.v6`) adds `advances` and `orders`, plus `orderId` on withdrawals. v1–v5 are left untouched with an upgrade notice. The audit trail accepts `take_advance` and `attach_vendor_item`. Restore rejects an advance over its offer, a non-owner requester, two unrepaid advances in one space, orders whose price, vendor, total or due do not match the catalogue, a vendor settlement to any other destination or amount, and more than one succeeded or open settlement per order.

`node tests/advance-vendors.test.mjs`: six tests.

## M9 integration, stage seed and cross-track status

### Stage seed (`lib/demo/store.ts`)

- `stageDemo(now)` builds the stage-script starting point through ordinary `transition` calls with fixed operation ids (`stage-1`, `stage-2`, …), so every rule and audit entry applies and the cohort and payment history are identical on every load. It contains Zainab's verified "Computer Science 200L" space (join code `DU000001`), a published ₦5,000 departmental due allowing instalments and due 30 days after `now`, Ada as accepted treasurer and second signatory, and `STAGE_PAYMENTS` (150) confirmed payments spread over the previous three days, leaving about 70 defaulters. The selected identity is Zainab.
- Store `loadStage()` / `reset()` share one replace path: clear the KYC, feed, link and payout timers, reset the runtime feed, inbox and payout rail, then save. The dashboard's Demo controls offer "Load stage demo" and "Reset demo", each behind a confirmation.
- `dueLock(state, dueId)` (in `lib/demo/spaces.ts`) returns why a due can no longer be edited (it has confirmed payments, or it is a vendor item) or `""`. `save_due` and the due list use the same rule, so a locked due no longer shows an Edit button that would then be refused.

### Cross-track status (checked 2026-09-19)

- **Track 1:** no frontend module exists on any branch. Track 2 still exposes `resolveJoinCode`/`payableDues` and consumes the local cohort and simulated rail.
- **Track 3:** `origin/track3` (commit `c0a25ef`) adds `/admin/*`, the public transparency page `/t/[code]` with a QR code, a print-to-PDF report `/t/[code]/report`, and its own seed and store. **It has not been merged or connected.** It is a separate world:
  - Its store is `lib/demo/store.ts`, the same path as Track 2's. It is a module-level in-memory store with no persistence.
  - Money is integer **naira**. Track 2 uses kobo.
  - It has 5 due types (`dues | handout | levy | project | wear`). Track 2 has the PDF's 9.
  - It uses its own ids, spaces, join codes (none are `DU…`), withdrawal statuses (`sent | pending | blocked`) and audit shape (`Activity`).
  - It adds the `qrcode` and `@types/qrcode` dependencies, `allowImportingTsExtensions`, and a committed `package-lock.json`. That lockfile collides with the untracked one in this worktree.
- Linking Track 2 to `/t/<joinCode>` would therefore 404 for every Track 2 space. Connecting the tracks needs one agreed store: either Track 3 screens read Track 2's `DemoState` through adapters (kobo → naira, statuses and audit mapped), or both stores merge. That is a joint decision; Track 2 has not changed Track 3's files.
- Until the tracks connect, these remain local stand-ins:
  - Admin review, anomaly review and the payout rail.
  - Trust signals for transparency usage, disputes and ratings. The badge honestly shows "Not enough data".
  - The transparency QR and PDF report, which Track 3 owns.
