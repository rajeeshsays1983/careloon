import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-center">
      <div>
        <p className="text-sm text-slate-600">Redirecting to sign in...</p>
        <Link href="/login" className="mt-2 inline-block text-sm font-medium text-brand underline">
          Go to sign in
        </Link>
      </div>
    </main>
  );
}
