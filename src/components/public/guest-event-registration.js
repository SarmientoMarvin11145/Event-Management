"use client";

import { useEffect, useState } from "react";
import { registerForEvent } from "@/app/(user)/actions";
import { supabase } from "@/lib/supabase";
import { validateRegistrationForm } from "@/lib/registration-form";

const inputClass = "mt-1 w-full rounded-md border border-[#cbd8d1] bg-white px-3 py-2.5 text-sm font-normal text-[#173d39]";

export default function GuestEventRegistration({ eventId, eventTitle, fields = [], seatId = "", registrationAvailable }) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [accountState, setAccountState] = useState("loading");

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setAccountState(error ? "error" : data.user ? "signed-in" : "guest");
    }).catch((error) => {
      console.error("Unable to check event registration sign-in status.", error);
      if (active) setAccountState("error");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setAccountState(session?.user ? "signed-in" : "guest");
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const answers = {};
    for (const field of fields) {
      const fieldName = `answer_${field.id}`;
      answers[field.id] = field.type === "checkboxes"
        ? formData.getAll(fieldName).map(String)
        : String(formData.get(fieldName) || "");
    }

    try {
      validateRegistrationForm(fields, answers);
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(`Unable to check sign-in status: ${authError.message}`);
      if (user) {
        formData.set("answers_json", JSON.stringify(answers));
        const result = await registerForEvent(formData);
        if (result?.error) throw new Error(result.error);
        return;
      }

      const response = await fetch("/api/guest-registration/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          attendeeName: formData.get("attendee_name"),
          email: formData.get("email"),
          seatId,
          answers,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not start registration.");
      setStatus("sent");
      setMessage(`Check your inbox for a verification link to complete registration for ${eventTitle}.`);
      form.reset();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not submit registration.");
    }
  }

  if (status === "sent") {
    return (
      <p className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950" role="status">
        {message}
      </p>
    );
  }

  return (
    <form className="mt-4 space-y-3" onSubmit={submit}>
      <input name="event_id" type="hidden" value={eventId} />
      <input name="seat_id" type="hidden" value={seatId} />
      <p className="text-sm font-semibold text-[#173d39]">{accountState === "signed-in" ? "Register using your KURO account." : "Register using your email; no account is required."}</p>
      {accountState === "error" && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-800" role="alert">Could not check your sign-in status. Refresh the page to continue registration.</p>}
      {accountState !== "signed-in" && (
        <>
          <label className="block text-sm font-semibold text-[#526864]">
            Your name
            <input autoComplete="name" className={inputClass} maxLength={120} minLength={2} name="attendee_name" required />
          </label>
          <label className="block text-sm font-semibold text-[#526864]">
            Email address
            <input autoComplete="email" className={inputClass} maxLength={254} name="email" required type="email" />
          </label>
        </>
      )}
      {fields.map((field) => (
        <RegistrationQuestion field={field} key={field.id} />
      ))}
      {status === "error" && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-800" role="alert">{message}</p>}
      <button className="w-full rounded-md bg-[#ed6148] px-4 py-3 text-sm font-bold text-white hover:bg-[#d74d37] disabled:cursor-wait disabled:opacity-60" disabled={!registrationAvailable || status === "submitting" || accountState === "loading" || accountState === "error"} type="submit">
        {status === "submitting" ? "Submitting..." : seatId ? `Register with seat ${seatId}` : "Register for free"}
      </button>
      <p className="text-xs leading-5 text-[#61736e]">Guests must verify their email before registration is confirmed. A ticket link and enabled event reminders will be emailed to them.</p>
    </form>
  );
}

function RegistrationQuestion({ field }) {
  const name = `answer_${field.id}`;
  const options = Array.isArray(field.options) ? field.options : [];
  if (field.type === "dropdown") {
    return (
      <label className="block text-sm font-semibold text-[#526864]">
        {field.label}{field.required ? " *" : ""}
        <select className={inputClass} defaultValue="" name={name} required={field.required}>
          <option value="">Choose an option</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    );
  }
  if (field.type === "single_choice" || field.type === "checkboxes") {
    return (
      <fieldset className="rounded-md border border-[#dce4dc] p-3">
        <legend className="px-1 text-sm font-semibold text-[#526864]">{field.label}{field.required ? " *" : ""}</legend>
        <div className="grid gap-2">
          {options.map((option) => (
            <label className="flex items-center gap-2 text-sm text-[#526864]" key={option}>
              <input name={name} required={field.required && field.type === "single_choice"} type={field.type === "checkboxes" ? "checkbox" : "radio"} value={option} />
              {option}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
  return (
    <label className="block text-sm font-semibold text-[#526864]">
      {field.label}{field.required ? " *" : ""}
      {field.type === "long_text" ? (
        <textarea className={inputClass} maxLength={5000} name={name} required={field.required} rows={4} />
      ) : (
        <input className={inputClass} maxLength={field.type === "number" ? undefined : 500} name={name} required={field.required} step={field.type === "number" ? "any" : undefined} type={inputType} />
      )}
    </label>
  );
}
