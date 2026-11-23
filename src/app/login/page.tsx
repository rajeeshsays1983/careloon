"use client";

import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  DEMO_CREDENTIALS,
  getStoredUser,
  login,
} from "@/lib/auth";
import { ensureDataLoaded } from "@/lib/client-store";
import {
  getTeamMembers,
  getTeamMembersServerSnapshot,
  subscribeToTeamMembers,
} from "@/lib/team";

export default function LoginPage() {
  const router = useRouter();
  const members = useSyncExternalStore(
    subscribeToTeamMembers,
    getTeamMembers,
    getTeamMembersServerSnapshot,
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loginNames = members
    .filter((member) => member.approvalStatus === "approved" && member.role !== "admin")
    .map((member) => member.username || member.email.split("@")[0]);

  useEffect(() => {
    void ensureDataLoaded();
  }, []);

  useEffect(() => {
    if (getStoredUser()) {
      router.replace("/dashboard");
    }
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await ensureDataLoaded();
      login(username, password, getTeamMembers());
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-teal-50 via-slate-50 to-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-xl font-bold text-white shadow-lg shadow-teal-900/10">
            C
          </div>
          <p className="text-sm font-medium tracking-wide text-brand">CARELOON</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Sign in as Admin or as an approved care team member.
          </p>
        </div>

        <section className="rounded-3xl border border-border bg-surface p-6 shadow-xl shadow-slate-900/5">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-slate-700">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-base text-slate-900 outline-none ring-brand/20 transition focus:border-brand focus:ring-4"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-base text-slate-900 outline-none ring-brand/20 transition focus:border-brand focus:ring-4"
                placeholder="Enter your password"
              />
            </div>

            {error ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-muted">
            <p>
              <span className="font-medium text-slate-700">Admin:</span>{" "}
              {DEMO_CREDENTIALS.adminUsername} / {DEMO_CREDENTIALS.adminPassword}
            </p>
            <p>
              <span className="font-medium text-slate-700">Staff:</span> use your email or name from
              Team onboarding / {DEMO_CREDENTIALS.staffPassword}
            </p>
            {loginNames.length > 0 ? (
              <p className="mt-1">
                <span className="font-medium text-slate-700">Available usernames:</span>{" "}
                {loginNames.join(", ")}
              </p>
            ) : null}
            <p className="mt-1">Authentication is stored locally on this device.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
