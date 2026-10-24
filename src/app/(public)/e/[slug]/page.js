import { Suspense } from "react";
import PublicEventDetails from "@/components/public/public-event-details";

export default function PublicEventPage({ params }) {
  return (
    <Suspense fallback={<main className="min-h-[70vh] bg-[#fbfcf8]" />}>
      <EventDetails params={params} />
    </Suspense>
  );
}

async function EventDetails({ params }) {
  const { slug } = await params;

  return <PublicEventDetails slug={slug} />;
}