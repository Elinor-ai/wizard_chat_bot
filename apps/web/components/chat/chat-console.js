"use client";
import { useState } from "react";
import { WizardApi } from "../../lib/api-client";
import { useUser } from "../user-context";

export function ChatConsole() {
  const { user } = useUser();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      id: "system",
      role: "system",
      content:
        "Orchestrator ready. Ask for asset tweaks, channel plans, or interview packets. Responses stream from the backend.",
    },
  ]);

  const handleSubmit = async () => {
    if (!input.trim()) return;
    if (!user) {
      setMessages((current) => [
        ...current,
        {
          id: `auth-${Date.now()}`,
          role: "system",
          content: "Please sign in to chat with the orchestrator."
        }
      ]);
      return;
    }

    const newMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: input,
    };
    setMessages((current) => [...current, newMessage]);
    setInput("");

    const response = await WizardApi.sendChatMessage(
      {
        message: input,
        history: messages,
      },
      { userId: user.id }
    );

    setMessages((current) => [
      ...current,
      {
        id: response.id,
        role: "assistant",
        content: response.reply,
        cost: response.costBreakdown.totalCredits,
      },
    ]);
  };

  return (
    <section className="grid h-[600px] grid-rows-[1fr_auto] rounded-3xl border border-neutral-200 bg-white shadow-sm shadow-neutral-100">
      <div className="overflow-y-auto p-6">
        <ul className="space-y-4 text-sm text-neutral-700">
          {messages.map((message) => (
            <li key={message.id} className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {message.role}
              </p>
              <p className="whitespace-pre-wrap text-neutral-700">
                {message.content}
              </p>
              {message.cost ? (
                <p className="text-[11px] text-primary-500">
                  Cost: {message.cost} credits
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-3 border-t border-neutral-200 bg-neutral-50 p-4">
        <textarea
          className="flex-1 resize-none rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-700 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          rows={2}
          placeholder="Ask the orchestrator to generate a TikTok script for the hiring campaign…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <button
          type="button"
          onClick={handleSubmit}
          className="rounded-full bg-primary-600 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-primary-300"
          disabled={!user}
        >
          {user ? "Send" : "Sign in to chat"}
        </button>
      </div>
    </section>
  );
}
