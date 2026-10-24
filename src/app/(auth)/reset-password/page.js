import AuthForm from "@/components/auth-form";

export const metadata = {
  title: "Choose a new password | KURO",
};

export default function ResetPasswordPage() {
  return <AuthForm mode="reset" />;
}