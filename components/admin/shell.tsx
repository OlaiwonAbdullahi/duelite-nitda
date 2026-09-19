"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  Analytics01Icon,
  CodeIcon,
  Money03Icon,
  Note01Icon,
  RefreshIcon,
  SecurityLockIcon,
  UserGroupIcon,
  ZapIcon,
} from "@hugeicons/core-free-icons";

import { Logo } from "@/components/site-header";
import { Button, Select } from "@/components/admin/ui";
import { resetDemo, simulatePayments, useDemo } from "@/lib/demo/store";

/* School scope. Every admin screen reads it so the multi-institution story
 * works from a single control in the header. */
const SchoolContext = createContext<{
  schoolId: string;
  setSchoolId: (id: string) => void;
}>({ schoolId: "all", setSchoolId: () => {} });

export const useSchoolScope = () => useContext(SchoolContext);

const NAV = [
  { href: "/admin", label: "Overview", icon: Analytics01Icon },
  { href: "/admin/reps", label: "Reps", icon: UserGroupIcon },
  { href: "/admin/spaces", label: "Spaces", icon: SecurityLockIcon },
  { href: "/admin/transactions", label: "Transactions", icon: Money03Icon },
  { href: "/admin/disputes", label: "Disputes", icon: Alert02Icon },
  { href: "/admin/activity", label: "Activity log", icon: Note01Icon },
  { href: "/admin/api", label: "Institution API", icon: CodeIcon },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const demo = useDemo();
  const pathname = usePathname();
  const [schoolId, setSchoolId] = useState("all");
  const [panelOpen, setPanelOpen] = useState(false);

  const pending = demo.users.filter((u) => u.repStatus === "pending").length;
  const disputes = demo.refunds.filter((r) => r.status === "pending").length;
  const badge: Record<string, number> = {
    "/admin/reps": pending,
    "/admin/disputes": disputes,
  };

  return (
    <SchoolContext value={{ schoolId, setSchoolId }}>
      <div className="min-h-screen bg-[#fafafa]">
        <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-white/85 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
            <div className="flex items-center gap-3">
              <Link href="/" aria-label="Duelite home">
                <Logo />
              </Link>
              <span className="rounded-full bg-lilac px-2.5 py-1 text-[11.5px] font-medium text-brand">
                Super admin
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={schoolId}
                onChange={setSchoolId}
                className="hidden w-[210px] sm:block"
                options={[
                  { value: "all", label: "All institutions" },
                  ...demo.schools.map((s) => ({
                    value: s.id,
                    label: `${s.short} — ${s.name.split(",")[0]}`,
                  })),
                ]}
              />
              <Button onClick={() => setPanelOpen((v) => !v)}>
                <HugeiconsIcon icon={ZapIcon} size={15} strokeWidth={2} />
                <span className="ml-1.5">Demo</span>
              </Button>
            </div>
          </div>

          {panelOpen && <DemoPanel />}
        </header>

        <div className="mx-auto flex max-w-7xl gap-8 px-5 py-8 sm:px-8">
          <nav
            aria-label="Admin"
            className="hidden w-52 shrink-0 flex-col gap-0.5 lg:flex"
          >
            {NAV.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors ${
                    active
                      ? "bg-ink text-white"
                      : "text-ink-muted hover:bg-lilac hover:text-ink"
                  }`}
                >
                  <HugeiconsIcon icon={item.icon} size={17} strokeWidth={1.8} />
                  {item.label}
                  {badge[item.href] > 0 && (
                    <span
                      className={`ml-auto rounded-full px-1.5 py-0.5 text-[11px] ${
                        active ? "bg-white/20" : "bg-flame/15 text-flame"
                      }`}
                    >
                      {badge[item.href]}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <main className="min-w-0 flex-1">{children}</main>
        </div>

        {/* Same links, bottom bar, on narrow screens. */}
        <nav
          aria-label="Admin"
          className="sticky bottom-0 z-40 flex gap-1 overflow-x-auto border-t border-black/[0.06] bg-white/90 px-3 py-2 backdrop-blur-xl lg:hidden"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-muted hover:bg-lilac hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </SchoolContext>
  );
}

function DemoPanel() {
  const demo = useDemo();
  const [spaceId, setSpaceId] = useState(demo.spaces[0].id);

  return (
    <div className="border-t border-black/[0.06] bg-lilac/60">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-5 py-3 sm:px-8">
        <p className="text-[13px] text-ink-muted">
          Simulated data. Nothing is saved — reset puts the seeded world back.
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            value={spaceId}
            onChange={setSpaceId}
            className="w-[200px]"
            options={demo.spaces.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Button variant="primary" onClick={() => simulatePayments(spaceId)}>
            Trigger 6 payments
          </Button>
          <Button onClick={resetDemo}>
            <HugeiconsIcon icon={RefreshIcon} size={15} strokeWidth={2} />
            <span className="ml-1.5">Reset data</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
