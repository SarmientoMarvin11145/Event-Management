import { convertToModelMessages, createUIMessageStreamResponse, stepCountIs, streamText, toUIMessageStream, tool } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const maxDuration = 30;

// Simple in-memory guest rate limit: 20 requests per IP per hour.
// For production, replace with Redis / Supabase table.
const guestHits = new Map();

function guestRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const entry = guestHits.get(ip);
  if (!entry || now - entry.start > windowMs) {
    guestHits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  guestHits.set(ip, entry);
  return entry.count > 20;
}

export async function POST(req) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (guestRateLimited(ip)) {
      return new Response("Rate limit reached. Please sign in or try again later.", { status: 429 });
    }
  }

  const { messages } = await req.json();

  const result = streamText({
    model: google("gemini-3.8-flash"),
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(20_000),
    onError({ error }) {
      console.error("KURO Assistant model request failed.", error);
    },
    system:
      "You are KURO Assistant. Help users with events, tickets, certificates, " +
      "and account questions in this app. Reply in the language the user writes in " +
      "(English, Filipino, or Cebuano). If you are unsure, say so and suggest the Help page.",
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(3),
    tools: {
      searchEvents: tool({
        description: "Search upcoming published events by keyword or city",
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          const { data } = await supabase
            .from("events")
            .select("title, slug, start_date, city, venue_name")
            .eq("status", "published")
            .gte("start_date", new Date().toISOString())
            .or(`title.ilike.%${query}%,city.ilike.%${query}%`)
            .limit(5);
          return data ?? [];
        },
      }),
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError() {
        return "KURO Assistant is temporarily unable to connect. Please check your connection and try again.";
      },
    }),
  });
}
