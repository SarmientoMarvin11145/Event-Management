import { submitSupportRequest } from "@/app/(user)/actions";
import { getAttendeeSession, throwOnSupabaseError } from "@/lib/attendee-data";
import { requireFeatureEnabled } from "@/lib/features";
import { Panel, PortalHeading, StatusMessage } from "@/components/user/portal-ui";

export const instant = false;
export const metadata = { title: "Help & support | KURO" };

const faqs = [
  ["Where can I find my ticket?", "Open My tickets from your workspace. Your registration code and event details appear there after a successful registration."],
  ["Can I register for events?", "Registration is available for published events. Browse events and choose Register to join."],
  ["Where is my certificate?", "Certificates appear after an organizer issues one to your account. Contact the organizer if you expected a certificate."],
  ["Can I use a QR ticket or wallet pass?", "QR scanning and Apple/Google Wallet passes are not connected yet. Your registration code is available in My tickets."],
];

export default async function HelpPage({ searchParams }) {
  await requireFeatureEnabled("support");
  const params = await searchParams;
  const { supabase, user } = await getAttendeeSession();
  const { data: requests, error } = await supabase.from("support_requests").select("id, subject, status, created_at, support_messages(id, author_id, message, created_at)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
  throwOnSupabaseError(error);

  return (
    <div className="space-y-6">
      <PortalHeading title="Help & support" description="Find answers or send a support request to the KURO team." />
      {params?.submitted && <StatusMessage tone="success">Your support request was submitted.</StatusMessage>}
      <Panel>
        <h2 className="text-lg font-bold text-[#173d39]">Frequently asked questions</h2>
        <div className="mt-3 divide-y divide-[#e8eee7]">
          {faqs.map(([question, answer]) => <details className="py-3" key={question}><summary className="cursor-pointer text-sm font-semibold text-[#245c55]">{question}</summary><p className="mt-2 text-sm leading-6 text-[#61736e]">{answer}</p></details>)}
        </div>
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <h2 className="text-lg font-bold text-[#173d39]">Contact support</h2>
          <p className="mt-1 text-sm text-[#61736e]">Your request and replies are saved in your KURO account. Check the request history for updates; email notifications are not enabled.</p>
          <form action={submitSupportRequest} className="mt-4 space-y-3">
            <label className="block text-sm font-semibold text-[#526864]" htmlFor="subject">Subject<input className="kuro-input mt-1 w-full rounded-md border border-[#cbd8d1] bg-white px-3 py-2.5 font-normal" id="subject" maxLength={160} name="subject" required /></label>
            <label className="block text-sm font-semibold text-[#526864]" htmlFor="message">How can we help?<textarea className="kuro-input mt-1 w-full rounded-md border border-[#cbd8d1] bg-white px-3 py-2.5 font-normal" id="message" maxLength={5000} name="message" required rows={5} /></label>
            <button className="rounded-md bg-[#173d39] px-4 py-2.5 text-sm font-bold text-white" type="submit">Send request</button>
          </form>
        </Panel>
        <Panel>
          <h2 className="text-lg font-bold text-[#173d39]">Your support requests</h2>
          {requests?.length ? (
            <ul className="mt-3 divide-y divide-[#e8eee7]">
              {requests.map((request) => <li className="py-3" key={request.id}>
                <p className="text-sm font-semibold text-[#173d39]">{request.subject}</p>
                <p className="mt-1 text-xs capitalize text-[#61736e]">{request.status.replaceAll("_", " ")} · {new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(request.created_at))}</p>
                {request.support_messages?.map((reply) => <div className="mt-3 rounded-md bg-[#f4f6f1] p-3" key={reply.id}><p className="text-xs font-bold text-[#245c55]">{reply.author_id === user.id ? "You" : "KURO support"}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-[#526864]">{reply.message}</p></div>)}
              </li>)}
            </ul>
          ) : <p className="mt-3 text-sm text-[#61736e]">Your submitted requests will appear here.</p>}
          <p className="mt-5 text-xs leading-5 text-[#7a8b84]">The chatbot, phone/SMS support, tutorials, community forum, and status page are not connected in this preview.</p>
        </Panel>
      </div>
    </div>
  );
}
