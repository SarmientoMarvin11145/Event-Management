"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { supabase } from "@/lib/supabase";

export default function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSignOut() {
    setError("");
    startTransition(async () => {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError(signOutError.message);
        return;
      }

      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        disabled={isPending}
        onClick={handleSignOut}
        type="button"
      >
        {isPending ? "Signing out..." : "Sign out"}
      </button>
      {error && (
        <p aria-live="polite" className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
