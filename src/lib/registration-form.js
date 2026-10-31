export const REGISTRATION_FIELD_TYPES = [
  ["short_text", "Short text"],
  ["long_text", "Long text"],
  ["number", "Number"],
  ["date", "Date"],
  ["dropdown", "Dropdown"],
  ["single_choice", "Single choice"],
  ["checkboxes", "Checkboxes"],
];

export function validateRegistrationForm(form, answers, { validateAnswers = true } = {}) {
  if (!Array.isArray(form) || form.length > 20) throw new Error("This event registration form is invalid.");
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw new Error("Registration answers are invalid.");
  const allowedTypes = new Set(REGISTRATION_FIELD_TYPES.map(([type]) => type));
  const validIds = new Set();
  for (const field of form) {
    if (
      !field ||
      typeof field.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,40}$/.test(field.id) ||
      validIds.has(field.id) ||
      typeof field.label !== "string" ||
      field.label.trim().length < 1 ||
      field.label.length > 160 ||
      !allowedTypes.has(field.type) ||
      typeof field.required !== "boolean"
    ) {
      throw new Error("This event registration form contains an invalid question.");
    }
    validIds.add(field.id);
    if (["dropdown", "single_choice", "checkboxes"].includes(field.type)) {
      if (!Array.isArray(field.options) || field.options.length < 1 || field.options.length > 30 ||
        field.options.some((option) => typeof option !== "string" || !option.trim() || option.length > 120)) {
        throw new Error(`Add valid options for "${field.label}".`);
      }
    }
    const value = answers[field.id];
    if (!validateAnswers) continue;
    const hasValue = Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && String(value).trim() !== "";
    if (field.required && !hasValue) throw new Error(`Answer the required question: ${field.label}.`);
    if (!hasValue) continue;
    if (field.type === "checkboxes") {
      if (!Array.isArray(value) || value.some((selected) => !field.options.includes(selected))) {
        throw new Error(`Choose valid options for "${field.label}".`);
      }
    } else if (["dropdown", "single_choice"].includes(field.type) && !field.options.includes(value)) {
      throw new Error(`Choose a valid option for "${field.label}".`);
    } else if (field.type === "number" && !Number.isFinite(Number(value))) {
      throw new Error(`Enter a valid number for "${field.label}".`);
    } else if (field.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00`)))) {
      throw new Error(`Enter a valid date for "${field.label}".`);
    } else if (typeof value === "string" && value.length > (field.type === "long_text" ? 5000 : 500)) {
      throw new Error(`The answer for "${field.label}" is too long.`);
    }
  }
  for (const key of Object.keys(answers)) {
    if (!validIds.has(key)) throw new Error("Registration contains an unknown answer.");
  }
}
