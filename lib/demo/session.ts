"use client";

/* Dummy admin session.
 *
 * There is no auth in this build — any credentials are accepted. The point is
 * that the console has a door, and the demo panel's audience can see who is
 * signed in. Kept in sessionStorage so a refresh mid-demo does not throw the
 * presenter back to the login screen; it dies with the tab. */

import { useSyncExternalStore } from "react";

const KEY = "duelite.admin.session";

export type Session = { name: string; email: string } | null;

export const DEMO_ADMIN = {
  name: "Ope Adeniyi",
  email: "ope@duelite.demo",
  password: "demo-admin",
};

let snapshot: Session = null;
let restored = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useSession(): Session {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      // First subscriber pulls whatever the tab already had. Doing it here
      // rather than in an effect keeps it out of the render path.
      if (!restored) {
        restored = true;
        const raw = sessionStorage.getItem(KEY);
        if (raw) {
          snapshot = JSON.parse(raw) as Session;
          emit();
        }
      }
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => null,
  );
}

export function signIn(email: string, name = DEMO_ADMIN.name) {
  snapshot = { name, email };
  sessionStorage.setItem(KEY, JSON.stringify(snapshot));
  emit();
}

export function signOut() {
  snapshot = null;
  sessionStorage.removeItem(KEY);
  emit();
}
