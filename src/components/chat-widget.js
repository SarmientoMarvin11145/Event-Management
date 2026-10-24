"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";

function MessageText({ parts }) {
  const text = (parts || [])
    .filter((part) => part?.type === "text")
    .map((part) => part.text)
    .join("");
  if (!text) return null;
  return <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>;
}

export default function ChatWidget() {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const { messages, sendMessage, status, error } = useChat();
  const listRef = useRef(null);
  const containerRef = useRef(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open, busy]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    }
    function handleEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function handleSubmit(event) {
    event.preventDefault();
    if (!input.trim() || busy) return;
    sendMessage({ text: input });
    setInput("");
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3" ref={containerRef}>
      {open && (
        <div className="kuro-panel flex h-[28rem] w-[calc(100vw-2.5rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-[#dce4dc] bg-white shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-[#e8eee7] bg-[#173d39] px-4 py-3 text-white">
            <div>
              <p className="text-sm font-bold">KURO Assistant</p>
              <p className="text-xs text-white/70">Ask about events, tickets, certificates</p>
            </div>
            <button
              aria-label="Close chat"
              className="rounded-md px-2 py-1 text-lg leading-none hover:bg-white/10"
              onClick={() => setOpen(false)}
              type="button"
            >
              ×
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-[#fbfcf8] p-4" ref={listRef}>
            {messages.length === 0 && (
              <p className="rounded-xl bg-[#eef3ec] px-3 py-2 text-sm leading-6 text-[#526864]">
                Hi! Ask me about events, tickets, or certificates.
              </p>
            )}
            {messages.map((message) => (
              <div className={message.role === "user" ? "text-right" : "text-left"} key={message.id}>
                <div
                  className={`inline-block max-w-[85%] rounded-xl px-3 py-2 text-left text-sm leading-6 ${
                    message.role === "user" ? "bg-[#173d39] text-white" : "bg-[#eef3ec] text-[#173d39]"
                  }`}
                >
                  <MessageText parts={message.parts} />
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-[#7a8b84]">KURO Assistant is typing…</p>}
            {error && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                Something went wrong. Please try again or contact support.
              </p>
            )}
          </div>

          <form className="flex gap-2 border-t border-[#e8eee7] bg-white p-3" onSubmit={handleSubmit}>
            <input
              aria-label="Message KURO Assistant"
              className="kuro-input min-w-0 flex-1 rounded-lg border border-[#cbd8d1] px-3 py-2 text-sm"
              onChange={(event) => setInput(event.target.value)}
              placeholder="Type your question..."
              value={input}
            />
            <button
              className="shrink-0 rounded-lg bg-[#ed6148] px-4 py-2 text-sm font-bold text-white hover:bg-[#d74d37] disabled:opacity-50"
              disabled={busy || !input.trim()}
              type="submit"
            >
              Send
            </button>
          </form>
          <p className="bg-white px-3 pb-2 text-xs text-[#7a8b84]">AI can make mistakes.</p>
        </div>
      )}

      <button
        aria-label={open ? "Hide KURO Assistant" : "Open KURO Assistant"}
        className="flex size-14 items-center justify-center rounded-full bg-[#ed6148] text-2xl text-white shadow-xl transition hover:bg-[#d74d37]"
        onClick={() => setOpen(!open)}
        type="button"
      >
        {open ? "×" : "💬"}
      </button>
    </div>
  );
}
