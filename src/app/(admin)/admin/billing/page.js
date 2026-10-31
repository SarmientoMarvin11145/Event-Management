import { redirect } from "next/navigation";

export const metadata = { title: "Admin workspace | KURO" };

export default function AdminBillingPage() {
  redirect("/admin/dashboard");
}
