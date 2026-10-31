"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveAdminEvent } from "@/app/(admin)/admin/actions";

const categories = [
  ["academic", "Academic"],
  ["technology", "Technology"],
  ["sports", "Sports"],
  ["entertainment", "Entertainment"],
  ["conference", "Conference"],
  ["workshop", "Workshop"],
  ["seminar", "Seminar"],
  ["competition", "Competition"],
  ["community", "Community"],
  ["other", "Other"],
];

function localDateTime(value, timezone) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function Field({ label, children, hint }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
      {label}
      {children}
      {hint && <span className="text-xs font-normal leading-5 text-slate-500">{hint}</span>}
    </label>
  );
}

const inputClass = "min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-[#245c55] focus:ring-2 focus:ring-[#245c55]/15";

export default function EventForm({ organization, event = null, venues = [], initialStatus = "draft", onlineMeetingUrl = "" }) {
  const [state, formAction] = useActionState(saveAdminEvent, { error: "" });
  const [imageError, setImageError] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const initialTimezone = event?.timezone || organization.timezone || "Asia/Manila";
  const initialValues = state.values || {
    event_id: event?.id || "",
    slug: event?.slug || "",
    title: event?.title || "",
    category: event?.category || "other",
    tags: event?.tags?.join(", ") || "",
    short_description: event?.short_description || "",
    description: event?.description || "",
    timezone: initialTimezone,
    start_date: localDateTime(event?.start_date, initialTimezone),
    end_date: localDateTime(event?.end_date, initialTimezone),
    registration_opens_at: localDateTime(event?.registration_opens_at, initialTimezone),
    registration_deadline: localDateTime(event?.registration_deadline, initialTimezone),
    checkin_opens_at: localDateTime(event?.checkin_opens_at, initialTimezone),
    checkin_closes_at: localDateTime(event?.checkin_closes_at, initialTimezone),
    venue_id: event?.venue_id || "",
    venue_name: !event?.venue_id ? event?.venue_name || "" : "",
    city: event?.city || "",
    capacity: event?.capacity || "",
    ticket_price: event?.ticket_price ?? "0",
    banner_url: event?.banner_url || "",
    currency: event?.currency || "PHP",
    registration_approval: event?.registration_approval || "automatic",
    online_meeting_url: onlineMeetingUrl,
    clear_online_meeting_url: false,
    waitlist_enabled: Boolean(event?.waitlist_enabled),
    status: event?.status || initialStatus,
  };

  return (
    <EventFormFields
      key={state.attempt || "initial"}
      error={state.error}
      event={event}
      formAction={formAction}
      initialValues={initialValues}
      imageError={imageError}
      imageUploading={imageUploading}
      onImageError={setImageError}
      onImageUploading={setImageUploading}
      onlineMeetingUrl={onlineMeetingUrl}
      organization={organization}
      venues={venues}
    />
  );
}

