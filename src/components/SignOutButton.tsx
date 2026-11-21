"use client";

import { useRouter } from "next/navigation";
import { logout } from "@/lib/auth";

export function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-3.5 w-3.5 sm:h-4 sm:w-4"
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
  );
}
