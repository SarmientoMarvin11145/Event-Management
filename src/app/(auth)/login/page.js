import { Suspense } from "react";
import AuthForm from "@/components/auth-form";

export const metadata = {
  title: "Sign in | KURO",
};

export default function LoginPage({ searchParams }) {
  return (
    <Suspense>
      <LoginForm searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginForm({ searchParams }) {
  const { error, verified } = await searchParams;
  const initialError =
    error === "callback"
      ? "That verification link is invalid or has expired. Please request a new one."
      : error === "account-disabled"
        ? "This account is suspended or disabled. Contact platform support for help."
        : "";
  const initialSuccess = verified === "1" ? "Your email has been verified. Please sign in." : "";
  return <AuthForm initialError={initialError} initialSuccess={initialSuccess} mode="login" />;
}
