import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const instant = false;

export default function CertificateVerificationPage({ params }) {
  return (
    <Suspense fallback={<main className="min-h-[60vh] bg-[#fbfcf8]" />}>
      <VerificationResult params={params} />
    </Suspense>
  );
}

async function VerificationResult({ params }) {
  const { code } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("verify_certificate", {
    p_verification_code: code,
  });
  if (error) throw new Error(`Certificate verification failed: ${error.message}`, { cause: error });
  const certificate = data?.[0];

  return (
    <main className="kuro-page min-h-[60vh] bg-[#fbfcf8] px-5 py-16 text-[#173d39] sm:px-8">
      <section className="kuro-panel mx-auto max-w-2xl rounded-md border border-[#dce4dc] bg-white p-6 sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">KURO certificate registry</p>
        <h1 className="mt-3 text-3xl font-bold">{certificate ? "Certificate verified" : "Certificate not found"}</h1>
        {certificate ? (
          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <Detail label="Certificate holder event" value={certificate.event_title} />
            <Detail label="Issuing organization" value={certificate.organization_name} />
            <Detail label="Certificate type" value={certificate.certificate_type} />
            <Detail label="Issued" value={new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(certificate.issued_at))} />
            <Detail label="CPD units" value={Number(certificate.cpd_units).toFixed(2)} />
            <Detail label="Verification code" value={certificate.verification_code} />
          </dl>
        ) : (
          <p className="mt-3 text-sm leading-6 text-[#61736e]">We could not find a certificate with that verification code. Check the code and try again.</p>
        )}
      </section>
    </main>
  );
}

function Detail({ label, value }) {
  return <div><dt className="font-semibold text-[#61736e]">{label}</dt><dd className="mt-1 break-words font-medium text-[#173d39]">{value}</dd></div>;
}
