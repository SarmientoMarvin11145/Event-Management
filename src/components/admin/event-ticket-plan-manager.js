"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteEventTicketPlan, saveEventTicketPlan } from "@/app/(admin)/admin/actions";

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#245c55] focus:ring-2 focus:ring-[#245c55]/15";

function TicketPlanForm({ eventId, organizationId, plan, slug }) {
  const [state, action] = useActionState(saveEventTicketPlan, { error: "" });
  const router = useRouter();
  const values = state.values || {
    name: plan?.name || "",
    description: plan?.description || "",
    price: String(plan?.price ?? "0"),
    capacity: plan?.capacity == null ? "" : String(plan.capacity),
    requires_address: Boolean(plan?.requires_address),
  };
  const [fields, setFields] = useState(values);

  useEffect(() => {
    if (state.saved) router.refresh();
  }, [router, state.attempt, state.saved]);

  return (
    <TicketPlanFields
      action={action}
      eventId={eventId}
      key={state.attempt || "initial"}
      organizationId={organizationId}
      plan={plan}
      slug={slug}
      state={state}
      values={values}
    />
  );
}

function TicketPlanFields({ action, eventId, organizationId, plan, slug, state, values }) {
  const [fields, setFields] = useState(values);

  function update(event) {
    const { name, type, checked, value } = event.target;
    setFields((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  return (
    <form action={action} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <input name="event_id" type="hidden" value={eventId} />
      <input name="organization_id" type="hidden" value={organizationId} />
      <input name="plan_id" type="hidden" value={plan?.id || ""} />
      <input name="slug" type="hidden" value={slug} />
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        Plan name
        <input className={inputClass} maxLength={120} name="name" onChange={update} required value={fields.name} />
      </label>
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        Price (PHP)
        <input className={inputClass} min="0" name="price" onChange={update} required step="0.01" type="number" value={fields.price} />
      </label>
      <label className="grid gap-1 text-sm font-semibold text-slate-700 sm:col-span-2">
        Description
        <textarea className={inputClass} maxLength={1000} name="description" onChange={update} rows={2} value={fields.description} />
      </label>
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        Available quantity
        <input className={inputClass} min="1" name="capacity" onChange={update} placeholder="Unlimited" type="number" value={fields.capacity} />
      </label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-slate-700">
        <input checked={fields.requires_address} name="requires_address" onChange={update} type="checkbox" />
        Require attendee address
      </label>
      {state.error && <p className="text-sm text-rose-700 sm:col-span-2" role="alert">{state.error}</p>}
      {state.saved && <p className="text-sm text-emerald-700 sm:col-span-2" role="status">Ticket plan saved.</p>}
      <button className="w-fit rounded-md bg-[#173d39] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#245c55]" type="submit">
        {plan ? "Save plan" : "Add ticket plan"}
      </button>
    </form>
  );
}

function DeleteTicketPlan({ eventId, organizationId, planId }) {
  const [state, action] = useActionState(deleteEventTicketPlan, { error: "" });
  const router = useRouter();
  useEffect(() => {
    if (state.deleted) router.refresh();
  }, [router, state.attempt, state.deleted]);

  return (
    <form action={action} className="mt-3">
      <input name="event_id" type="hidden" value={eventId} />
      <input name="organization_id" type="hidden" value={organizationId} />
      <input name="plan_id" type="hidden" value={planId} />
      {state.error && <p className="mb-2 text-sm text-rose-700" role="alert">{state.error}</p>}
      <button className="text-sm font-semibold text-rose-700 underline" type="submit">Delete plan</button>
    </form>
  );
}

export default function EventTicketPlanManager({ event, organizationId, plans }) {
  return (
    <section className="mb-6 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
      <div>
        <h2 className="font-semibold text-slate-900">Ticket and seat plans</h2>
        <p className="mt-1 text-sm text-slate-600">Set plan prices and ticket availability. Sold or pending tickets count toward each plan&apos;s capacity.</p>
      </div>
      {plans.map((plan) => (
        <div className="space-y-2" key={plan.id}>
          <TicketPlanForm eventId={event.id} organizationId={organizationId} plan={plan} slug={event.slug} />
          <p className="px-1 text-xs text-slate-500">
            {Number(plan.sold_quantity || 0)} reserved
            {plan.available_quantity == null ? " · Unlimited remaining" : ` · ${plan.available_quantity} remaining`}
          </p>
          <DeleteTicketPlan eventId={event.id} organizationId={organizationId} planId={plan.id} />
        </div>
      ))}
      <TicketPlanForm eventId={event.id} organizationId={organizationId} plan={null} slug={event.slug} />
    </section>
  );
}
