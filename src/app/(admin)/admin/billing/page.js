import { redirect } from "next/navigation";

export const metadata = { title: "Account plan | KURO" };

export default function AdminBillingPage() {
  redirect("/account-plan");
}
