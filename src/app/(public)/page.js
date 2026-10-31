import FeaturedEvents from "@/components/public/featured-events";

export const metadata = {
  title: "KURO | Discover events",
  description: "Find events you’ll love, compare ticket prices, and reserve your place with KURO.",
};

export default function Home() {
  return <FeaturedEvents directory />;
}