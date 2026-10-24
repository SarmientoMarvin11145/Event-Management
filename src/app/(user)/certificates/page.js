import Link from "next/link";
import { getAttendeeSession, eventFromRelation, throwOnSupabaseError } from "@/lib/attendee-data";
import { requireFeatureEnabled } from "@/lib/features";
import { EmptyState, Panel, PortalHeading } from "@/components/user/portal-ui";

export const instant = false;
export const metadata = { title: "Certificates | KURO" };

export default async function CertificatesPage() {
  await requireFeatureEnabled("certificates");
  const { supabase, user } = await getAttendeeSession();
  const { data, error } = await supabase.from("certificates").select("id, certificate_type, cpd_units, certificate_url, verification_code, issued_at, events(title, start_date, organizations(name))").eq("user_id", user.id).order("issued_at", { ascending: false });
  throwOnSupabaseError(error);
  const certificates = data || [];
  const totalCpd = certificates.reduce((sum, certificate) => sum + Number(certificate.cpd_units || 0), 0);

  return (
    <div className="space-y-6">
      <PortalHeading title="Certificates" description="Certificates issued by event organizers will appear here. Downloads are available when the issuer provides a certificate file." />
      <Panel>
        <p className="text-sm font-semibold text-[#61736e]">CPD units earned</p>
        <p className="mt-1 text-3xl font-black text-[#173d39]">{totalCpd.toFixed(2)}</p>
      </Panel>
      {certificates.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {certificates.map((certificate) => {
            const event = eventFromRelation(certificate.events);
            const organization = event?.organizations;
            return (
              <Panel key={certificate.id}>
                <p className="text-xs font-bold uppercase tracking-wide text-[#d6533d]">{certificate.certificate_type} certificate</p>
                <h2 className="mt-2 text-lg font-bold text-[#173d39]">{event?.title || "Event certificate"}</h2>
                <p className="mt-1 text-sm text-[#61736e]">{organization?.name || "KURO organizer"}</p>
                <p className="mt-3 text-sm text-[#61736e]">Issued {new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(certificate.issued_at))}</p>
                {Number(certificate.cpd_units) > 0 && <p className="mt-1 text-sm text-[#61736e]">{certificate.cpd_units} CPD units</p>}
                <p className="mt-3 break-all text-xs text-[#7a8b84]">Verification code: {certificate.verification_code}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link className="rounded-md border border-[#cbd8d1] px-3 py-2 text-xs font-bold text-[#245c55]" href={`/verify/${encodeURIComponent(certificate.verification_code)}`}>Verify</Link>
                  {certificate.certificate_url ? <a className="rounded-md bg-[#173d39] px-3 py-2 text-xs font-bold text-white" href={certificate.certificate_url} rel="noreferrer" target="_blank">Download PDF</a> : <span className="self-center text-xs text-[#7a8b84]">No PDF provided</span>}
                </div>
              </Panel>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No certificates yet" description="When an organizer issues you a certificate, you’ll be able to view it here." href="/my-events" action="View my events" />
      )}
    </div>
  );
}
