"use client";

export default function PrintTicketButton() {
  return (
    <button
      className="print:hidden rounded-md bg-[#173d39] px-4 py-2 text-sm font-semibold text-white hover:bg-[#245c55]"
      onClick={() => window.print()}
      type="button"
    >
      Download / print ticket
    </button>
  );
}
