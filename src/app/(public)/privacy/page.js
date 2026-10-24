import { legalPolicyVersions } from "@/lib/legal";

export const metadata = {
  title: "Privacy Policy | KURO",
};

export default function PrivacyPage() {
  return (
    <main className="kuro-page min-h-screen bg-[#fbfcf8] px-5 py-14 text-[#173d39] sm:px-8 sm:py-20">
      <article className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">KURO account privacy</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-[#647771]">Preview version {legalPolicyVersions.privacy}</p>
        <p className="mt-6 border-l-2 border-[#ed6148] pl-4 text-sm leading-6 text-[#526864]">
          This draft describes data handled by the current KURO preview. It should be reviewed and completed by the KURO operator and legal counsel before production use.
        </p>
        <div className="mt-10 space-y-8 text-sm leading-7 text-[#526864]">
          <section>
            <h2 className="text-lg font-bold text-[#173d39]">1. Information collected</h2>
            <p className="mt-2">When you create an account, KURO receives your full name and email address. The account profile may also contain an avatar URL. Authentication and session cookies are used to sign you in and keep your account secure. Your consent to these policy versions is recorded with your profile when signup succeeds.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-[#173d39]">2. How information is used</h2>
            <p className="mt-2">Account information is used to create and maintain your KURO account, support sign-in and password recovery, and provide account features available in the preview. The current app does not operate a newsletter, AI service, or attendee registration workflow.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-[#173d39]">3. Storage and access</h2>
            <p className="mt-2">KURO uses Supabase for authentication and profile storage. Profile access is restricted by row-level security to the account owner, with administrative access controlled by the application. Do not submit attendee or sensitive personal information; those workflows are not available in this preview.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-[#173d39]">4. Local preferences</h2>
            <p className="mt-2">The public site stores your light/dark theme choice in browser local storage. This preference is used only to restore the selected appearance on your device.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-[#173d39]">5. Your choices</h2>
            <p className="mt-2">You may choose not to create an account. Account profile details can be viewed or changed only through features currently provided by KURO. A complete process for data access, correction, or deletion requests must be published by the KURO operator before production use.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-[#173d39]">6. Policy changes</h2>
            <p className="mt-2">If this policy changes, the version and update date will change as well. Material changes should be presented for renewed consent where required.</p>
          </section>
        </div>
      </article>
    </main>
  );
}