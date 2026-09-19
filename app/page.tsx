import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Alert02Icon,
  Analytics01Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  InstagramIcon,
  Linkedin01Icon,
  NewTwitterIcon,
  PlusSignIcon,
  SecurityLockIcon,
  ShoppingCart01Icon,
} from "@hugeicons/core-free-icons";

import SiteHeader, { Logo } from "@/components/site-header";

/* --------------------------------------------------------------- pieces */

function Check({ className = "" }: { className?: string }) {
  return (
    <HugeiconsIcon
      icon={CheckmarkCircle02Icon}
      size={18}
      strokeWidth={1.8}
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    />
  );
}

function Arrow() {
  return (
    <HugeiconsIcon
      icon={ArrowRight01Icon}
      size={16}
      strokeWidth={2}
      aria-hidden="true"
    />
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">
      <span className="h-1.5 w-1.5 rounded-full bg-flame" />
      {children}
    </span>
  );
}

/* Splits a line into words so each one can rise in on its own delay. */
function Words({ text, from = 0 }: { text: string; from?: number }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="word"
          style={{ "--i": from + i } as React.CSSProperties}
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

function MockBar({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-black/[0.07] px-4 py-3">
      <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
      <span className="ml-2 truncate font-mono text-[11px] text-ink-muted">
        {title}
      </span>
    </div>
  );
}

const DUE_TYPES = [
  "Handout",
  "Departmental due",
  "Exam levy",
  "Lab manual",
  "Association due",
  "Departmental wear",
  "Trip fee",
  "Clearance",
];

const REPLACES = [
  "WhatsApp broadcasts",
  "A personal bank account",
  "Transfer screenshots",
  "A Google Form",
  "The rep’s notebook",
];

const WITH_DUEVY = [
  "One transfer for every due",
  "A receipt with a reference",
  "Two signatures on every withdrawal",
];

const STEPS = [
  {
    n: "01",
    title: "A rep opens a space",
    body: "Name the department, class or association, get a join code, then add each due with its amount, deadline and instalment rules.",
  },
  {
    n: "02",
    title: "Students join and pay",
    body: "Scan the code, tick every due owed, pay the combined total in one transfer. The receipt, with its reference, lands immediately.",
  },
  {
    n: "03",
    title: "Money moves with two keys",
    body: "The dashboard fills up live. Withdrawing takes two signatories and a clean anomaly check, and every move is written to the log.",
  },
];

const PRINCIPLES = [
  {
    chip: "Verified reps only",
    title: "Class money never sits in a personal account",
    body: "A rep passes a KYC check before they can collect anything. Students never do — the friction sits with the person holding the money, not the 200 people paying.",
  },
  {
    chip: "Multi-due cart",
    title: "One transfer replaces five",
    body: "Handout, exam levy and association due go into one cart and out as a single payment. Five transfers, five screenshots and five rounds of chasing become one.",
  },
  {
    chip: "Two signatures",
    title: "Nobody moves money alone",
    body: "Every withdrawal needs two independent 5-digit codes. A mistake or a theft would take collusion, which is the whole point.",
  },
];

const NUMBERS = [
  {
    stat: "2%",
    label: "Student fee",
    body: "Charged on a payment and capped at ₦250 — the payment provider’s cut already inside it.",
  },
  {
    stat: "₦0",
    label: "What a space pays",
    body: "Every due arrives at its full face amount. The space is never the one being charged.",
  },
  {
    stat: "2",
    label: "Signatures per withdrawal",
    body: "Two separate one-time codes before a single naira can leave a space.",
  },
  {
    stat: "1",
    label: "Transfer per student",
    body: "However many dues are owed this semester, it settles in a single payment.",
  },
];

const QUOTES = [
  {
    n: "01",
    quote: "Send to my account, I’ll compile the list later.",
    who: "The course rep",
    where: "Broadcast, 11:48pm",
    tag: "No record",
  },
  {
    n: "02",
    quote: "I paid since last week o. Check your account.",
    who: "A student",
    where: "With a screenshot as the only proof",
    tag: "No receipt",
  },
  {
    n: "03",
    quote: "Who never pay? Deadline is tomorrow.",
    who: "The same rep",
    where: "Fifth broadcast this week",
    tag: "Manual chasing",
  },
  {
    n: "04",
    quote: "So where exactly did the money go?",
    who: "Everyone",
    where: "At the end of the session",
    tag: "No paper trail",
  },
];

const FAQS = [
  {
    q: "What is Duevy?",
    a: "A platform for departmental money. A course rep creates a space for a department, class or association and adds dues to it. Students join with a code, tick what they owe and pay in one transfer. The rep watches collections arrive live and withdraws to their own bank account, and every movement is recorded in an audit trail students can inspect.",
  },
  {
    q: "Who pays the fee?",
    a: "The student pays 2% of their payment, capped at ₦250, and that already includes the payment provider’s cut. The rep pays ₦100 to withdraw up to ₦50,000, or ₦200 above that. The space itself pays nothing and always receives the full face amount of every due.",
  },
  {
    q: "Can a rep run off with the class money?",
    a: "Not on their own. Every space has two signatories — typically the rep and the treasurer or a staff adviser. A withdrawal sends each of them a separate 5-digit code, and both must be entered before anything moves. On top of that, anomaly checks pause unusually large amounts, odd hours, a brand-new destination account, or an attempt to empty the balance.",
  },
  {
    q: "How do students know the money is safe?",
    a: "Because no one person can move it. Every withdrawal needs two separate 5-digit codes from two different signatories, and anomaly checks pause anything unusual before it goes through. Alongside that, every payment and withdrawal is written to an audit trail with a timestamp and a purpose, and each student gets a receipt with its own reference the moment they pay — so there is always a record to point at instead of a screenshot.",
  },
  {
    q: "Do students have to verify their identity?",
    a: "No. KYC applies to reps only, because they are the ones who can move money. Students sign up with a name, email and phone — enough to tie every payment to a real person so receipts, history and refunds work.",
  },
  {
    q: "Is real money moving through this build?",
    a: "No, and that matters. This is a demo: payments, bank transfers, KYC checks and messages are all simulated in the browser on seeded data, with no payment provider behind them. Handling student funds in production needs licensing and registration steps that a demo does not replace — that work is a known part of the roadmap, not something quietly skipped.",
  },
];

const MARQUEE_ITEMS = [
  "Pay your dues. Simply.",
  "One transfer",
  "Live collections",
  "Two signatures",
  "A full audit trail",
  "Receipts, not screenshots",
];

/* ----------------------------------------------------------------- page */

export default function Home() {
  return (
    <>
      <SiteHeader />

      <main id="top" className="flex-1">
        {/* ------------------------------------------------------- hero */}
        <section className="relative overflow-hidden">
          <div className="relative mx-auto max-w-6xl px-5 pt-16 text-center sm:px-8 sm:pt-24">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/15 bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-brand shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              Built for Nigerian campuses
            </span>

            <h1 className="mx-auto mt-7 max-w-4xl text-[clamp(2.6rem,7.5vw,5.1rem)] font-semibold leading-[0.97] tracking-[-0.035em]">
              <Words text="Pay your dues." />
              <br />
              <span className="text-brand">
                <Words text="Simply." from={3} />
              </span>
            </h1>

            <p className="mx-auto mt-7 max-w-xl text-[17px] leading-[1.65] text-ink-muted sm:text-[19px]">
              Duevy is where students pay departmental dues, handouts and levies
              in one transfer — and where course reps collect, track and
              withdraw that money with a full paper trail.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <a
                href="#product"
                className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-[15px] font-medium text-white shadow-[0_8px_24px_-8px_rgba(90,49,178,0.65)] transition-colors hover:bg-brand-deep"
              >
                See what it does
                <Arrow />
              </a>
              <a
                href="#how"
                className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-5 py-3 text-[15px] font-medium text-ink transition-colors hover:border-black/25"
              >
                How it works
              </a>
            </div>

            <p className="mt-14 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Every due, in one go
            </p>
          </div>

          {/* Due types scroll past in place of the usual logo row */}
          <div className="relative mt-5 overflow-hidden pb-16 sm:pb-24">
            <div className="marquee-track marquee-track--slow gap-3 pr-3">
              {[...DUE_TYPES, ...DUE_TYPES].map((type, i) => (
                <span
                  key={`${type}-${i}`}
                  className="shrink-0 rounded-full border border-black/[0.08] bg-white px-4 py-2 text-[14px] font-medium text-ink-muted"
                >
                  {type}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------- what it replaces */}
        <section className="bg-ink px-5 py-16 text-white sm:px-8 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <p className="text-center text-[13px] font-medium text-white/45">
              Replaces the way your class collects money today
            </p>

            <div className="mt-10 grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr] lg:gap-8">
              <div className="reveal rounded-3xl border border-white/[0.08] bg-white/[0.03] p-6 sm:p-7">
                <span className="inline-flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  <span className="h-1.5 w-1.5 rounded-full bg-flame" />
                  Today
                </span>
                <ul className="mt-5 flex flex-wrap gap-2">
                  {REPLACES.map((item) => (
                    <li
                      key={item}
                      className="rounded-full border border-white/[0.08] px-3.5 py-2 text-[14px] font-medium text-white/35 line-through decoration-flame/80 decoration-[1.5px]"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <span
                aria-hidden="true"
                className="mx-auto grid h-11 w-11 rotate-90 place-items-center rounded-full border border-white/[0.12] bg-white/[0.06] text-white/70 lg:rotate-0"
              >
                <Arrow />
              </span>

              <div className="reveal rounded-3xl border border-white/[0.14] bg-white/[0.07] p-6 sm:p-7">
                <span className="inline-flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/55">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  With Duevy
                </span>
                <ul className="mt-5 space-y-3.5">
                  {WITH_DUEVY.map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-2.5 text-[15.5px] font-medium sm:text-[16.5px]"
                    >
                      <Check className="text-flame" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ how it works */}
        <section
          id="how"
          className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28"
        >
          <div className="reveal max-w-2xl">
            <Label>How it works</Label>
            <h2 className="mt-5 text-[clamp(2rem,4.6vw,3.2rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
              Three steps, one afternoon.
            </h2>
          </div>

          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((step) => (
              <li
                key={step.n}
                className="reveal rounded-3xl border border-black/[0.08] bg-white p-7 transition-colors hover:border-brand/30"
              >
                <span className="font-mono text-[13px] font-medium text-brand">
                  {step.n}
                </span>
                <h3 className="mt-5 text-[20px] font-semibold tracking-[-0.01em]">
                  {step.title}
                </h3>
                <p className="mt-3 text-[15px] leading-[1.6] text-ink-muted">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* --------------------------------------------------- showcase */}
        <section id="product" className="bg-lilac/60 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="reveal max-w-2xl">
              <Label>What we built</Label>
              <h2 className="mt-5 text-[clamp(2rem,4.6vw,3.2rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
                Three things, done properly.
              </h2>
              <p className="mt-5 text-[17px] leading-[1.6] text-ink-muted">
                Two of them speed up collection. One of them makes sure the
                money cannot walk. Nothing here is decoration.
              </p>
            </div>

            <div className="card-stack mt-14">
              {/* 1 — checkout */}
              <Feature
                index={0}
                icon={ShoppingCart01Icon}
                eyebrow="For students"
                title="One transfer, every due"
                body="Tick the handout, the exam levy and the association due, see one total, pay once. The receipt arrives with a reference the rep cannot argue with."
                bullets={[
                  "Multi-due cart with a single combined total",
                  "Receipt with reference, dues covered and time paid",
                  "Instalments on the big levies, with part receipts",
                  "Wallet top-ups, saved cards and self-service refunds",
                ]}
              >
                <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
                  <MockBar title="duevy.app / checkout" />
                  <div className="p-5">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                      Microbiology 400L
                    </p>
                    <ul className="mt-4 space-y-2.5">
                      {[
                        ["Handout — Industrial Micro", "₦3,500", true],
                        ["Exam levy", "₦2,000", true],
                        ["Association due", "₦1,500", true],
                        ["Departmental wear", "₦7,500", false],
                      ].map(([name, amount, on]) => (
                        <li
                          key={name as string}
                          className="flex items-center gap-3 rounded-xl border border-black/[0.06] px-3.5 py-2.5"
                        >
                          <span
                            className={`grid h-4 w-4 place-items-center rounded-[5px] border ${
                              on
                                ? "border-brand bg-brand text-white"
                                : "border-black/20"
                            }`}
                          >
                            {on ? (
                              <svg
                                viewBox="0 0 12 12"
                                className="h-2.5 w-2.5"
                                fill="none"
                                aria-hidden="true"
                              >
                                <path
                                  d="M2.5 6.2 4.8 8.5 9.5 3.8"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : null}
                          </span>
                          <span
                            className={`flex-1 text-[13.5px] ${
                              on ? "text-ink" : "text-ink-muted"
                            }`}
                          >
                            {name as string}
                          </span>
                          <span className="font-mono text-[13px] text-ink-muted">
                            {amount as string}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 space-y-1.5 border-t border-dashed border-black/10 pt-4 text-[13px]">
                      <div className="flex justify-between text-ink-muted">
                        <span>Service fee (2%, capped ₦250)</span>
                        <span className="font-mono">₦140</span>
                      </div>
                      <div className="flex justify-between text-[15px] font-semibold">
                        <span>Total</span>
                        <span className="font-mono">₦7,140</span>
                      </div>
                    </div>
                    <div className="mt-4 rounded-full bg-brand py-2.5 text-center text-[13.5px] font-medium text-white">
                      Pay in one transfer
                    </div>
                  </div>
                </div>
              </Feature>

              {/* 2 — dashboard */}
              <Feature
                reverse
                index={1}
                icon={Analytics01Icon}
                eyebrow="For reps"
                title="A dashboard that answers “who is owing?”"
                body="Totals, the payer list and the outstanding list update the moment a payment confirms. No spreadsheet, no roll call in the group chat."
                bullets={[
                  "Live totals as each payment lands",
                  "Paid and outstanding lists, filtered by due or student",
                  "One click drafts a personal reminder to every defaulter",
                  "Exportable audit report for the class or the HOD",
                ]}
              >
                <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
                  <MockBar title="duevy.app / collections" />
                  <div className="p-5">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        ["Collected", "₦1.28m"],
                        ["Paid", "164"],
                        ["Owing", "38"],
                      ].map(([k, v]) => (
                        <div
                          key={k}
                          className="rounded-xl bg-lilac px-3 py-2.5"
                        >
                          <p className="text-[11px] font-medium text-ink-muted">
                            {k}
                          </p>
                          <p className="mt-0.5 font-mono text-[16px] font-semibold text-ink">
                            {v}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4">
                      <div className="flex justify-between text-[11.5px] text-ink-muted">
                        <span>Collection progress</span>
                        <span className="font-mono">81%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/[0.07]">
                        <div className="h-full w-[81%] rounded-full bg-gradient-to-r from-brand to-brand-deep" />
                      </div>
                    </div>
                    <ul className="mt-4 space-y-2">
                      {[
                        ["Adeola A.", "3 dues", "Paid", true],
                        ["Chinedu O.", "Exam levy", "Paid", true],
                        ["Halima B.", "2 dues", "Owing", false],
                        ["Tobi F.", "Handout", "Instalment 2/3", false],
                      ].map(([name, what, status, ok]) => (
                        <li
                          key={name as string}
                          className="flex items-center gap-3 text-[13px]"
                        >
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-lilac text-[11px] font-semibold text-brand">
                            {(name as string).charAt(0)}
                          </span>
                          <span className="flex-1 text-ink">
                            {name as string}
                          </span>
                          <span className="text-ink-muted">
                            {what as string}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              ok
                                ? "bg-mint/10 text-mint"
                                : "bg-flame/10 text-flame"
                            }`}
                          >
                            {status as string}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Feature>

              {/* 3 — two signatories */}
              <Feature
                flagship
                index={2}
                icon={SecurityLockIcon}
                eyebrow="The flagship"
                title="Two signatures, or nothing moves"
                body="A withdrawal sends a separate 5-digit code to each signatory. Both go in, or the money stays exactly where it is. Anomaly checks run before the codes are even issued."
                bullets={[
                  "Two independent one-time codes per withdrawal",
                  "Flags on odd hours, new accounts and near-empty balances",
                  "Plain-language reason on every blocked request",
                  "Fee shown before confirming: ₦100, or ₦200 above ₦50,000",
                ]}
              >
                <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
                  <MockBar title="duevy.app / withdraw" />
                  <div className="p-5">
                    <div className="flex items-baseline justify-between">
                      <p className="text-[13px] text-ink-muted">
                        Withdrawal request
                      </p>
                      <p className="font-mono text-[20px] font-semibold">
                        ₦355,000
                      </p>
                    </div>

                    <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-flame/25 bg-flame/[0.06] px-3.5 py-3">
                      <HugeiconsIcon
                        icon={Alert02Icon}
                        size={16}
                        strokeWidth={2}
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-flame"
                      />
                      <p className="text-[12.5px] leading-[1.5] text-ink">
                        <span className="font-semibold">Anomaly check:</span>{" "}
                        destination account added 4 minutes ago, and this would
                        empty 92% of the balance.
                      </p>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {[
                        {
                          role: "Signatory 1 · Rep",
                          code: ["4", "8", "2", "0", "1"],
                          done: true,
                        },
                        {
                          role: "Signatory 2 · Treasurer",
                          code: ["7", "1", "•", "•", "•"],
                          done: false,
                        },
                      ].map((sig) => (
                        <div
                          key={sig.role}
                          className="rounded-xl border border-black/[0.07] px-3.5 py-3"
                        >
                          <p className="text-[11.5px] font-medium text-ink-muted">
                            {sig.role}
                          </p>
                          <div className="mt-2 flex gap-1.5">
                            {sig.code.map((digit, i) => (
                              <span
                                key={i}
                                className={`grid h-8 w-7 place-items-center rounded-md font-mono text-[14px] ${
                                  sig.done
                                    ? "bg-brand/10 text-brand"
                                    : "bg-black/[0.05] text-ink-muted"
                                }`}
                              >
                                {digit}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 rounded-xl bg-ink px-3.5 py-3 text-[12.5px] text-white/90">
                      <span className="font-semibold text-white">Held.</span>{" "}
                      Second code incomplete — nothing has left the space.
                    </div>
                  </div>
                </div>
              </Feature>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- principles */}
        <section
          id="trust"
          className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28"
        >
          <div className="reveal max-w-2xl">
            <Label>How Duevy thinks</Label>
            <h2 className="mt-5 text-[clamp(2rem,4.6vw,3.2rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
              Three rules about other people’s money.
            </h2>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {PRINCIPLES.map((item) => (
              <article
                key={item.title}
                className="reveal rounded-3xl border border-black/[0.08] bg-white p-7 transition-colors hover:border-brand/30"
              >
                <span className="inline-flex rounded-full bg-lilac px-3 py-1 text-[11.5px] font-medium text-brand">
                  {item.chip}
                </span>
                <h3 className="mt-5 text-[21px] font-semibold leading-[1.25] tracking-[-0.015em]">
                  {item.title}
                </h3>
                <p className="mt-3 text-[15px] leading-[1.6] text-ink-muted">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------------- numbers */}
        <section className="bg-ink py-20 text-white sm:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="reveal max-w-2xl">
              <span className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-flame-soft">
                <span className="h-1.5 w-1.5 rounded-full bg-flame" />
                By the numbers
              </span>
              <h2 className="mt-5 text-[clamp(2rem,4.6vw,3.2rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
                The whole model, in four figures.
              </h2>
            </div>

            <div className="mt-14 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
              {NUMBERS.map((item) => (
                <div
                  key={item.label}
                  className="reveal border-t border-white/15 pt-6"
                >
                  <p className="font-mono text-[clamp(2.6rem,5vw,3.6rem)] font-semibold leading-none tracking-[-0.04em]">
                    {item.stat}
                  </p>
                  <p className="mt-4 text-[15px] font-medium">{item.label}</p>
                  <p className="mt-2 text-[14px] leading-[1.6] text-white/55">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- pricing */}
        <section
          id="pricing"
          className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28"
        >
          <div className="reveal max-w-2xl">
            <Label>Pricing</Label>
            <h2 className="mt-5 text-[clamp(2rem,4.6vw,3.2rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
              One fee, on the screen before you pay.
            </h2>
          </div>

          <div className="reveal mt-12 overflow-hidden rounded-3xl border border-black/[0.08]">
            <div className="hidden grid-cols-12 gap-4 bg-lilac px-6 py-4 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted sm:grid">
              <span className="col-span-3">Who pays</span>
              <span className="col-span-4">When</span>
              <span className="col-span-5">How much</span>
            </div>
            {[
              {
                who: "Student",
                when: "On each payment",
                much: "2% of the payment, capped at ₦250 — the payment provider’s cut included.",
              },
              {
                who: "Rep",
                when: "On each withdrawal",
                much: "₦100 up to ₦50,000. ₦200 above ₦50,000.",
              },
              {
                who: "The space",
                when: "Never",
                much: "Receives the full face amount of every due.",
              },
            ].map((row) => (
              <div
                key={row.who}
                className="grid gap-1 border-t border-black/[0.07] px-6 py-5 sm:grid-cols-12 sm:gap-4 sm:py-6"
              >
                <span className="text-[15px] font-semibold sm:col-span-3">
                  {row.who}
                </span>
                <span className="text-[14px] text-ink-muted sm:col-span-4">
                  {row.when}
                </span>
                <span className="text-[14.5px] text-ink sm:col-span-5">
                  {row.much}
                </span>
              </div>
            ))}
          </div>

          <div className="reveal mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-lilac px-6 py-5 text-[15px]">
            <span className="font-semibold">Worked example</span>
            <span className="text-ink-muted">
              A ₦5,000 handout costs the student ₦100 in fees. They pay ₦5,100,
              and the space receives exactly ₦5,000.
            </span>
          </div>
        </section>

        {/* ------------------------------------------------- the problem */}
        <section className="border-y border-black/[0.06] bg-lilac/60 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="reveal max-w-2xl">
              <Label>The problem</Label>
              <h2 className="mt-5 text-[clamp(2rem,4.6vw,3.2rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
                How it works today.
              </h2>
              <p className="mt-5 text-[17px] leading-[1.6] text-ink-muted">
                Four moments from a normal semester. Every one of them is a
                thing Duevy is built to delete.
              </p>
            </div>

            <div className="hide-scrollbar mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
              {QUOTES.map((item) => (
                <figure
                  key={item.n}
                  className="flex w-[85vw] shrink-0 snap-start flex-col justify-between rounded-3xl border border-black/[0.08] bg-white p-7 sm:w-[360px]"
                >
                  <div>
                    <span className="font-mono text-[13px] font-medium text-brand">
                      {item.n}
                    </span>
                    <blockquote className="mt-5 text-[20px] font-medium leading-[1.35] tracking-[-0.015em]">
                      “{item.quote}”
                    </blockquote>
                  </div>
                  <figcaption className="mt-8 flex items-end justify-between gap-4">
                    <span className="text-[13px] leading-[1.5]">
                      <span className="block font-medium text-ink">
                        {item.who}
                      </span>
                      <span className="block text-ink-muted">{item.where}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-flame/10 px-2.5 py-1 text-[11px] font-medium text-flame">
                      {item.tag}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- marquee */}
        <section className="overflow-hidden border-b border-black/[0.06] py-8">
          <div className="marquee-track items-center gap-6 pr-6">
            {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map(
              (item, i) => (
                <span
                  key={`${item}-${i}`}
                  className="flex shrink-0 items-center gap-6 text-[20px] font-medium tracking-[-0.02em] text-ink/30 sm:text-[26px]"
                >
                  {item}
                  <span className="text-flame">✦</span>
                </span>
              ),
            )}
          </div>
        </section>

        {/* --------------------------------------------------------- faq */}
        <section
          id="faq"
          className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28"
        >
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
            <div className="reveal lg:sticky lg:top-28 lg:self-start">
              <Label>FAQ</Label>
              <h2 className="mt-5 text-[clamp(2rem,4.6vw,3.2rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
                Straight answers.
              </h2>
              <p className="mt-5 text-[16px] leading-[1.6] text-ink-muted">
                Including the one about whether a rep can still run off with the
                money.
              </p>
            </div>

            <div className="reveal">
              {FAQS.map((item, i) => (
                <details
                  key={item.q}
                  open={i === 0}
                  className="group border-b border-black/[0.08] py-5 first:border-t"
                >
                  <summary className="flex items-center justify-between gap-6 text-[17px] font-medium tracking-[-0.01em] transition-colors group-hover:text-brand sm:text-[18px]">
                    {item.q}
                    <span
                      aria-hidden="true"
                      className="faq-sign grid h-7 w-7 shrink-0 place-items-center rounded-full border border-black/10 text-ink-muted transition-transform duration-200"
                    >
                      <HugeiconsIcon
                        icon={PlusSignIcon}
                        size={14}
                        strokeWidth={2}
                      />
                    </span>
                  </summary>
                  <p className="mt-4 max-w-2xl pr-10 text-[15px] leading-[1.7] text-ink-muted">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- cta */}
        <section id="cta" className="px-5 pb-20 sm:px-8 sm:pb-28">
          <div className="reveal relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-gradient-to-br from-brand via-brand-deep to-brand-dark px-7 py-16 text-center text-white sm:px-16 sm:py-20">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-flame/20 blur-3xl" />

            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-[clamp(2rem,4.6vw,3.2rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
                Stop collecting class money in your own account.
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-[16.5px] leading-[1.6] text-white/75">
                Open a space, add your dues, share the code. Your class pays in
                one transfer and can check the books whenever they like.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <a
                  href="#top"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[15px] font-medium text-brand transition-transform hover:-translate-y-0.5"
                >
                  Create a space
                  <Arrow />
                </a>
                <a
                  href="#top"
                  className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-3 text-[15px] font-medium text-white transition-colors hover:bg-white/10"
                >
                  Join with a code
                </a>
              </div>
              <p className="mt-8 text-[12.5px] text-white/55">
                Demo build · payments, transfers and KYC are simulated · no real
                money moves
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ------------------------------------------------------- footer */}
      <footer className="bg-ink text-white">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)]">
            <div>
              <Logo className="text-white" />
              <p className="mt-5 max-w-xs text-[15px] leading-[1.6] text-white/55">
                Departmental dues, handouts and levies — collected in one
                transfer, with a paper trail the whole class can read.
              </p>
              <div className="mt-6 flex gap-2">
                {[
                  { label: "X", icon: NewTwitterIcon },
                  { label: "Instagram", icon: InstagramIcon },
                  { label: "LinkedIn", icon: Linkedin01Icon },
                ].map((social) => (
                  <a
                    key={social.label}
                    href="#top"
                    aria-label={social.label}
                    className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white/40 hover:text-white"
                  >
                    <HugeiconsIcon
                      icon={social.icon}
                      size={16}
                      strokeWidth={1.8}
                    />
                  </a>
                ))}
              </div>
            </div>

            <div className="grid gap-10 sm:grid-cols-3">
              {[
                {
                  heading: "Product",
                  links: [
                    "For students",
                    "For reps",
                    "Withdrawals",
                    "Receipts",
                  ],
                },
                {
                  heading: "Company",
                  links: ["About", "Roadmap", "Contact", "Institutions"],
                },
                {
                  heading: "Trust",
                  links: [
                    "How money moves",
                    "Audit log",
                    "Refunds",
                    "Honest limits",
                  ],
                },
              ].map((col) => (
                <div key={col.heading}>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/40">
                    {col.heading}
                  </p>
                  <ul className="mt-4 space-y-2.5">
                    {col.links.map((link) => (
                      <li key={link}>
                        <a
                          href="#top"
                          className="text-[14.5px] text-white/70 transition-colors hover:text-white"
                        >
                          {link}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-14 flex flex-col gap-6 border-t border-white/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-white/45">
              © 2026 Duevy. A hackathon demo — simulated payments, seeded data,
              no real money.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {["Privacy", "Terms", "Cookies"].map((link) => (
                <a
                  key={link}
                  href="#top"
                  className="text-[13px] text-white/45 transition-colors hover:text-white"
                >
                  {link}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

/* --------------------------------------------------------- feature card */

function Feature({
  index,
  icon,
  eyebrow,
  title,
  body,
  bullets,
  children,
  reverse = false,
  flagship = false,
}: {
  index: number;
  icon: IconSvgElement;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  children: React.ReactNode;
  reverse?: boolean;
  flagship?: boolean;
}) {
  return (
    <div
      className="card-stack__item"
      style={{ "--i": index } as React.CSSProperties}
    >
      <article className="grid items-center gap-8 rounded-[32px] border border-black/[0.08] bg-white p-6 shadow-[0_-12px_44px_-26px_rgba(15,15,18,0.5)] sm:p-10 lg:grid-cols-2 lg:gap-14">
        <div className={reverse ? "lg:order-2" : undefined}>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand text-white">
              <HugeiconsIcon
                icon={icon}
                size={20}
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </span>
            <span className="inline-flex rounded-full bg-lilac px-3 py-1 text-[11.5px] font-medium text-brand">
              {eyebrow}
            </span>
            {flagship ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-flame/10 px-3 py-1 text-[11.5px] font-medium text-flame">
                Trust feature
              </span>
            ) : null}
            <span className="ml-auto font-mono text-[12px] text-ink-muted">
              0{index + 1} / 04
            </span>
          </div>

          <h3 className="mt-5 text-[clamp(1.6rem,3vw,2.2rem)] font-semibold leading-[1.15] tracking-[-0.025em]">
            {title}
          </h3>
          <p className="mt-4 text-[16px] leading-[1.65] text-ink-muted">
            {body}
          </p>

          <ul className="mt-7 space-y-3">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-3">
                <Check className="mt-0.5 text-brand" />
                <span className="text-[15px] leading-[1.5] text-ink">
                  {bullet}
                </span>
              </li>
            ))}
          </ul>

          <a
            href="#cta"
            className="mt-8 inline-flex items-center gap-2 text-[15px] font-medium text-brand transition-colors hover:text-brand-deep"
          >
            See it in the demo
            <Arrow />
          </a>
        </div>

        <div className={reverse ? "lg:order-1" : undefined}>{children}</div>
      </article>
    </div>
  );
}
