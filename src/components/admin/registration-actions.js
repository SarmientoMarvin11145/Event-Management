"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import RegistrationRefundAction from "@/components/admin/registration-refund-action";

export default function RegistrationActions({ registration, payment, canRefund, canCancel = true }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canCancelRegistration = canCancel && registration.status !== "cancelled";
  const canConfirm = registration.status === "pending";
  async function submit(action) {
    setError("");
    setMessage("");
    if (action === "cancel" && !reason.trim()) {
      setError("Enter a cancellation reason.");
      return;
    }
    if (action === "cancel" && !window.confirm("Cancel this registration? Payment will not be automatically refunded.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/registrations/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationId: registration.id,
          action,
          reason: reason.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update the registration.");
      setMessage(action === "confirm" ? "Registration confirmed and tickets issued." : "Registration cancelled.");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not update the registration.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Registration actions" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">Admin actions</h2>
      {canConfirm && (
        <div>
          <button
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            disabled={busy}
            onClick={() => submit("confirm")}
            type="button"
          >
            {busy ? "Verifying payment..." : "Verify payment & confirm"}
          </button>
          {Number(registration.unit_price) > 0 && payment?.status === "pending" && (
            <p className="mt-2 text-xs text-slate-600">PayMongo will be checked directly before confirming. Tickets are issued only after a successful payment is verified.</p>
          )}
          {Number(registration.unit_price) > 0 && payment?.status !== "pending" && payment?.status !== "paid" && (
            <p className="mt-2 text-xs text-amber-800">Payment is {payment?.status || "unverified"}. Confirmation will be rejected unless PayMongo verifies a successful payment.</p>
          )}
          {payment?.refund_status === "pending" && <p className="mt-2 text-xs text-amber-800">A refund is pending, so confirmation will be rejected.</p>}
        </div>
      )}
      {canCancelRegistration && (
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700" htmlFor={`cancel-reason-${registration.id}`}>Cancellation reason</label>
          <textarea
            className="max-w-xl rounded-md border border-slate-300 px-3 py-2 text-sm"
            id={`cancel-reason-${registration.id}`}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            required
            rows={3}
            value={reason}
          />
          <div>
            <button
              className="rounded-md border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              disabled={busy || !reason.trim()}
              onClick={() => submit("cancel")}
              type="button"
            >
              {busy ? "Processing..." : "Cancel registration"}
            </button>
          </div>
          {payment?.status === "paid" && <p className="text-xs text-slate-600">This only cancels the registration and invalidates tickets. It does not claim or issue a refund.</p>}
        </div>
      )}
      {canRefund && (
        <div className="border-t border-slate-100 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Refund management</h3>
          <RegistrationRefundAction registrationId={registration.id} status={payment?.refund_status || "none"} />
        </div>
      )}
      {message && <p className="text-sm text-emerald-700" role="status">{message}</p>}
      {error && <p className="text-sm text-rose-700" role="alert">{error}</p>}
    </section>
  );
}
