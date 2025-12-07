"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GoldenInterviewApi } from "../../lib/api-client";
import { useUser } from "../user-context";
import { getComponent } from "./registry";

/**
 * ChatInterface - Standalone Golden Interview UI
 *
 * This component is completely independent - no Wizard dependencies.
 * On mount, it calls /golden-interview/start to create a fresh session.
 * The agent will ask for company/role context as its first question.
 *
 * Features:
 * - Auto-initializes session on mount
 * - Conversational chat with dynamic UI components
 * - Handles both text input and rich interactive inputs from registry
 * - Auto-scroll, typing indicators, error handling
 */
export default function ChatInterface() {
  const { user } = useUser();
  const router = useRouter();
  const authToken = user?.authToken;

  // Session & UI state
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [currentTool, setCurrentTool] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [dynamicValue, setDynamicValue] = useState(null);
  const [error, setError] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const initRef = useRef(false);

  // Auto-scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentTool, scrollToBottom]);

  // Initialize session on mount
  useEffect(() => {
    if (!authToken || initRef.current) return;
    initRef.current = true;

    const initSession = async () => {
      setIsInitializing(true);
      setError(null);

      try {
        const response = await GoldenInterviewApi.startSession({ authToken });

        setSessionId(response.sessionId);

        // Add initial agent message if provided
        if (response.message) {
          setMessages([
            {
              id: "initial",
              role: "agent",
              content: response.message,
              timestamp: new Date(),
            },
          ]);
        }

        // Set initial tool if provided
        if (response.ui_tool) {
          setCurrentTool(response.ui_tool);
        }
      } catch (err) {
        console.error("Failed to start session:", err);
        setError(err.message || "Failed to start interview. Please try again.");
      } finally {
        setIsInitializing(false);
      }
    };

    initSession();
  }, [authToken]);

  // Focus input when ready
  useEffect(() => {
    if (!isInitializing && !currentTool && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isInitializing, currentTool]);

  // Send message to the server
  const sendMessage = useCallback(
    async (messageContent, value = null) => {
      if (!sessionId || !authToken) return;

      // Add user message to the UI
      const userMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: messageContent || formatValueForDisplay(value),
        timestamp: new Date(),
      };

      if (messageContent || value !== null) {
        setMessages((prev) => [...prev, userMessage]);
      }

      // Clear input and current tool
      setInputValue("");
      setDynamicValue(null);
      setCurrentTool(null);
      setIsTyping(true);
      setError(null);

      try {
        const response = await GoldenInterviewApi.sendMessage(
          {
            sessionId,
            message: messageContent || undefined,
            value: value !== null ? value : undefined,
          },
          { authToken }
        );

        // Add agent response
        if (response.message) {
          setMessages((prev) => [
            ...prev,
            {
              id: `agent-${Date.now()}`,
              role: "agent",
              content: response.message,
              timestamp: new Date(),
            },
          ]);
        }

        // Set new tool if provided
        if (response.ui_tool) {
          setCurrentTool(response.ui_tool);
        }
      } catch (err) {
        console.error("Failed to send message:", err);
        setError(err.message || "Failed to send message. Please try again.");
      } finally {
        setIsTyping(false);
      }
    },
    [sessionId, authToken]
  );

  // Handle text input submission
  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    sendMessage(inputValue.trim());
  };

  // Handle dynamic input submission
  const handleDynamicSubmit = () => {
    if (dynamicValue === null || dynamicValue === undefined) return;
    sendMessage(null, dynamicValue);
  };

  // Render dynamic input component from registry
  const renderDynamicInput = () => {
    if (!currentTool) return null;

    const Component = getComponent(currentTool.type);
    if (!Component) {
      console.warn(`Unknown component type: ${currentTool.type}`);
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Unknown input type: {currentTool.type}
        </div>
      );
    }

    const props = currentTool.props || {};

    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Component
            {...props}
            value={dynamicValue}
            onChange={setDynamicValue}
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleDynamicSubmit}
            disabled={dynamicValue === null || dynamicValue === undefined}
            className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  // Loading state - initializing session
  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-2xl shadow-lg">
            ✨
          </div>
          <div className="h-1 w-32 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-primary-500" />
          </div>
          <p className="text-sm text-slate-600">Starting your interview...</p>
        </div>
      </div>
    );
  }

  // Error state - failed to initialize
  if (!sessionId && error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">
            Unable to Start Interview
          </h2>
          <p className="mb-6 text-sm text-slate-600">{error}</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => {
                initRef.current = false;
                setError(null);
                setIsInitializing(true);
                // Trigger re-init
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-700"
            >
              Try Again
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-lg">
              ✨
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-900">
                Golden Interview
              </h1>
              <p className="text-xs text-slate-500">
                Let&apos;s capture what makes your role unique
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            title="Exit interview"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Chat Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <div className="space-y-6">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-sm">
                  ✨
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                  </div>
                </div>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
                <button
                  onClick={() => setError(null)}
                  className="ml-2 font-medium underline hover:no-underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Dynamic Input Area */}
            {currentTool && !isTyping && (
              <div className="pt-2">{renderDynamicInput()}</div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </main>

      {/* Text Input (shown when no dynamic tool is active) */}
      {!currentTool && !isTyping && sessionId && (
        <footer className="sticky bottom-0 border-t border-slate-200 bg-white/80 backdrop-blur-sm">
          <form
            onSubmit={handleTextSubmit}
            className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type your response..."
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-100"
            />
            <button
              type="submit"
              disabled={!inputValue.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm transition-all hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </form>
        </footer>
      )}
    </div>
  );
}

/**
 * Format a value for display in the chat
 */
function formatValueForDisplay(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    // Try to create a readable summary
    const entries = Object.entries(value);
    if (entries.length <= 3) {
      return entries.map(([k, v]) => `${k}: ${v}`).join(", ");
    }
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * MessageBubble - Renders individual chat messages
 */
function MessageBubble({ message }) {
  const isAgent = message.role === "agent";

  return (
    <div
      className={`flex items-start gap-3 ${isAgent ? "" : "flex-row-reverse"}`}
    >
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${
          isAgent
            ? "bg-gradient-to-br from-primary-500 to-primary-600"
            : "bg-slate-700"
        }`}
      >
        {isAgent ? "✨" : "👤"}
      </div>

      {/* Message content */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
          isAgent
            ? "rounded-tl-sm bg-white text-slate-800"
            : "rounded-tr-sm bg-primary-600 text-white"
        }`}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.content}
        </p>
      </div>
    </div>
  );
}
