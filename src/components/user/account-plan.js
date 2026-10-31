"use client";

import Link from "next/link";
import { useState } from "react";

const plans = [
  {
    id: "free",
    name: "Free",
    price: null,
    details: "Create up to 3 active events with standard event and attendee tools.",
  },
  {
    id: "pro",
    name: "Pro",
    price: 999,
    details: "Create up to 10 active events, accept paid tickets, and use seating plans.",
  },
  {
    id: "business",
    name: "Business",
    price: 2999,
    details: "Unlimited active events, paid tickets, seating plans, and advanced reports.",
  },
];

function paidThrough(value) {
  if (!value) return "No paid plan is active";
  return `Paid through ${new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(value))}`;
}

export default function AccountPlan({ activeEventCount, activeEventLimit, expiresAt, paymentState, tier }) {
  const [pendingPlan, setPendingPlan] = useState("");
  const [error, setError] = useState("");
  const currentPlan = plans.find((plan) => plan.id === tier) || plans[0];

  async function startCheckout(planTier) {
    setPendingPlan(planTier);
    setError("");
    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "user_subscription", planTier }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not start plan checkout.");
      window.location.assign(result.checkoutUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Could not start plan checkout.");
      setPendingPlan("");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">Your KURO account</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#173d39]">Account plan</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#61736e]">Your plan follows your individual KURO account and applies across organizations where you manage events.</p>
      </div>

      {paymentState === "processing" && (
        <p className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950" role="status">
          Checkout returned. Your plan will update after PayMongo confirms the payment.
        </p>
      )}

      <section aria-label="Current account plan" className="rounded-md border border-[#dce4dc] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#61736e]">Current plan</p>
            <p className="mt-1 text-2xl font-bold capitalize text-[#173d39]">{currentPlan.name}</p>
            <p className="mt-1 text-sm text-[#61736e]">{paidThrough(expiresAt)}</p>
          </div>
          <div className="rounded-md bg-[#edf4eb] px-4 py-3 text-sm font-semibold text-[#245c55]">
            {activeEventCount} / {activeEventLimit === null ? "Unlimited" : activeEventLimit} active events
          </div>
        </div>
        <p className="mt-4 text-xs leading-5 text-[#7a8b84]">Active events are published events that have not ended. Existing events remain published if a paid plan expires, but new publications must fit the Free limit.</p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <article className="rounded-md border border-[#dce4dc] bg-white p-5" key={plan.id}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl font-bold text-[#173d39]">{plan.name}</h2>
              {plan.id === tier && <span className="rounded-full bg-[#edf4eb] px-2.5 py-1 text-xs font-bold text-[#245c55]">Current</span>}
            </div>
            <p className="mt-3 text-3xl font-black text-[#173d39]">
              {plan.price === null
                ? "Free"
                : <>{new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(plan.price)}<span className="ml-1 text-sm font-medium text-[#61736e]">/ month</span></>}
            </p>
            <p className="mt-3 min-h-12 text-sm leading-6 text-[#61736e]">{plan.details}</p>
            {plan.price !== null ? (
              <button
                className="mt-5 w-full rounded-md bg-[#173d39] px-4 py-3 text-sm font-bold text-white hover:bg-[#245c55] disabled:cursor-wait disabled:opacity-60"
                disabled={Boolean(pendingPlan)}
                onClick={() => startCheckout(plan.id)}
                type="button"
              >
                {pendingPlan === plan.id ? "Opening secure checkout..." : plan.id === tier ? `Renew ${plan.name}` : `Choose ${plan.name}`}
              </button>
            ) : (
              <p className="mt-5 text-sm font-semibold text-[#526864]">Available to every account</p>
            )}
          </article>
        ))}
      </div>

      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</p>}
      <p className="text-xs leading-5 text-[#7a8b84]">Paid subscriptions use PayMongo test checkout. Renewals are manual; an account plan changes only after its payment is verified.</p>
      <Link className="inline-flex text-sm font-bold text-[#245c55] hover:text-[#d6533d]" href="/dashboard">Return to your dashboard</Link>
    </div>
  );
}
