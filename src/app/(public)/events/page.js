import { Suspense } from "react";
import FeaturedEvents from "@/components/public/featured-events";

export const metadata = {
  title: "Public events | KURO",
};

export default function EventsPage({ searchParams }) {
  return (
    <Suspense fallback={<main className="min-h-[60vh] bg-[#f4f6f1]" />}>
      <EventsDirectory searchParams={searchParams} />
    </Suspense>
  );
}

async function EventsDirectory({ searchParams }) {
  const { q } = await searchParams;
  const initialQuery = Array.isArray(q) ? q[0] || "" : q || "";

  return <FeaturedEvents directory initialQuery={initialQuery} />;
}