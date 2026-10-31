"use client";

import Link from "next/link";

export default function AccountPlan({ activeEventCount, activeEventLimit }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">Your KURO account</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#173d39]">Account plan</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#61736e]">Every KURO account includes the same free tools for creating events, managing attendees, and selling tickets.</p>
      </div>

      <section aria-label="Current account plan" className="rounded-md border border-[#dce4dc] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#61736e]">Current plan</p>
            <p className="mt-1 text-2xl font-bold text-[#173d39]">Free</p>
            <p className="mt-1 text-sm text-[#61736e]">Included with every KURO account</p>
          </div>
          <div className="rounded-md bg-[#edf4eb] px-4 py-3 text-sm font-semibold text-[#245c55]">
            {activeEventCount} / {activeEventLimit ?? 3} active events
          </div>
        </div>
        <p className="mt-4 text-xs leading-5 text-[#7a8b84]">All account features are included at no charge. Up to three events can be actively published at a time; existing events are not removed when this limit is reached.</p>
      </section>

      <section className="rounded-md border border-[#dce4dc] bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold text-[#173d39]">Included at no charge</h2>
        <ul className="mt-3 grid gap-2 text-sm text-[#526864] sm:grid-cols-2">
          <li>Event creation and publishing</li>
          <li>Paid tickets and attendee registration</li>
          <li>Venue seating plans</li>
          <li>Registration reports and exports</li>
        </ul>
      </section>
      <Link className="inline-flex text-sm font-bold text-[#245c55] hover:text-[#d6533d]" href="/dashboard">Return to your dashboard</Link>
    </div>
  );
}
