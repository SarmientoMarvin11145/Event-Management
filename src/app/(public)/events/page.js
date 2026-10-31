import { Suspense } from "react";
import FeaturedEvents from "@/components/public/featured-events";

export const metadata = {
  title: "Browse events | KURO",
};

export default function EventsPage({ searchParams }) {
  return (
    <Suspense fallback={<main className="min-h-[60vh] bg-[#f4f6f1]" />}>
      <EventsDirectory searchParams={searchParams} />
    </Suspense>
  );
}

async function EventsDirectory({ searchParams }) {
  const { q, category, price } = await searchParams;
  const initialQuery = Array.isArray(q) ? q[0] || "" : q || "";
  const initialCategory = Array.isArray(category) ? category[0] || "" : category || "";
  const requestedPrice = Array.isArray(price) ? price[0] || "all" : price || "all";
  const initialPrice = ["all", "free", "paid"].includes(requestedPrice) ? requestedPrice : "all";

  return <FeaturedEvents directory initialCategory={initialCategory} initialPrice={initialPrice} initialQuery={initialQuery} />;
}