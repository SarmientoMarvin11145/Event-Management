"use client";

import { useActionState } from "react";
import { registerForEvent } from "@/app/(user)/actions";

export default function EventRegistrationForm({
  eventId,
  seatId = "",
  buttonText,
  buttonClassName,
  formClassName = "",
  disabled = false,
}) {
  const [state, formAction, pending] = useActionState(registerForEvent, { error: "" });

  return (
    <form action={formAction} className={formClassName}>
      <input name="event_id" type="hidden" value={eventId} />
      {seatId && <input name="seat_id" type="hidden" value={seatId} />}
      <button className={buttonClassName} disabled={disabled || pending} type="submit">
        {pending ? "Registering..." : buttonText}
      </button>
      {state.error && <p className="mt-2 text-sm text-rose-700" role="alert">{state.error}</p>}
    </form>
  );
}
