import { redirect } from "next/navigation";

export const metadata = { title: "Dashboard | KURO" };

export default function AccountPlanPage() {
  redirect("/dashboard");
}
