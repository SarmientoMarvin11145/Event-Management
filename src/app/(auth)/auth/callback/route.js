import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const otpTypes = new Set([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "recovery",
  "signup",
]);

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const requestedNext = url.searchParams.get("next") || "/dashboard";
  const nextUrl = new URL(requestedNext, url.origin);
  const next =
    nextUrl.origin === url.origin
      ? `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
      : "/dashboard";
  const isLoginNext = nextUrl.origin === url.origin && nextUrl.pathname === "/login";

  const supabase = await createSupabaseServerClient();
  let error;

  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type && otpTypes.has(type)) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  } else {
    return NextResponse.redirect(new URL("/login?error=callback", url.origin));
  }

  if (error) {
    return NextResponse.redirect(new URL("/login?error=callback", url.origin));
  }

  if (isLoginNext) {
    await supabase.auth.signOut();
    const loginUrl = new URL("/login", url.origin);
    const verified = nextUrl.searchParams.get("verified");
    if (verified) {
      loginUrl.searchParams.set("verified", verified);
    } else {
      loginUrl.searchParams.set("verified", "1");
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}