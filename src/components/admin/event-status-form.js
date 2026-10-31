"use client";

import { useActionState, useState } from "react";
import { changeAdminEventStatus } from "@/app/(admin)/admin/actions";

const statuses = ["draft", "published", "cancelled"];

export default function EventStatusForm({ eventId, organizationId, status, label = "Update" }) {
  const [state, formAction] = useActionState(changeAdminEventStatus, { error: "" });

  return (
    <EventStatusFields
      key={state.attempt || "initial"}
      error={state.error}
      eventId={eventId}
      formAction={formAction}
      initialStatus={state.status || status}
      label={label}
      organizationId={organizationId}
    />
  );
}

function EventStatusFields({ error, eventId, formAction, initialStatus, label, organizationId }) {
  const [status, setStatus] = useState(initialStatus);

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input name="event_id" type="hidden" value={eventId} />
        <input name="organization_id" type="hidden" value={organizationId} />
        <label className="sr-only" htmlFor={`status-${eventId}`}>Change event status</label>
        <select
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
          id={`status-${eventId}`}
          name="status"
          onChange={(event) => setStatus(event.target.value)}
          value={status}
        >
          {statuses.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <button className="text-xs font-semibold text-slate-700 underline" type="submit">{label}</button>
      </form>
      {error && (
        <div className="mt-2 max-w-sm rounded-md border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800" role="alert">
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
