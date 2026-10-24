import AuthForm from "@/components/auth-form";

export const metadata = {
  title: "Reset your password | KURO",
};

export default function ForgotPasswordPage() {
  return <AuthForm mode="forgot" />;
}