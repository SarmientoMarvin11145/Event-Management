import { Suspense } from "react";
import GuestRegistrationVerification from "@/components/public/guest-registration-verification";

export default function GuestRegistrationVerificationPage() {
  return (
    <main className="min-h-[70vh] bg-[#fbfcf8] px-5 py-16 text-[#173d39]">
      <div className="mx-auto max-w-xl rounded-xl border border-[#dce4dc] bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">KURO events</p>
        <h1 className="mt-3 text-2xl font-bold">Verify your event registration</h1>
        <p className="mt-2 text-sm leading-6 text-[#61736e]">Confirm your email to complete registration. This step only happens when you press the button.</p>
        <Suspense fallback={<p className="mt-6 text-sm text-[#61736e]" role="status">Loading verification link...</p>}>
          <GuestRegistrationVerification />
        </Suspense>
      </div>
    </main>
  );
}
