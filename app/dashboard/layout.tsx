import type { Metadata } from "next";
import { DemoProvider } from "@/components/dashboard/demo-provider";
import "./dashboard.css";

export const metadata: Metadata = { title: "Rep dashboard · Duelite" };
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DemoProvider>{children}</DemoProvider>;
}
