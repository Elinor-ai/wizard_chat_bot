import { ChatConsole } from "../../../components/chat/chat-console";

export default function ChatPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-neutral-900">
          LLM orchestration console
        </h1>
        <p className="text-sm text-neutral-600">
          Inspect prompt versions, route tasks to specialized agents, and audit
          token usage in context-aware threads.
        </p>
      </header>
      <ChatConsole />
    </div>
  );
}
