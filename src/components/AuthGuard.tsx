"use client";

import { startTransition, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/auth";
import {
  ensureDataLoaded,
  getDataErrorSnapshot,
  getDataStatusSnapshot,
  subscribeData,
} from "@/lib/client-store";

function subscribe() {
  return () => {};
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const user = mounted ? getStoredUser() : null;
  const dataStatus = useSyncExternalStore(
    subscribeData,
    getDataStatusSnapshot,
    () => "loading" as const,
  );
  const dataError = useSyncExternalStore(subscribeData, getDataErrorSnapshot, () => "");

  useEffect(() => {
    if (mounted) {
      startTransition(() => {
        void ensureDataLoaded();
      });
    }
  }, [mounted]);

  useEffect(() => {
    if (mounted && !user) {
      router.replace("/login");
    }
  }, [mounted, user, router]);

  if (!mounted || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        <p className="text-sm">Loading...</p>
      </div>
    );
  }

  if (dataStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        <p className="text-sm">Loading care data…</p>
      </div>
    );
  }

  if (dataStatus === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-600">
        <div className="max-w-sm rounded-2xl border border-border bg-white p-5 text-center shadow-sm">
          <p className="text-sm text-danger">{dataError}</p>
          <button
            type="button"
            onClick={() => startTransition(() => void ensureDataLoaded())}
            className="mt-3 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
