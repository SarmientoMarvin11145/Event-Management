"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { supabase } from "@/lib/supabase";
import { legalPolicyVersions } from "@/lib/legal";

const authModes = {
  login: {
    title: "Welcome back",
    description: "Sign in to manage your events.",
    submit: "Sign in",
    alternate: (
      <>
        New here?{" "}
        <Link
          className="font-semibold text-[#245c55] hover:text-[#d6533d]"
          href="/register"
        >
          Create an account
        </Link>
      </>
    ),
  },
  register: {
    title: "Create your account",
    description: "Get started with your event workspace.",
    submit: "Create account",
    alternate: (
      <>
        Already have an account?{" "}
        <Link
          className="font-semibold text-[#245c55] hover:text-[#d6533d]"
          href="/login"
        >
          Sign in
        </Link>
      </>
    ),
  },
  forgot: {
    title: "Reset your password",
    description: "Enter your email and we will send you a reset link.",
    submit: "Send reset link",
    alternate: (
      <Link
        className="font-semibold text-[#245c55] hover:text-[#d6533d]"
        href="/login"
      >
        Back to sign in
      </Link>
    ),
  },
  reset: {
    title: "Choose a new password",
    description: "Use at least 6 characters for your new password.",
    submit: "Update password",
    alternate: null,
  },
};

