import type { Metadata } from "next";

import AdminShell from "@/components/admin/shell";

export const metadata: Metadata = {
  title: "Duelite — Super admin",
  description:
    "Approve reps, oversee every space and transaction, and read the activity log behind them.",
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminShell>{children}</AdminShell>;
}