function EventFormFields({ error, event, formAction, imageError, imageUploading, initialValues, onImageError, onImageUploading, onlineMeetingUrl, organization, venues }) {
  const [values, setValues] = useState(initialValues);
  const timezone = values.timezone;

  function handleChange(event) {
    const { name, type, checked, value } = event.target;
    setValues((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function uploadCover(inputEvent) {
    const image = inputEvent.target.files?.[0];
    if (!image) return;
    onImageError("");
    onImageUploading(true);
    try {
      const body = new FormData();
      body.set("image", image);
      body.set("organization_id", organization.id);
      body.set("event_id", event?.id || "");
      const response = await fetch("/api/admin/events/cover", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not upload the event cover.");
      setValues((current) => ({ ...current, banner_url: result.url }));
    } catch (uploadError) {
      onImageError(uploadError instanceof Error ? uploadError.message : "Could not upload the event cover.");
    } finally {
      onImageUploading(false);
    }
  }

  return (
    <form action={formAction} className="space-y-7">
      <input name="event_id" type="hidden" value={values.event_id || event?.id || ""} />
      <input name="organization_id" type="hidden" value={organization.id} />
      <input name="slug" type="hidden" value={values.slug || event?.slug || ""} />
      <input name="banner_url" type="hidden" value={values.banner_url || ""} />
      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800" role="alert">
          {error}
        </p>
      )}
      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-6">
        <div className="sm:col-span-2">
          <h2 className="font-bold text-slate-900">Basic information</h2>
          <p className="mt-1 text-sm text-slate-500">Public details used on the event listing.</p>
        </div>
        <Field label="Event title">
          <input className={inputClass} maxLength={200} name="title" onChange={handleChange} required value={values.title} />
        </Field>
        <Field label="Category">
          <select className={inputClass} name="category" onChange={handleChange} value={values.category}>
            {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Tags" hint="Separate tags with commas.">
          <input className={inputClass} maxLength={1000} name="tags" onChange={handleChange} value={values.tags} />
        </Field>
        <Field label="Short description">
          <textarea className={inputClass} maxLength={280} name="short_description" onChange={handleChange} rows={2} value={values.short_description} />
        </Field>
        <Field label="Full description">
          <textarea className={inputClass} maxLength={10000} name="description" onChange={handleChange} rows={5} value={values.description} />
        </Field>
        <div className="grid gap-2 sm:col-span-2">
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
            Event cover image
            <input accept="image/jpeg,image/png,image/webp" disabled={imageUploading} onChange={uploadCover} type="file" />
            <span className="text-xs font-normal text-slate-500">JPG, PNG, or WebP; maximum 5 MB.</span>
          </label>
          {imageUploading && <p className="text-sm text-slate-600" role="status">Uploading cover image...</p>}
          {imageError && <p className="text-sm text-rose-700" role="alert">{imageError}</p>}
          {values.banner_url && (
            <div aria-label="Event cover preview" className="h-40 w-full max-w-2xl rounded-lg border border-slate-200 bg-cover bg-center" role="img" style={{ backgroundImage: `url("${values.banner_url}")` }} />
          )}
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-6">
        <div className="sm:col-span-2">
          <h2 className="font-bold text-slate-900">Date, time, and check-in</h2>
          <p className="mt-1 text-sm text-slate-500">Registration deadlines and check-in windows are separate. Times use the selected event timezone.</p>
        </div>
        <Field label="Event timezone">
          <input className={inputClass} maxLength={100} name="timezone" onChange={handleChange} required value={timezone} />
        </Field>
        <Field label="Start date and time" hint="Use a future date and time to publish this event. Past or ongoing events can be saved as drafts.">
          <input className={inputClass} name="start_date" onChange={handleChange} required type="datetime-local" value={values.start_date} />
        </Field>
        <Field label="End date and time">
          <input className={inputClass} name="end_date" onChange={handleChange} type="datetime-local" value={values.end_date} />
        </Field>
        <Field label="Registration opens">
          <input className={inputClass} name="registration_opens_at" onChange={handleChange} type="datetime-local" value={values.registration_opens_at} />
        </Field>
        <Field label="Registration deadline">
          <input className={inputClass} name="registration_deadline" onChange={handleChange} type="datetime-local" value={values.registration_deadline} />
        </Field>
        <Field label="Check-in opens">
          <input className={inputClass} name="checkin_opens_at" onChange={handleChange} type="datetime-local" value={values.checkin_opens_at} />
        </Field>
        <Field label="Check-in closes">
          <input className={inputClass} name="checkin_closes_at" onChange={handleChange} type="datetime-local" value={values.checkin_closes_at} />
        </Field>
      </section>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-6">
        <div className="sm:col-span-2">
          <h2 className="font-bold text-slate-900">Venue and registration</h2>
        </div>
        <Field label="Saved venue and seating plan" hint="Select a venue to require attendee seat selection.">
          <select className={inputClass} name="venue_id" onChange={handleChange} value={values.venue_id}>
            <option value="">No venue seat plan</option>
            {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
          </select>
        </Field>
        <Field label="Venue name (when no saved venue)">
          <input className={inputClass} maxLength={200} name="venue_name" onChange={handleChange} value={values.venue_name} />
        </Field>
        <Field label="City">
          <input className={inputClass} maxLength={120} name="city" onChange={handleChange} value={values.city} />
        </Field>
        <Field label="Capacity" hint="Leave blank for unlimited capacity.">
          <input className={inputClass} min="1" name="capacity" onChange={handleChange} type="number" value={values.capacity} />
        </Field>
        <Field label="Registration fee" hint="Paid tickets are processed through PayMongo test checkout.">
          <input className={inputClass} min="0" name="ticket_price" onChange={handleChange} step="0.01" type="number" value={values.ticket_price} />
        </Field>
        <Field label="Currency">
          <input className={inputClass} maxLength={3} minLength={3} name="currency" onChange={handleChange} pattern="[A-Za-z]{3}" required value={values.currency} />
        </Field>
        <Field label="Registration approval">
          <select className={inputClass} name="registration_approval" onChange={handleChange} value={values.registration_approval}>
            <option value="automatic">Automatic</option>
            <option value="manual">Manual approval</option>
          </select>
        </Field>
        <Field label="Private online meeting link" hint="Visible only to eligible registrants and organization members. HTTPS required.">
          <input className={inputClass} name="online_meeting_url" onChange={handleChange} pattern="https://.+" title="Enter a full URL that starts with https://" type="url" value={values.online_meeting_url} />
        </Field>
        {onlineMeetingUrl && (
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input checked={values.clear_online_meeting_url} name="clear_online_meeting_url" onChange={handleChange} type="checkbox" />
            Remove the saved private meeting link
          </label>
        )}
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input checked={values.waitlist_enabled} name="waitlist_enabled" onChange={handleChange} type="checkbox" />
          Enable waitlist when full
        </label>
      </section>

      <section className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <Field label="Event status" hint={!event ? "Only future events can be published. Choose Save as draft for an event that has already started." : undefined}>
          {event ? (
            <>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium capitalize text-slate-700">{event.status}</span>
              <input name="status" type="hidden" value={event.status} />
            </>
          ) : (
            <select className={inputClass} name="status" onChange={handleChange} value={values.status}>
              <option value="draft">Save as draft</option>
              <option value="published">Publish event</option>
            </select>
          )}
        </Field>
        <button className="rounded-md bg-[#173d39] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#245c55] disabled:cursor-wait disabled:opacity-60" disabled={imageUploading} type="submit">
          {event ? "Save event" : "Create event"}
        </button>
        <Link className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" href={event ? `/admin/events/${event.id}?organization_id=${organization.id}` : `/admin/events?organization_id=${organization.id}`}>
          Cancel
        </Link>
        {Number(event?.ticket_price) > 0 && (
          <p className="basis-full text-sm text-amber-800">Attendees will complete payment through PayMongo test checkout. Ticket status changes after payment is verified.</p>
        )}
      </section>
    </form>
  );
}