export default function AuthForm({ mode, initialError, initialSuccess }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState(initialSuccess || initialError || "");
  const [messageType, setMessageType] = useState(initialSuccess ? "success" : initialError ? "error" : "");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const content = authModes[mode];

  function showMessage(text, type) {
    setMessage(text);
    setMessageType(type);
  }

  function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const fullName = String(formData.get("fullName") || "").trim();

    startTransition(async () => {
      try {
        if (mode === "login") {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            showMessage(error.message, "error");
            return;
          }

          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", data.user.id)
            .maybeSingle();

          if (profileError) {
            showMessage(`Unable to load your account role: ${profileError.message}`, "error");
            return;
          }

          const destinationByRole = {
            user: "/dashboard",
            admin: "/admin/dashboard",
            superadmin: "/superadmin/dashboard",
          };
          const destination = destinationByRole[profile?.role];

          if (!destination) {
            showMessage(
              "No valid role was found for your account. Confirm the profile role migration is applied and your profile has a valid role.",
              "error",
            );
            return;
          }

          router.replace(destination);
          router.refresh();
          return;
        }

        if (mode === "register") {
          if (fullName.length < 2) {
            showMessage("Enter your full name to create an account.", "error");
            return;
          }

          if (!formData.get("agreeTerms") || !formData.get("agreePrivacy")) {
            showMessage("You must agree to the Terms & Conditions and Privacy Policy to create an account.", "error");
            return;
          }

          const confirmPassword = String(formData.get("confirmPassword") || "");
          if (password !== confirmPassword) {
            showMessage("The passwords do not match.", "error");
            return;
          }

          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
                terms_policy_version: legalPolicyVersions.terms,
                privacy_policy_version: legalPolicyVersions.privacy,
              },
              emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/login?verified=1")}`,
            },
          });

          if (error) {
            showMessage(error.message, "error");
            return;
          }

          if (data.session) {
            const { error: signOutError } = await supabase.auth.signOut();
            if (signOutError) {
              showMessage(signOutError.message, "error");
              return;
            }
            showMessage(
              "Your account was created, but email verification is disabled in Supabase. Enable email confirmations in your Supabase Auth settings.",
              "error",
            );
            return;
          }

          router.replace(`/register/success?email=${encodeURIComponent(email)}`);
          router.refresh();
          return;
        }

        if (mode === "forgot") {
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
          });

          if (error) {
            showMessage(error.message, "error");
            return;
          }

          showMessage(
            "If an account exists for that email, a password reset link is on its way.",
            "success",
          );
          return;
        }

        if (mode === "reset") {
          const confirmPassword = String(formData.get("confirmPassword") || "");
          if (password !== confirmPassword) {
            showMessage("The passwords do not match.", "error");
            return;
          }

          const { error } = await supabase.auth.updateUser({ password });
          if (error) {
            showMessage(error.message, "error");
            return;
          }

          router.replace("/dashboard?password-updated=1");
          router.refresh();
        }
      } catch (error) {
        showMessage(
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
          "error",
        );
      }
    });
  }

  if (!content) {
    throw new Error(`Unsupported authentication form mode: ${mode}`);
  }

  return (
    <main className="grid min-h-screen bg-[#f8f8f4] text-[#173d39] lg:grid-cols-[minmax(0,0.95fr)_minmax(480px,1.05fr)]">
      <aside className="relative hidden min-h-screen overflow-hidden bg-[#142d2a] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div
          aria-label="Guests gathering at a live event"
          className="absolute inset-0 bg-cover bg-center opacity-35"
          role="img"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1600&q=85)" }}
        />
        <div className="absolute inset-0 bg-linear-to-b from-[#10201e]/65 via-[#10201e]/25 to-[#10201e]/90" />
        <Link className="relative inline-flex items-center gap-3 text-sm font-black tracking-[0.12em] text-white" href="/">
          <span className="flex size-10 items-center justify-center rounded-md bg-white p-1">
            <Image alt="" aria-hidden="true" className="size-full object-contain" height={40} priority src="/kuro logo-edited.png" unoptimized width={40} />
          </span>
          KURO
        </Link>
        <div className="relative max-w-xl pb-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ffcf72]">Events, people, all in one place</p>
          <h2 className="mt-5 text-4xl font-bold leading-tight xl:text-5xl">Bring your next gathering into focus.</h2>
          <p className="mt-5 max-w-md text-base leading-7 text-white/80">
            A clearer workspace for the details, people, and moments that make an event matter.
          </p>
          <div className="mt-8 flex flex-wrap gap-2 text-xs font-semibold text-white/80">
            <span className="rounded border border-white/25 px-3 py-2">Plan with clarity</span>
            <span className="rounded border border-white/25 px-3 py-2">Welcome every guest</span>
          </div>
        </div>
        <p className="relative text-xs text-white/65">Built for event teams in the Philippines.</p>
      </aside>

      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-14 xl:px-20">
        <div className="flex items-center justify-between">
          <Link className="inline-flex items-center gap-2.5 text-sm font-black tracking-widest text-[#173d39] lg:invisible" href="/">
            <span className="flex size-9 items-center justify-center rounded-md border border-[#dfe7df] bg-white p-0.5">
              <Image alt="" aria-hidden="true" className="size-full object-contain" height={36} priority src="/kuro logo-edited.png" unoptimized width={36} />
            </span>
            KURO
          </Link>
          <Link className="ml-auto text-sm font-semibold text-[#526864] hover:text-[#d6533d]" href="/">
            Back to home <span aria-hidden="true" className="ml-1">&#8599;</span>
          </Link>
        </div>

        <div className="mx-auto my-auto w-full max-w-md py-10">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d6533d]">
            {mode === "register" ? "Your next event starts here" : mode === "login" ? "Your workspace is waiting" : "Account access"}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#173d39] sm:text-4xl">
            {content.title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#647771]">
            {content.description}
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            {mode === "register" && (
              <div>
                <label className="mb-2 block text-sm font-semibold text-[#34544e]" htmlFor="register-full-name">
                  Full name
                </label>
                <input
                  autoComplete="name"
                  className="w-full rounded-md border border-[#cbd8d1] bg-white px-4 py-3 text-sm text-[#173d39] outline-none transition placeholder:text-[#899891] focus:border-[#38665e] focus:ring-4 focus:ring-[#38665e]/10"
                  id="register-full-name"
                  maxLength={120}
                  name="fullName"
                  placeholder="Your first and last name"
                  required
                  type="text"
                />
              </div>
            )}

            {mode !== "reset" && (
              <div>
                <label className="mb-2 block text-sm font-semibold text-[#34544e]" htmlFor={`${mode}-email`}>
                  Email address
                </label>
                <input
                  autoComplete="email"
                  className="w-full rounded-md border border-[#cbd8d1] bg-white px-4 py-3 text-sm text-[#173d39] outline-none transition placeholder:text-[#899891] focus:border-[#38665e] focus:ring-4 focus:ring-[#38665e]/10"
                  id={`${mode}-email`}
                  name="email"
                  placeholder="you@example.com"
                  required
                  type="email"
                />
              </div>
            )}

            {mode !== "forgot" && (
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-sm font-semibold text-[#34544e]" htmlFor={`${mode}-password`}>
                    {mode === "reset" ? "New password" : "Password"}
                  </label>
                  {mode === "login" && (
                    <Link className="text-xs font-semibold text-[#245c55] hover:text-[#d6533d]" href="/forgot-password">
                      Forgot password?
                    </Link>
                  )}
                </div>
                <div className="flex rounded-md border border-[#cbd8d1] bg-white focus-within:border-[#38665e] focus-within:ring-4 focus-within:ring-[#38665e]/10">
                  <input
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    className="min-w-0 flex-1 rounded-md bg-transparent px-4 py-3 text-sm text-[#173d39] outline-none placeholder:text-[#899891]"
                    id={`${mode}-password`}
                    minLength={6}
                    name="password"
                    placeholder={mode === "login" ? "Enter your password" : "At least 6 characters"}
                    required
                    type={showPassword ? "text" : "password"}
                  />
                  <button
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="shrink-0 px-4 text-xs font-bold text-[#526864] hover:text-[#d6533d]"
                    onClick={() => setShowPassword(!showPassword)}
                    type="button"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            )}

            {(mode === "register" || mode === "reset") && (
              <div>
                <label className="mb-2 block text-sm font-semibold text-[#34544e]" htmlFor={`${mode}-confirm-password`}>
                  Confirm password
                </label>
                <div className="flex rounded-md border border-[#cbd8d1] bg-white focus-within:border-[#38665e] focus-within:ring-4 focus-within:ring-[#38665e]/10">
                  <input
                    autoComplete="new-password"
                    className="min-w-0 flex-1 rounded-md bg-transparent px-4 py-3 text-sm text-[#173d39] outline-none placeholder:text-[#899891]"
                    id={`${mode}-confirm-password`}
                    minLength={6}
                    name="confirmPassword"
                    placeholder="Enter the password again"
                    required
                    type={showConfirmPassword ? "text" : "password"}
                  />
                  <button
                    aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
                    className="shrink-0 px-4 text-xs font-bold text-[#526864] hover:text-[#d6533d]"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    type="button"
                  >
                    {showConfirmPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            )}

            {mode === "register" && (
              <div className="space-y-3 text-sm text-[#526864]">
                <label className="flex items-start gap-3 leading-5">
                  <input className="mt-1 size-4 shrink-0 accent-[#ed6148]" name="agreeTerms" required type="checkbox" />
                  <span>I agree to the <Link className="font-semibold text-[#245c55] underline" href="/terms" rel="noreferrer" target="_blank">Terms &amp; Conditions</Link>.</span>
                </label>
                <label className="flex items-start gap-3 leading-5">
                  <input className="mt-1 size-4 shrink-0 accent-[#ed6148]" name="agreePrivacy" required type="checkbox" />
                  <span>I agree to the <Link className="font-semibold text-[#245c55] underline" href="/privacy" rel="noreferrer" target="_blank">Privacy Policy</Link>.</span>
                </label>
              </div>
            )}

            {message && (
              <p
                aria-live="polite"
                className={`rounded-md border px-4 py-3 text-sm leading-5 ${
                  messageType === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-800"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
                }`}
                role={messageType === "error" ? "alert" : "status"}
              >
                {message}
              </p>
            )}

            <button
              className="w-full rounded-md bg-[#ed6148] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#d74d37] focus:outline-none focus:ring-4 focus:ring-[#ed6148]/25 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Please wait..." : content.submit}
              {!isPending && <span aria-hidden="true" className="ml-2">&#8594;</span>}
            </button>
          </form>

          {content.alternate && (
            <p className="mt-7 text-center text-sm text-[#647771]">
              {content.alternate}
            </p>
          )}
          <p className="mt-8 border-t border-[#e1e8e0] pt-5 text-center text-xs leading-5 text-[#82918b]">
            Your account details are handled securely. Never share your password with anyone.
          </p>
        </div>
      </section>
    </main>
  );
}
