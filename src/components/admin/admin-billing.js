"use client";

import { useState } from "react";

const plans = [
  { id: "pro", name: "Pro", amount: 999, details: "For independent organizers and growing teams." },
  { id: "business", name: "Business", amount: 2999, details: "For schools, hospitality, and multi-event teams." },
];

function formatDate(value) {
  if (!value) return "No active paid plan";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Subscription date unavailable";
  return `Paid through ${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(date)}`;
}

export default function AdminBilling({ organizations, paymentState }) {
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id || "");
  const [pendingPlan, setPendingPlan] = useState("");
  const [error, setError] = useState("");
  const selectedOrganization = organizations.find((item) => item.id === organizationId);

  async function startCheckout(planTier) {
    setPendingPlan(planTier);
    setError("");
    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "organization_subscription",
          organizationId,
          planTier,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not start subscription checkout.");
      window.location.assign(result.checkoutUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Could not start subscription checkout.");
      setPendingPlan("");
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Organization billing</h1>
        <p className="mt-3 text-slate-600">Choose a KURO plan and pay securely with PayMongo test checkout.</p>
      </div>

      {paymentState === "processing" && (
        <p className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950" role="status">
          Checkout returned. Your plan will update after PayMongo confirms payment; this can take a short time.
        </p>
      )}
      {!organizations.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          No organization is linked to this admin account yet. Ask a superadmin to approve or link your organization before subscribing.
        </div>
      ) : (
        <>
          {organizations.length > 1 && (
            <label className="grid max-w-xl gap-2 text-sm font-semibold text-slate-700">
              Organization
              <select className="rounded-md border border-slate-300 bg-white px-3 py-2.5" onChange={(event) => setOrganizationId(event.target.value)} value={organizationId}>
                {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
              </select>
            </label>
          )}

          {selectedOrganization && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <p className="font-semibold">{selectedOrganization.name}</p>
              <p className="mt-1">Current plan: <span className="font-semibold capitalize">{selectedOrganization.plan_tier}</span></p>
              <p className="mt-1">{formatDate(selectedOrganization.subscription_expires_at)}</p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((plan) => (
              <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" key={plan.id}>
                <h2 className="text-xl font-bold text-slate-950">{plan.name}</h2>
                <p className="mt-2 text-3xl font-black text-[#173d39]">
                  {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(plan.amount)}
                  <span className="ml-1 text-sm font-medium text-slate-500">/ month</span>
                </p>
                <p className="mt-3 min-h-10 text-sm leading-5 text-slate-600">{plan.details}</p>
                <button
                  className="mt-5 w-full rounded-md bg-[#173d39] px-4 py-3 text-sm font-bold text-white hover:bg-[#245c55] disabled:cursor-wait disabled:opacity-60"
                  disabled={!selectedOrganization || Boolean(pendingPlan)}
                  onClick={() => startCheckout(plan.id)}
                  type="button"
                >
                  {pendingPlan === plan.id ? "Opening secure checkout..." : `Choose ${plan.name}`}
                </button>
              </article>
            ))}
          </div>
          <p className="text-xs leading-5 text-slate-500">
            Testing only: each successful checkout adds one month. Renewals are manual; automatic recurring charges and plan-based feature enforcement are not active yet.
          </p>
        </>
      )}
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</p>}
    </section>
  );
}
