"use client";

import { useState, useRef, useEffect } from "react";

/**
 * ChatSimulator - Mini chat interface with quick replies and auto-responses
 * @param {Object} props
 * @param {Array<{id: string, user?: string, bot?: string, quickReplies?: Array<string>}>} props.flow - Conversation flow
 * @param {Object} props.value - { messages: Array, currentStep: number, responses: Object }
 * @param {function} props.onChange - Callback with updated value
 * @param {string} [props.title] - Title text
 * @param {string} [props.botName="Assistant"] - Bot display name
 * @param {string} [props.botAvatar="🤖"] - Bot avatar emoji/icon
 * @param {string} [props.userAvatar="👤"] - User avatar emoji/icon
 * @param {string} [props.accentColor="#8b5cf6"] - Accent color
 */
export default function ChatSimulator({
  flow = [],
  value = { messages: [], currentStep: 0, responses: {} },
  onChange,
  title,
  botName = "Assistant",
  botAvatar = "🤖",
  userAvatar = "👤",
  accentColor = "#8b5cf6"
}) {
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const currentFlowStep = flow[value.currentStep];
  const messages = value.messages || [];

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize conversation
  useEffect(() => {
    if (messages.length === 0 && flow.length > 0) {
      const firstStep = flow[0];
      if (firstStep.bot) {
        setIsTyping(true);
        setTimeout(() => {
          onChange({
            ...value,
            messages: [{ type: "bot", text: firstStep.bot, timestamp: Date.now() }]
          });
          setIsTyping(false);
        }, 800);
      }
    }
  }, []);

  const handleSendMessage = (text) => {
    if (!text.trim()) return;

    const newMessages = [
      ...messages,
      { type: "user", text: text.trim(), timestamp: Date.now() }
    ];

    // Save response
    const newResponses = {
      ...value.responses,
      [value.currentStep]: text.trim()
    };

    // Update state with user message
    onChange({
      ...value,
      messages: newMessages,
      responses: newResponses
    });

    setInputText("");

    // Auto-respond if there's a next step
    const nextStep = value.currentStep + 1;
    if (nextStep < flow.length) {
      setIsTyping(true);
      setTimeout(() => {
        const nextFlowStep = flow[nextStep];
        if (nextFlowStep.bot) {
          onChange({
            messages: [
              ...newMessages,
              { type: "bot", text: nextFlowStep.bot, timestamp: Date.now() }
            ],
            currentStep: nextStep,
            responses: newResponses
          });
        } else {
          onChange({
            ...value,
            messages: newMessages,
            currentStep: nextStep,
            responses: newResponses
          });
        }
        setIsTyping(false);
      }, 1000 + Math.random() * 500);
    } else {
      // Conversation complete
      onChange({
        ...value,
        messages: newMessages,
        currentStep: nextStep,
        responses: newResponses
      });
    }
  };

  const handleQuickReply = (reply) => {
    handleSendMessage(reply);
  };

  const handleReset = () => {
    setIsTyping(true);
    setTimeout(() => {
      const firstStep = flow[0];
      onChange({
        messages: firstStep?.bot
          ? [{ type: "bot", text: firstStep.bot, timestamp: Date.now() }]
          : [],
        currentStep: 0,
        responses: {}
      });
      setIsTyping(false);
    }, 500);
  };

  const isComplete = value.currentStep >= flow.length;

  return (
    <div className="w-full space-y-4">
      {title && (
        <h3 className="text-lg font-semibold text-white text-center">{title}</h3>
      )}

      {/* Chat container */}
      <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
        {/* Chat header */}
        <div
          className="px-4 py-3 border-b border-white/10 flex items-center gap-3"
          style={{ backgroundColor: `${accentColor}10` }}
        >
          <span className="text-2xl">{botAvatar}</span>
          <div>
            <div className="text-white font-medium text-sm">{botName}</div>
            <div className="text-white/40 text-xs">
              {isTyping ? "Typing..." : "Online"}
            </div>
          </div>
          <div className="ml-auto">
            <div
              className={`w-2 h-2 rounded-full ${isTyping ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`}
            />
          </div>
        </div>

        {/* Messages */}
        <div className="h-64 overflow-y-auto p-4 space-y-3">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-2 ${
                message.type === "user" ? "flex-row-reverse" : ""
              }`}
            >
              <span className="text-lg flex-shrink-0">
                {message.type === "user" ? userAvatar : botAvatar}
              </span>
              <div
                className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
                  message.type === "user"
                    ? "bg-gradient-to-r text-white rounded-tr-sm"
                    : "bg-white/10 text-white/90 rounded-tl-sm"
                }`}
                style={{
                  background:
                    message.type === "user"
                      ? `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`
                      : undefined
                }}
              >
                {message.text}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex gap-2">
              <span className="text-lg">{botAvatar}</span>
              <div className="bg-white/10 px-4 py-2 rounded-2xl rounded-tl-sm">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick replies */}
        {!isComplete && currentFlowStep?.quickReplies && !isTyping && (
          <div className="px-4 pb-2 flex flex-wrap gap-2">
            {currentFlowStep.quickReplies.map((reply) => (
              <button
                key={reply}
                onClick={() => handleQuickReply(reply)}
                className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all hover:scale-105"
                style={{
                  borderColor: accentColor,
                  color: accentColor,
                  backgroundColor: `${accentColor}10`
                }}
              >
                {reply}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        {!isComplete ? (
          <div className="p-3 border-t border-white/10">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(inputText);
                  }
                }}
                disabled={isTyping}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50"
              />
              <button
                onClick={() => handleSendMessage(inputText)}
                disabled={!inputText.trim() || isTyping}
                className="px-4 py-2 rounded-full text-white font-medium text-sm transition-all disabled:opacity-50 hover:opacity-90"
                style={{ backgroundColor: accentColor }}
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 border-t border-white/10 text-center">
            <div className="text-green-400 text-sm mb-2">✓ Conversation complete</div>
            <button
              onClick={handleReset}
              className="text-white/50 text-xs hover:text-white/70 transition-colors"
            >
              Start over
            </button>
          </div>
        )}
      </div>

      {/* Progress indicator */}
      <div className="flex justify-center gap-1">
        {flow.map((_, index) => (
          <div
            key={index}
            className={`w-2 h-2 rounded-full transition-all ${
              index < value.currentStep
                ? ""
                : index === value.currentStep
                  ? "scale-125"
                  : "bg-white/20"
            }`}
            style={{
              backgroundColor:
                index <= value.currentStep ? accentColor : undefined
            }}
          />
        ))}
      </div>

      {/* Collected responses summary */}
      {Object.keys(value.responses || {}).length > 0 && (
        <div className="pt-4 border-t border-white/10">
          <div className="text-white/40 text-xs uppercase tracking-wide mb-2">
            Your Responses
          </div>
          <div className="space-y-1">
            {Object.entries(value.responses).map(([step, response]) => (
              <div key={step} className="text-sm">
                <span className="text-white/40">Q{parseInt(step) + 1}: </span>
                <span className="text-white/70">{response}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
