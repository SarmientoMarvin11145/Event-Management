"use client";

import { useState } from "react";
import { REGISTRATION_FIELD_TYPES } from "@/lib/registration-form";

const inputClass = "min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 font-normal";

export default function RegistrationFormBuilder({ initialFields = [] }) {
  const [fields, setFields] = useState(Array.isArray(initialFields) ? initialFields : []);

  function updateField(index, updates) {
    setFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...updates } : field));
  }

  function addField() {
    if (fields.length >= 20) return;
    setFields((current) => [...current, {
      id: `question_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
      label: "",
      type: "short_text",
      required: false,
      options: ["Option 1", "Option 2"],
    }]);
  }

  function removeField(index) {
    setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index));
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900">Registration form</h2>
          <p className="mt-1 text-sm leading-5 text-slate-500">Add up to 20 questions. Attendee name and verified email are collected separately.</p>
        </div>
        <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={fields.length >= 20} onClick={addField} type="button">Add question</button>
      </div>
      <input name="registration_form" type="hidden" value={JSON.stringify(fields)} />
      <div className="mt-4 grid gap-4">
        {fields.map((field, index) => (
          <article className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-2" key={field.id}>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700 sm:col-span-2">
              Question
              <input className={inputClass} maxLength={160} onChange={(event) => updateField(index, { label: event.target.value })} placeholder="e.g. What is your organization?" required value={field.label} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Answer type
              <select className={inputClass} onChange={(event) => updateField(index, { type: event.target.value })} value={field.type}>
                {REGISTRATION_FIELD_TYPES.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700">
              <input checked={field.required} onChange={(event) => updateField(index, { required: event.target.checked })} type="checkbox" />
              Required question
            </label>
            {["dropdown", "single_choice", "checkboxes"].includes(field.type) && (
              <label className="grid gap-1.5 text-sm font-semibold text-slate-700 sm:col-span-2">
                Options (one per line, up to 30)
                <textarea className={inputClass} maxLength={4000} onChange={(event) => updateField(index, { options: event.target.value.split("\n").map((option) => option.trim()).filter(Boolean).slice(0, 30) })} rows={3} value={(field.options || []).join("\n")} />
              </label>
            )}
            <button className="justify-self-start text-sm font-semibold text-rose-700 hover:underline sm:col-span-2" onClick={() => removeField(index)} type="button">Remove question</button>
          </article>
        ))}
        {!fields.length && <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">No custom questions yet. Guests will provide their name and verify their email.</p>}
      </div>
    </section>
  );
}
