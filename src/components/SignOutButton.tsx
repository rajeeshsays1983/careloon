"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, logout, type User } from "@/lib/auth";
import { getTeamMembers, getTeamMembersServerSnapshot, ROLE_LABELS, subscribeToTeamMembers } from "@/lib/team";

function subscribe() {
  return () => {};
}

export function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const user = useMemo<User | null>(() => (mounted ? getStoredUser() : null), [mounted]);
  const members = useSyncExternalStore(
    subscribeToTeamMembers,
    getTeamMembers,
    getTeamMembersServerSnapshot,
  );

  const roleLabel = useMemo(() => {
    if (!user) return "";
    const member = members.find(
      (candidate) =>
        candidate.approvalStatus === "approved" &&
        candidate.email.toLowerCase() === user.email.toLowerCase(),
    );
    return member ? ROLE_LABELS[member.role] : "";
  }, [members, user]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={handleLogout}
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm ${className}`}
      >
        Sign out
      </button>
    );
  }

  const initial = user.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">
          {initial}
        </span>
        <span className="max-w-[160px] truncate">{user.name}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-white shadow-lg"
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            {roleLabel ? <p className="mt-0.5 text-[11px] font-medium text-brand">{roleLabel}</p> : null}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-4 w-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 7.5a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 20.25a7.5 7.5 0 0 1 15 0"
              />
            </svg>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
