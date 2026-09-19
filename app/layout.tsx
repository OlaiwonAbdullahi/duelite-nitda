import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Duelite — Pay your dues. Simply.",
  description:
    "Nigerian students pay departmental dues, handouts and levies in one transfer. Course reps collect, track and withdraw with a full paper trail.",
  openGraph: {
    title: "Duelite — Pay your dues. Simply.",
    description:
      "One transfer for every due you owe. A live dashboard for your rep. Two signatures on every withdrawal, and books the whole class can check.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white">{children}</body>
    </html>
  );
}
