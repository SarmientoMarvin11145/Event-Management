"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegistrationRefundAction({ registrationId, status }) {
  const router = useRouter();
  const [refundStatus, setRefundStatus] = useState(status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");

  async function submit(action) {
    setError("");
    if (action === "issue" && !reason.trim()) {
      setError("Enter a reason before submitting the refund.");
      return;
    }
    if (action === "issue" && !window.confirm("Issue a full refund for this paid registration?")) return;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/registrations/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, action, reason }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not process the refund.");
      setRefundStatus(result.status);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not process the refund.");
    } finally {
      setLoading(false);
    }
  }

  if (refundStatus === "succeeded") {
    return <span className="text-xs font-semibold text-emerald-700">Refund complete</span>;
  }
  if (refundStatus === "pending") {
    return (
      <div className="grid gap-1">
        <button className="rounded border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-900 disabled:opacity-50" disabled={loading} onClick={() => submit("check")} type="button">
          {loading ? "Checking..." : "Check refund"}
        </button>
        <span className="text-xs text-amber-800">Refund processing</span>
        {error && <span className="text-xs text-rose-700" role="alert">{error}</span>}
      </div>
    );
  }
  return (
    <div className="grid gap-1">
      <label className="sr-only" htmlFor={`refund-reason-${registrationId}`}>Refund reason</label>
      <textarea
        className="min-w-52 rounded border border-slate-300 px-2 py-1 text-xs"
        id={`refund-reason-${registrationId}`}
        maxLength={500}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Required refund reason"
        value={reason}
      />
      <button className="rounded border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700 disabled:opacity-50" disabled={loading} onClick={() => submit("issue")} type="button">
        {loading ? "Submitting..." : "Process refund"}
      </button>
      {refundStatus === "failed" && <span className="text-xs text-rose-700">Previous refund failed</span>}
      {error && <span className="text-xs text-rose-700" role="alert">{error}</span>}
    </div>
  );
}
