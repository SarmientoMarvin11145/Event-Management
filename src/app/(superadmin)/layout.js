import { Suspense } from "react";
import SuperadminShell from "@/components/superadmin/superadmin-shell";
import { requireAuthenticatedUser } from "@/lib/authorization";

export const instant = false;

export default function SuperadminLayout({ children }) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-50" />}>
      <AuthenticatedSuperadminLayout>{children}</AuthenticatedSuperadminLayout>
    </Suspense>
  );
}

async function AuthenticatedSuperadminLayout({ children }) {
  await requireAuthenticatedUser(["superadmin"]);

  return (
    <SuperadminShell>
      {children}
    </SuperadminShell>
  );
}