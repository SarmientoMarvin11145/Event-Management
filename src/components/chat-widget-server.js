import ChatWidget from "@/components/chat-widget";
import { isFeatureEnabled } from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function ChatWidgetServer() {
  if (!(await isFeatureEnabled("ai-chatbot"))) return null;
  return <ChatWidget />;
}
