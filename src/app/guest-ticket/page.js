import { Suspense } from "react";
import GuestTicketDetails from "@/components/public/guest-ticket-details";

export default function GuestTicketPage() {
  return (
    <main className="min-h-[70vh] bg-[#fbfcf8] px-5 py-16 text-[#173d39]">
      <div className="mx-auto max-w-2xl rounded-xl border border-[#dce4dc] bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">KURO events</p>
        <h1 className="mt-3 text-2xl font-bold">Your event ticket</h1>
        <Suspense fallback={<p className="mt-6 text-sm text-[#61736e]" role="status">Loading ticket link...</p>}>
          <GuestTicketDetails />
        </Suspense>
      </div>
    </main>
  );
}
