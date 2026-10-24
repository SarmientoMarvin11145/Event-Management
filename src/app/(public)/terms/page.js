import { legalPolicyVersions } from "@/lib/legal";

export const metadata = {
  title: "Terms & Conditions | KURO",
};

export default function TermsPage() {
  return (
    <main className="kuro-page min-h-screen bg-[#fbfcf8] px-5 py-14 text-[#173d39] sm:px-8 sm:py-20">
      <article className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">KURO account terms</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Terms &amp; Conditions</h1>
        <p className="mt-3 text-sm text-[#647771]">Preview version {legalPolicyVersions.terms}</p>
        <p className="mt-6 border-l-2 border-[#ed6148] pl-4 text-sm leading-6 text-[#526864]">
          KURO is an early product preview. These draft terms describe the current account experience and should be reviewed by the KURO operator and legal counsel before production use.
        </p>
        <div className="mt-10 space-y-8 text-sm leading-7 text-[#526864]">
          <section>
            <h2 className="text-lg font-bold text-[#173d39]">1. Your account</h2>
            <p className="mt-2">Provide accurate account information, keep your sign-in credentials private, and tell us if you believe your account has been accessed without permission. You are responsible for activity performed through your account.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-[#173d39]">2. Acceptable use</h2>
            <p className="mt-2">Use KURO only for lawful purposes and only with the rights and permissions needed for information you submit. Do not attempt to disrupt the service, access another account, or submit content that you are not authorized to use.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-[#173d39]">3. Preview features</h2>
            <p className="mt-2">Features may change while KURO is in preview. Event registration, ticketing, attendee check-in, payments, AI assistance, and organizer publishing are not active in this version. Do not rely on KURO for critical event operations or submit attendee data to features that are not available.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-[#173d39]">4. Public event information</h2>
            <p className="mt-2">When public event publishing becomes available, details an organizer marks as public may be visible to anyone. Organizers are responsible for having permission to publish their event materials and for avoiding sensitive personal information in public listings.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-[#173d39]">5. Availability and changes</h2>
            <p className="mt-2">The preview is provided as-is and may be changed, interrupted, or withdrawn. These draft terms are not a promise that a particular feature or service level will be available.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-[#173d39]">6. Privacy</h2>
            <p className="mt-2">Use of account information is described in the <a className="font-semibold text-[#245c55] underline" href="/privacy">KURO Privacy Policy</a>.</p>
          </section>
        </div>
      </article>
    </main>
  );
}