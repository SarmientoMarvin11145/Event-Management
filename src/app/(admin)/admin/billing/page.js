import AdminBilling from "@/components/admin/admin-billing";
import { requireAuthenticatedUser } from "@/lib/authorization";
import { requireFeatureEnabled } from "@/lib/features";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const metadata = { title: "Organization billing | KURO" };

export default async function AdminBillingPage({ searchParams }) {
  await requireFeatureEnabled("payment-gateway");
  await requireAuthenticatedUser(["admin"]);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_my_paymongo_organizations");
  if (error) {
    throw new Error(`Unable to load organization billing: ${error.message}`, { cause: error });
  }

  const params = await searchParams;
  const paymentState = Array.isArray(params?.payment) ? params.payment[0] : params?.payment;
  return <AdminBilling organizations={data || []} paymentState={paymentState} />;
}
