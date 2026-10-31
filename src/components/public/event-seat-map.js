"use client";

import { useState } from "react";
import { registerForEvent } from "@/app/(user)/actions";

export default function EventSeatMap({ event, seatMap, status, onSeatChange, showRegistrationButton = true }) {
  const [selectedSeat, setSelectedSeat] = useState("");

  if (status === "loading") {
    return <p className="mt-4 text-sm text-[#61736e]" role="status">Loading available seats...</p>;
  }

  if (status === "unavailable" || !seatMap) {
    return <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">Seat availability is temporarily unavailable. Please try again later.</p>;
  }

  const paidEvent = Number(event.ticket_price) > 0;
  const registrationAvailable = new Date(event.start_date) > new Date()
    && (!event.registration_opens_at || new Date(event.registration_opens_at) <= new Date())
    && (!event.registration_deadline || new Date(event.registration_deadline) >= new Date());
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
                  const selected = selectedSeat === seat.id;
                  const unavailable = reserved || blocked;
                  return (
                    <button
                      aria-label={`Seat ${seat.id}: ${reserved ? "reserved" : blocked ? "unavailable" : selected ? "selected" : "available"}`}
                      aria-pressed={selected}
                      className={`size-8 rounded-t-md border text-[10px] font-bold ${selected ? "border-[#d6533d] bg-[#ed6148] text-white" : reserved ? "border-slate-300 bg-slate-200 text-slate-400" : blocked ? "border-slate-200 bg-white text-slate-300" : "border-[#245c55] bg-white text-[#173d39] hover:bg-[#e8eee7]"}`}
                      disabled={unavailable}
                      key={seat.id}
                      onClick={() => {
                        setSelectedSeat(seat.id);
                        onSeatChange?.(seat.id);
                      }}
                      title={`${seat.id}: ${reserved ? "Reserved" : blocked ? "Unavailable" : selected ? "Selected" : "Available"}`}
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
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-[#61736e]">
        <Legend color="bg-white border-[#245c55]" label="Available" />
        <Legend color="bg-[#ed6148] border-[#d6533d]" label="Selected" />
        <Legend color="bg-slate-200 border-slate-300" label="Reserved" />
        <Legend color="bg-white border-slate-200" label="Unavailable" />
      </div>
      {paidEvent ? (
        <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm leading-5 text-amber-900">
          Paid checkout is not enabled yet. The selected seat is only a preview and will not be reserved.
        </p>
      ) : !registrationAvailable ? (
        <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm leading-5 text-amber-900">
          Registration is not currently open for this event.
        </p>
      ) : showRegistrationButton ? (
        <form action={registerForEvent} className="mt-4">
          <input name="event_id" type="hidden" value={event.id} />
          <input name="seat_id" type="hidden" value={selectedSeat} />
          <button
            className="w-full rounded-md bg-[#ed6148] px-4 py-3 text-sm font-bold text-white hover:bg-[#d74d37] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedSeat}
            type="submit"
          >
            {selectedSeat ? `Register with seat ${selectedSeat}` : "Select an available seat"}
          </button>
        </form>
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
