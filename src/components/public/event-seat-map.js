"use client";

import Link from "next/link";
import { isEventRegistrationAvailable } from "@/lib/event-registration";

export default function EventSeatMap({ event, seatMap, status }) {
  if (status === "loading") {
    return <p className="mt-4 text-sm text-[#61736e]" role="status">Loading available seats...</p>;
  }

  if (status === "unavailable" || !seatMap) {
    return <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">Seat availability is temporarily unavailable. Please try again later.</p>;
  }

  const registrationAvailable = isEventRegistrationAvailable(event);
  const reservedSeats = new Set(seatMap.reservedSeatIds || []);

  return (
    <section aria-label="Choose a seat" className="mt-5 border-t border-[#dce4dc] pt-5">
      <p className="text-sm font-bold text-[#173d39]">Choose your seat</p>
      <p className="mt-1 text-xs text-[#61736e]">{seatMap.venueName} · Unavailable seats are marked.</p>
      <div className="mt-4 overflow-x-auto rounded-md bg-[#f4f6f1] p-3">
        <div className="mb-4 rounded-t-[50%] border-t-4 border-[#245c55] py-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-[#61736e]">Stage / front</div>
        <div className="mx-auto grid w-max gap-2">
          {(seatMap.rows || []).map((row) => (
            <div className="flex items-center gap-2" key={row.label}>
              <span className="w-5 text-center text-[10px] font-bold text-[#61736e]">{row.label}</span>
              <div className="flex gap-1">
                {(row.seats || []).map((seat) => {
                  const reserved = reservedSeats.has(seat.id);
                  const blocked = !seat.enabled;
                  const unavailable = reserved || blocked;
                  return (
                    unavailable || !registrationAvailable ? (
                      <span
                        aria-label={`Seat ${seat.id}: ${reserved ? "reserved" : blocked ? "unavailable" : "registration unavailable"}`}
                        className="flex size-8 items-center justify-center rounded-t-md border border-slate-300 bg-slate-200 text-[10px] font-bold text-slate-400"
                        key={seat.id}
                        title={`${seat.id}: ${reserved ? "Reserved" : blocked ? "Unavailable" : "Registration unavailable"}`}
                      >
                        {seat.id.split("-").at(-1)}
                      </span>
                    ) : (
                      <Link
                        aria-label={`Seat ${seat.id}: available, select this seat`}
                        className="flex size-8 items-center justify-center rounded-t-md border border-[#245c55] bg-white text-[10px] font-bold text-[#173d39] hover:bg-[#e8eee7]"
                        href={`/e/${event.slug}/register?seat=${encodeURIComponent(seat.id)}`}
                        key={seat.id}
                        title={`${seat.id}: Available`}
                      >
                        {seat.id.split("-").at(-1)}
                      </Link>
                    )
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-[#61736e]">
        <Legend color="bg-white border-[#245c55]" label="Available" />
        <Legend color="bg-slate-200 border-slate-300" label="Reserved" />
        <Legend color="bg-white border-slate-200" label="Unavailable" />
      </div>
      {!registrationAvailable ? (
        <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm leading-5 text-amber-900">
          Registration is not currently open for this event.
        </p>
      ) : (
        <p className="mt-4 text-xs leading-5 text-[#61736e]">Select available seats here, then finish registration and payment in the secure registration steps.</p>
      )}
    </section>
  );
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`size-3 rounded-sm border ${color}`} />
      {label}
    </span>
  );
}
