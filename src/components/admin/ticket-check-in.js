"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function TicketCheckIn({ events, selectedEventId }) {
  const [eventId, setEventId] = useState(selectedEventId);
  const [qrToken, setQrToken] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanningRef = useRef(false);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const checkIn = useCallback(async (token) => {
    if (!eventId || !token || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/admin/registrations/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, qrToken: token.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Ticket could not be checked in.");
      setResult(payload.ticket);
      setQrToken("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ticket could not be checked in.");
    } finally {
      setBusy(false);
    }
  }, [busy, eventId]);

  useEffect(() => {
    if (!cameraActive || !videoRef.current) return undefined;
    let active = true;
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        return videoRef.current.play();
      })
      .catch((cameraError) => {
        if (active) {
          setError(cameraError instanceof Error ? cameraError.message : "Could not start the camera.");
          setCameraActive(false);
        }
      });

    async function scan() {
      if (!active || scanningRef.current || !videoRef.current || videoRef.current.readyState < 2) {
        if (active) requestAnimationFrame(scan);
        return;
      }
      scanningRef.current = true;
      try {
        const codes = await detector.detect(videoRef.current);
        const token = codes.find((code) => code.format === "qr_code")?.rawValue;
        if (token) {
          setCameraActive(false);
          await checkIn(token);
          return;
        }
      } catch {
        setError("Could not read the QR code. Try entering its value manually.");
      } finally {
        scanningRef.current = false;
      }
      if (active) requestAnimationFrame(scan);
    }
    requestAnimationFrame(scan);
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [cameraActive, checkIn]);

  function toggleCamera() {
    if (cameraActive) {
      setCameraActive(false);
      return;
    }
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
      setError("QR camera scanning is not supported in this browser. Enter the QR value manually.");
      return;
    }
    setError("");
    setCameraActive(true);
  }

  return (
    <div className="space-y-5">
      <label className="grid max-w-xl gap-2 text-sm font-semibold text-slate-700" htmlFor="check-in-event">
        Event
        <select className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal" id="check-in-event" onChange={(event) => setEventId(event.target.value)} value={eventId}>
          <option value="">Select an event</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
        </select>
      </label>
      {cameraActive && <video aria-label="Ticket QR scanner" autoPlay className="w-full max-w-xl rounded-xl bg-black" playsInline ref={videoRef} />}
      <div className="flex flex-wrap gap-2">
        <button className="rounded-md bg-[#173d39] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!eventId || busy} onClick={toggleCamera} type="button">
          {cameraActive ? "Stop camera" : "Scan with camera"}
        </button>
      </div>
      <form className="flex max-w-xl flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); checkIn(qrToken); }}>
        <label className="sr-only" htmlFor="ticket-qr-token">Ticket QR code value</label>
        <input autoComplete="off" className="min-w-60 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!eventId || busy} id="ticket-qr-token" onChange={(event) => setQrToken(event.target.value)} placeholder="Or enter scanned QR value" value={qrToken} />
        <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={!eventId || !qrToken.trim() || busy} type="submit">{busy ? "Verifying..." : "Verify ticket"}</button>
      </form>
      {error && <p className="max-w-xl rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
      {result && <section className="max-w-xl rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-950" role="status">
        <p className="text-xs font-bold uppercase tracking-wide">Check-in successful</p>
        <p className="mt-1 font-semibold">{result.attendee_name || "Attendee"} · {result.ticket_number}</p>
        <p className="mt-1 text-sm">{result.event_name}</p>
      </section>}
    </div>
  );
}
