"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { createDemoStore } from "@/lib/demo/store";

const DemoContext = createContext<ReturnType<typeof createDemoStore> | null>(null);
export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(createDemoStore);
  useEffect(() => {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Store displays a persistence warning. */ }
    store.start(storage);
    return () => store.stop();
  }, [store]);
  return <DemoContext.Provider value={store}>{children}</DemoContext.Provider>;
}
export function useDemo() {
  const store = useContext(DemoContext);
  if (!store) throw new Error("DemoProvider is required.");
  const { dispatch, reset, loadStage, connectFeed, disconnectFeed, setTrickle, burst, replayLast, simulateDrop, simulateError, requestWithdrawal, signWithdrawal, resendCode, setPayoutFailure } = store;
  return { ...useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot), dispatch, reset, loadStage, connectFeed, disconnectFeed, setTrickle, burst, replayLast, simulateDrop, simulateError, requestWithdrawal, signWithdrawal, resendCode, setPayoutFailure };
}
