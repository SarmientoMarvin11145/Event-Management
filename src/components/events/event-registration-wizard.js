"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const inputClass = "w-full rounded-md border border-[#cbd8d1] bg-white px-3 py-2.5 text-sm text-[#173d39] outline-none focus:border-[#245c55] focus:ring-2 focus:ring-[#245c55]/15";
const steps = ["Personal details", "Choose tickets", "Payment"];

function money(value, currency) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: currency || "PHP" }).format(Number(value || 0));
}

export default function EventRegistrationWizard({ event, plans, profile, email, seatMap, preselectedSeat, paymentState, paymentReference }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [personal, setPersonal] = useState({
    fullName: profile?.full_name || "",
    email: profile?.email || email || "",
    phone: profile?.phone || "",
    address: profile?.street_address || "",
  });
  const [planId, setPlanId] = useState(plans[0]?.id || "");
  const [quantity, setQuantity] = useState("1");
  const [selectedSeatIds, setSelectedSeatIds] = useState(preselectedSeat ? [preselectedSeat] : []);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [cancelStatus, setCancelStatus] = useState(paymentState === "cancelled" ? "checking" : "");
  const plan = plans.find((item) => item.id === planId);
  const amount = Number(plan?.price || 0) * Number(quantity || 0);

  useEffect(() => {
    if (paymentState !== "cancelled" || !paymentReference) return;
    let active = true;
    async function verifyCancelledCheckout() {
      try {
        const response = await fetch("/api/payments/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ referenceNumber: paymentReference }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not verify checkout status.");
        if (active) setCancelStatus(result.status);
      } catch {
        if (active) setCancelStatus("error");
      }
    }
    verifyCancelledCheckout();
    return () => { active = false; };
  }, [paymentReference, paymentState]);

  function updatePersonal(event) {
    setPersonal((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function continueToTickets(event) {
    event.preventDefault();
    setError("");
    if (!personal.fullName.trim() || personal.fullName.length > 120) {
      setError("Enter your full name (up to 120 characters).");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal.email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (personal.phone.trim().length < 7 || personal.phone.trim().length > 40) {
      setError("Enter a valid contact number.");
      return;
    }
    setStep(1);
  }

  function continueToPayment(event) {
    event.preventDefault();
    setError("");
    if (!plan) {
      setError("Choose an available ticket plan.");
      return;
    }
    const count = Number(quantity);
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      setError("Choose between 1 and 20 tickets.");
      return;
    }
    if (plan.available_quantity != null && count > Number(plan.available_quantity)) {
      setError("There are not enough tickets remaining for that quantity.");
      return;
    }
    if (plan.requires_address && !personal.address.trim()) {
      setError("An address is required for this ticket plan.");
      return;
    }
    if (seatMap && selectedSeatIds.length !== count) {
      setError(`Choose exactly ${count} available seat${count === 1 ? "" : "s"}.`);
      return;
    }
    setStep(2);
  }

  async function submitRegistration() {
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/events/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          planId,
          quantity: Number(quantity),
          fullName: personal.fullName,
          email: personal.email,
          phone: personal.phone,
          address: personal.address,
          seatIds: selectedSeatIds,
        }),
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not complete registration.");
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      router.push(`/registration/success?registrationId=${encodeURIComponent(result.registrationId)}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not complete registration.");
      setPending(false);
    }
  }

  return (
    <main className="min-h-[75vh] bg-[#fbfcf8] px-4 py-10 text-[#173d39] sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link className="text-sm font-semibold text-[#526864] underline" href={`/e/${event.slug}`}>Back to event</Link>
        <div className="mt-6 rounded-xl border border-[#dce4dc] bg-white p-5 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#d6533d]">Event registration</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{event.title}</h1>
          <p className="mt-2 text-sm text-[#61736e]">{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.start_date))} · {[event.venue_name, event.city].filter(Boolean).join(", ") || "Venue to be announced"}</p>
          {event.short_description && <p className="mt-3 text-sm leading-6 text-[#526864]">{event.short_description}</p>}
          {paymentState === "cancelled" && (
            <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900" role={cancelStatus === "error" ? "alert" : "status"}>
              {cancelStatus === "checking" ? "Verifying the checkout status..." : cancelStatus === "cancelled" ? "Checkout was cancelled and its reservation was released. No ticket was confirmed." : cancelStatus === "error" ? "Checkout status could not be verified. No ticket is confirmed; check My Tickets before trying again." : "Payment may still be processing. No ticket is confirmed unless the verified payment status appears in My Tickets."}
            </p>
          )}

          <ol aria-label="Registration progress" className="mt-8 grid grid-cols-3 gap-2">
            {steps.map((label, index) => (
              <li aria-current={step === index ? "step" : undefined} className={`border-t-4 pt-2 text-xs font-semibold sm:text-sm ${index <= step ? "border-[#245c55] text-[#173d39]" : "border-[#dce4dc] text-[#83918a]"}`} key={label}>
                <span className="mr-1">{index + 1}.</span>{label}
              </li>
            ))}
          </ol>

          {step === 0 && (
            <form className="mt-8 grid gap-4 sm:grid-cols-2" onSubmit={continueToTickets}>
              <label className="grid gap-1.5 text-sm font-semibold">Full name
                <input autoComplete="name" className={inputClass} maxLength={120} name="fullName" onChange={updatePersonal} required value={personal.fullName} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">Email
                <input autoComplete="email" className={inputClass} maxLength={254} name="email" onChange={updatePersonal} required type="email" value={personal.email} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">Contact number
                <input autoComplete="tel" className={inputClass} maxLength={40} name="phone" onChange={updatePersonal} required type="tel" value={personal.phone} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2">Address
                <textarea autoComplete="street-address" className={inputClass} maxLength={500} name="address" onChange={updatePersonal} rows={2} value={personal.address} />
                <span className="text-xs font-normal text-[#61736e]">Only required when the selected ticket plan asks for it.</span>
              </label>
              <button className="w-fit rounded-md bg-[#173d39] px-5 py-3 text-sm font-bold text-white" type="submit">Continue to tickets</button>
            </form>
          )}

          {step === 1 && (
            <form className="mt-8 space-y-5" onSubmit={continueToPayment}>
              {plans.length ? plans.map((item) => (
                <label className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${planId === item.id ? "border-[#245c55] bg-[#f4f6f1]" : "border-[#dce4dc]"}`} key={item.id}>
                  <input checked={planId === item.id} name="ticket_plan" onChange={() => setPlanId(item.id)} type="radio" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap justify-between gap-2 font-bold">
                      <span>{item.name}</span><span>{money(item.price, event.currency)}</span>
                    </span>
                    {item.description && <span className="mt-1 block text-sm font-normal text-[#61736e]">{item.description}</span>}
                    <span className="mt-1 block text-xs font-normal text-[#61736e]">
                      {item.available_quantity == null ? "Unlimited availability" : `${item.available_quantity} available`}
                    </span>
                  </span>
                </label>
              )) : <p className="rounded-md bg-amber-50 p-4 text-sm text-amber-900">Ticket plans are not available for this event. Please contact the organizer.</p>}
              <label className="grid max-w-xs gap-1.5 text-sm font-semibold">Quantity
                <input className={inputClass} max={Math.min(20, plan?.available_quantity == null ? 20 : Number(plan.available_quantity))} min="1" onChange={(event) => {
                  const nextQuantity = event.target.value;
                  setQuantity(nextQuantity);
                  setSelectedSeatIds((current) => current.slice(0, Math.max(0, Number(nextQuantity) || 0)));
                }} type="number" value={quantity} />
              </label>
              {seatMap && (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-bold">Choose {quantity} seat{Number(quantity) === 1 ? "" : "s"}</legend>
                  <p className="text-xs text-[#61736e]">{seatMap.venueName} · Select one available seat for each ticket.</p>
                  <div className="overflow-x-auto rounded-md bg-[#f4f6f1] p-3">
                    {(seatMap.rows || []).map((row) => (
                      <div className="mb-2 flex items-center gap-2 last:mb-0" key={row.label}>
                        <span className="w-5 text-center text-xs font-bold">{row.label}</span>
                        <div className="flex gap-1">
                          {(row.seats || []).map((seat) => {
                            const unavailable = !seat.enabled || seatMap.reservedSeatIds?.includes(seat.id);
                            const selected = selectedSeatIds.includes(seat.id);
                            return (
                              <button
                                aria-label={`${seat.id}: ${unavailable ? "unavailable" : selected ? "selected" : "available"}`}
                                aria-pressed={selected}
                                className={`size-8 rounded border text-[10px] font-bold ${selected ? "border-[#d6533d] bg-[#ed6148] text-white" : unavailable ? "border-slate-200 bg-slate-200 text-slate-400" : "border-[#245c55] bg-white text-[#173d39]"}`}
                                disabled={unavailable}
                                key={seat.id}
                                onClick={() => setSelectedSeatIds((current) => selected
                                  ? current.filter((id) => id !== seat.id)
                                  : current.length < Number(quantity) ? [...current, seat.id] : current)}
                                type="button"
                              >
                                {seat.id.split("-").at(-1)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-[#61736e]">{selectedSeatIds.length} of {quantity} seat{Number(quantity) === 1 ? "" : "s"} selected</p>
                </fieldset>
              )}
              <p className="font-bold">Total: {money(amount, event.currency)}</p>
              <div className="flex flex-wrap gap-3">
                <button className="rounded-md border border-[#cbd8d1] px-5 py-3 text-sm font-bold" onClick={() => { setError(""); setStep(0); }} type="button">Back</button>
                <button className="rounded-md bg-[#173d39] px-5 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={!plans.length || plan?.available_quantity === 0} type="submit">Continue to payment</button>
              </div>
            </form>
          )}

          {step === 2 && (
            <section className="mt-8 space-y-5">
              <h2 className="text-lg font-bold">Order summary</h2>
              <dl className="grid gap-3 rounded-lg bg-[#f4f6f1] p-4 text-sm sm:grid-cols-2">
                <div><dt className="text-[#61736e]">Attendee</dt><dd className="font-semibold">{personal.fullName}</dd></div>
                <div><dt className="text-[#61736e]">Email</dt><dd className="font-semibold">{personal.email}</dd></div>
                <div><dt className="text-[#61736e]">Ticket plan</dt><dd className="font-semibold">{plan?.name}</dd></div>
                <div><dt className="text-[#61736e]">Quantity</dt><dd className="font-semibold">{quantity}</dd></div>
                {selectedSeatIds.length > 0 && <div><dt className="text-[#61736e]">Seat{selectedSeatIds.length === 1 ? "" : "s"}</dt><dd className="font-semibold">{selectedSeatIds.join(", ")}</dd></div>}
                <div className="sm:col-span-2"><dt className="text-[#61736e]">Total due</dt><dd className="text-lg font-bold">{money(amount, event.currency)}</dd></div>
              </dl>
              {amount > 0 && <p className="text-xs leading-5 text-[#61736e]">Payment is handled by PayMongo. Registration and tickets are confirmed only after the signed payment webhook is verified. Available methods include card, GCash, Maya, and QR Ph where enabled.</p>}
              <div className="flex flex-wrap gap-3">
                <button className="rounded-md border border-[#cbd8d1] px-5 py-3 text-sm font-bold disabled:opacity-50" disabled={pending} onClick={() => { setError(""); setStep(1); }} type="button">Back</button>
                <button className="rounded-md bg-[#ed6148] px-5 py-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60" disabled={pending || !plan} onClick={submitRegistration} type="button">
                  {pending ? "Processing..." : amount > 0 ? "Continue to secure payment" : "Complete free registration"}
                </button>
              </div>
            </section>
          )}
          {error && <p className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
        </div>
      </div>
    </main>
  );
}
