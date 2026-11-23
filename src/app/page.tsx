"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/auth";

function subscribe() {
  return () => {};
}

export default function Home() {
  const router = useRouter();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  useEffect(() => {
    if (!mounted) return;
    router.replace(getStoredUser() ? "/dashboard" : "/login");
  }, [mounted, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-center">
      <p className="text-sm text-slate-600">
        {mounted ? "Opening your dashboard..." : "Loading..."}
      </p>
    </main>
  );
}
