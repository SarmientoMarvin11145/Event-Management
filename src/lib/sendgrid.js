import "server-only";

const senderEmail = process.env.SENDGRID_FROM_EMAIL || "forcapstone903@gmail.com";
const senderName = process.env.SENDGRID_FROM_NAME || "KuroEventsOfficials";

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export async function sendSendGridEmail({ to, subject, text }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("SENDGRID_API_KEY is not configured.");
  if (typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error("A valid recipient email address is required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)) {
    throw new Error("A valid SendGrid sender email address is required.");
  }

  const safeText = String(text);
  const safeSubject = String(subject).replace(/[\r\n]+/g, " ").slice(0, 255);
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: senderEmail, name: senderName },
      subject: safeSubject,
      content: [
        { type: "text/plain", value: safeText },
        { type: "text/html", value: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#173d39">${escapeHtml(safeText).replaceAll("\n", "<br>")}</div>` },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`SendGrid rejected the email (HTTP ${response.status}).`);
  }
}
