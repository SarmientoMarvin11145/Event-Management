"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function GuestRegistrationVerification() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");

  async function verify() {
    setStatus("submitting");
    setMessage("");
    try {
      const response = await fetch("/api/guest-registration/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not verify this registration.");
      setTicketUrl(result.ticketUrl || "");
      setMessage(result.emailSent === false
        ? `Your email is verified, but the ticket email could not be sent. Save your registration code: ${result.registrationCode}.`
        : "Your email is verified. Your ticket details have been emailed to you.");
      setStatus("verified");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not verify this registration.");
    }
  }

  if (!/^[0-9a-f]{64}$/.test(token)) {
    return <p className="mt-6 rounded-md bg-rose-50 p-4 text-sm text-rose-800" role="alert">This verification link is invalid or incomplete.</p>;
  }

  return (
    <div className="mt-6">
      {status === "verified" ? (
        <div className="space-y-4">
          <p className="rounded-md bg-emerald-50 p-4 text-sm leading-6 text-emerald-900" role="status">{message}</p>
          {ticketUrl && <Link className="inline-flex rounded-md bg-[#173d39] px-4 py-3 text-sm font-bold text-white" href={ticketUrl}>Open your ticket</Link>}
        </div>
      ) : (
        <>
          {status === "error" && <p className="mb-4 rounded-md bg-rose-50 p-4 text-sm text-rose-800" role="alert">{message}</p>}
          <button className="rounded-md bg-[#ed6148] px-4 py-3 text-sm font-bold text-white hover:bg-[#d74d37] disabled:cursor-wait disabled:opacity-60" disabled={status === "submitting"} onClick={verify} type="button">
            {status === "submitting" ? "Verifying..." : "Verify email and complete registration"}
          </button>
        </>
      )}
    </div>
  );
}
