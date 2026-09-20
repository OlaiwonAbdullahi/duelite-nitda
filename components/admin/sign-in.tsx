"use client";

import { useState } from "react";
import Link from "next/link";

import { Button, Card, Field, TextInput } from "@/components/admin/ui";
import { Logo } from "@/components/site-header";
import { DEMO_ADMIN, signIn } from "@/lib/demo/session";

/* Dummy sign-in. Any email and password get in — the gate exists so the
 * console has a front door on stage, not because anything is protected. */
export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (!email.trim() || !password.trim()) {
      setError("Both fields, please.");
      return;
    }
    signIn(email.trim());
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#fafafa]">
      <header className="border-b border-black/[0.06] bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-5 sm:px-8">
          <Link href="/" aria-label="Duelite home">
            <Logo />
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <Card className="w-full max-w-[420px] p-7">
          <h1 className="text-[22px] font-semibold tracking-tight">
            Super admin
          </h1>
          <p className="mt-1.5 text-[14px] text-ink-muted">
            Approvals, disputes and the activity log live behind here.
          </p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Field label="Email">
              <TextInput
                value={email}
                onChange={(v) => {
                  setEmail(v);
                  setError("");
                }}
                placeholder="you@duelite.demo"
              />
            </Field>

            <Field label="Password">
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                placeholder="••••••••"
                className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-2 text-[14px] outline-none placeholder:text-ink-muted/70 focus:border-brand"
              />
            </Field>

            {error && <p className="text-[13px] text-red-600">{error}</p>}

            <Button type="submit" variant="primary" className="w-full">
              Sign in
            </Button>
          </form>

          <div className="mt-5 rounded-xl bg-lilac/70 p-4">
            <p className="text-[13px] text-ink-muted">
              Nothing is checked — this is a demo build with no auth behind it.
            </p>
            <Button
              className="mt-3 w-full bg-white"
              onClick={() => {
                setEmail(DEMO_ADMIN.email);
                setPassword(DEMO_ADMIN.password);
                setError("");
              }}
            >
              Fill in the demo admin
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}
