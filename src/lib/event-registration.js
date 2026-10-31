export function isEventRegistrationAvailable(event, now = Date.now()) {
  const startTime = new Date(event.start_date).getTime();
  const opensAt = event.registration_opens_at
    ? new Date(event.registration_opens_at).getTime()
    : null;
  const deadline = event.registration_deadline
    ? new Date(event.registration_deadline).getTime()
    : null;

  return Number.isFinite(startTime)
    && startTime > now
    && (opensAt === null || (Number.isFinite(opensAt) && opensAt <= now))
    && (deadline === null || (Number.isFinite(deadline) && deadline >= now));
}
