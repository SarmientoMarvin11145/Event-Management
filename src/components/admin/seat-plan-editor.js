"use client";

import { useState } from "react";
import { saveVenueSeatPlan } from "@/app/(admin)/admin/actions";

function rowName(index) {
  return String.fromCharCode(65 + index);
}

function createRows(rowCount, seatCount, previousRows = []) {
  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const label = previousRows[rowIndex]?.label || rowName(rowIndex);
    const previousSeats = previousRows[rowIndex]?.seats || [];
    return {
      label,
      seats: Array.from({ length: seatCount }, (_, seatIndex) => {
        const id = `${label}-${seatIndex + 1}`;
        const previousSeat = previousSeats.find((seat) => seat.id === id);
        return { id, enabled: previousSeat?.enabled ?? true };
      }),
    };
  });
}

export default function SeatPlanEditor({ organizationId, organizations = [], venue = null }) {
  const initialRows = venue?.seat_plan?.rows || createRows(5, 8);
  const [rows, setRows] = useState(initialRows);
  const [rowCount, setRowCount] = useState(initialRows.length);
  const [seatCount, setSeatCount] = useState(Math.max(1, ...initialRows.map((row) => row.seats.length)));

  function resize(nextRowCount, nextSeatCount) {
    setRows(createRows(nextRowCount, nextSeatCount, rows));
  }

  function updateRowCount(value) {
    const nextCount = Number(value);
    setRowCount(nextCount);
    resize(nextCount, seatCount);
  }

  function updateSeatCount(value) {
    const nextCount = Number(value);
    setSeatCount(nextCount);
    resize(rowCount, nextCount);
  }

  function toggleSeat(seatId) {
    setRows((current) => current.map((row) => ({
      ...row,
      seats: row.seats.map((seat) => seat.id === seatId ? { ...seat, enabled: !seat.enabled } : seat),
    })));
  }

  return (
    <form action={saveVenueSeatPlan} className="space-y-5">
      {venue ? (
        <input name="organization_id" type="hidden" value={organizationId} />
      ) : (
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          Organization
          <select className="rounded-md border border-slate-300 bg-white px-3 py-2.5 font-normal" defaultValue={organizationId} name="organization_id" required>
            {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </select>
        </label>
      )}
      <input name="venue_id" type="hidden" value={venue?.id || ""} />
      <input name="seat_plan" type="hidden" value={JSON.stringify({ rows })} />
      <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
        Venue name
        <input
          className="rounded-md border border-slate-300 px-3 py-2.5 font-normal"
          defaultValue={venue?.name || ""}
          maxLength={120}
          name="name"
          placeholder="Name this venue"
          required
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          Rows
          <input className="rounded-md border border-slate-300 px-3 py-2.5 font-normal" max="26" min="1" onChange={(event) => updateRowCount(Number(event.target.value))} required type="number" value={rowCount} />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
          Seats per row
          <input className="rounded-md border border-slate-300 px-3 py-2.5 font-normal" max="40" min="1" onChange={(event) => updateSeatCount(Number(event.target.value))} required type="number" value={seatCount} />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mx-auto mb-5 max-w-3xl rounded-t-[50%] border-t-4 border-[#173d39] py-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
          Stage / front
        </div>
        <div className="mx-auto grid w-max gap-2">
          {rows.map((row) => (
            <div className="flex items-center gap-2" key={row.label}>
              <span aria-label={`Row ${row.label}`} className="w-6 text-center text-xs font-bold text-slate-500">{row.label}</span>
              <div className="flex gap-1.5">
                {row.seats.map((seat) => (
                  <button
                    aria-pressed={seat.enabled}
                    aria-label={`Row ${row.label}, seat ${seat.id.split("-").at(-1)} ${seat.enabled ? "available" : "blocked"}`}
                    className={`size-8 rounded-t-md border text-[10px] font-bold ${seat.enabled ? "border-[#245c55] bg-[#e8eee7] text-[#173d39] hover:bg-[#d8e6dc]" : "border-slate-300 bg-slate-200 text-slate-400 line-through"}`}
                    key={seat.id}
                    onClick={() => toggleSeat(seat.id)}
                    type="button"
                  >
                    {seat.id.split("-").at(-1)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">Select seats to block or unblock them. Changes apply when you save this plan.</p>
      </div>

      <button className="rounded-md bg-[#173d39] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#245c55]" type="submit">
        {venue ? "Save seat plan" : "Create venue and seat plan"}
      </button>
    </form>
  );
}
