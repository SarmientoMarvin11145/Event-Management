import Link from "next/link";
import { isFeatureEnabled } from "@/lib/features";
import { Panel, PortalHeading } from "@/components/user/portal-ui";

export const instant = false;
export const metadata = { title: "Messages | KURO" };

export default async function MessagesPage() {
  if (!(await isFeatureEnabled("messaging"))) {
    return (
      <div className="space-y-6">
        <PortalHeading title="Messages unavailable" description="This feature is currently disabled by the platform team." />
        <Panel><p className="text-sm leading-6 text-[#61736e]">Messaging is turned off. Contact KURO support if you need access.</p></Panel>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PortalHeading title="Messages" description="A place for conversations with event organizers and KURO support." />
      <Panel>
        <h2 className="text-lg font-bold text-[#173d39]">Messaging isn’t connected yet</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#61736e]">Direct messages, attendee networking, and live support chat are not active in this preview. For help, submit a support request and your submission will be saved to your account.</p>
        <Link className="mt-4 inline-flex rounded-md bg-[#173d39] px-4 py-2.5 text-sm font-bold text-white" href="/help">Contact support</Link>
      </Panel>
    </div>
  );
}
