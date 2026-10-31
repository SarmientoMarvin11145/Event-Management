"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function GuestTicketDetails() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!/^[0-9a-f]{64}$/.test(token)) {
      setError("This ticket link is invalid or incomplete.");
      setLoading(false);
      return () => { active = false; };
    }
    fetch(`/api/guest-registration/ticket?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load this ticket.");
        if (active) setTicket(result.ticket);
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load this ticket.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  if (loading) return <p className="mt-6 text-sm text-[#61736e]" role="status">Loading your ticket...</p>;
  if (error) return <p className="mt-6 rounded-md bg-rose-50 p-4 text-sm text-rose-800" role="alert">{error}</p>;
  if (!ticket) return null;

  const eventDate = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(ticket.start_date));
  return (
    <article className="mt-6 rounded-lg border-2 border-dashed border-[#b7c8bc] bg-[#fbfcf8] p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#61736e]">Attendee</p>
          <p className="mt-1 text-lg font-bold">{ticket.attendee_name}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${ticket.registration_status === "confirmed" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
          {ticket.registration_status === "confirmed" ? "Confirmed" : "Awaiting organizer approval"}
        </span>
      </div>
      <h2 className="mt-6 text-2xl font-bold">{ticket.event_title}</h2>
      <p className="mt-2 text-sm text-[#526864]">{eventDate}</p>
      <p className="mt-1 text-sm text-[#526864]">{[ticket.venue_name, ticket.city].filter(Boolean).join(", ") || "Venue to be announced"}</p>
      <div className="mt-6 border-t border-[#dce4dc] pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#61736e]">Registration code</p>
        <p className="mt-1 font-mono text-xl font-bold tracking-wider">{ticket.registration_code}</p>
        <p className="mt-1 text-xs text-[#61736e]">Organizer: {ticket.organization_name}</p>
      </div>
      {ticket.registration_form?.length > 0 && Object.keys(ticket.registration_answers || {}).length > 0 && (
        <dl className="mt-6 grid gap-3 border-t border-[#dce4dc] pt-4">
          {ticket.registration_form.map((field) => {
            const answer = ticket.registration_answers[field.id];
            if (answer === undefined || answer === null || answer === "") return null;
            return (
              <div key={field.id}>
                <dt className="text-xs font-bold text-[#61736e]">{field.label}</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-[#173d39]">{Array.isArray(answer) ? answer.join(", ") : String(answer)}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </article>
  );
}
