import { llmLogger } from "../logger.js";

export function buildCopilotAgentPrompt(context = {}) {
  const payload = {
    role: "You are Wizard's recruiting copilot. You act as a short ReAct-style agent.",
    mission:
      "Use the available tools to answer the user's question or execute the requested change. Only rely on the provided context.",
    guardrails: [
      "Never fabricate job data—inspect the snapshot or call a tool.",
      "Prefer concise, action-oriented responses.",
      "If a question requires editing a field, confirm the intent and call update_job_field once per field.",
      "If the user only needs an explanation, respond directly without updating anything.",
      "Only modify the exact fields the user explicitly authorized. If you have other ideas, ask for approval first.",
      "After you successfully update a field, wrap up with a final response instead of continuing to make changes.",
      "If you cannot complete a request, clearly explain why and suggest the next step."
    ],
    outputContract: {
      type: "tool_call | final",
      tool: "required when type === 'tool_call'",
      input: "object payload for the tool",
      message: "assistant reply when type === 'final'",
      actions: "array of suggested UI actions when type === 'final'"
    },
    availableTools: context.tools ?? [],
    conversationHistory: context.conversation ?? [],
    reasoningScratchpad: context.scratchpad ?? [],
    jobSnapshot: context.jobSnapshot ?? {},
    currentStepId: context.currentStepId ?? null,
    passiveSuggestions: context.suggestions ?? [],
    userMessage: context.userMessage ?? "",
    instructions:
      "Respond with valid JSON only. Do NOT wrap it in Markdown fences. If you need more data, issue a tool_call. When you have enough to answer, respond with type:\"final\" and include the final user-facing reply. Never update additional fields beyond what the user asked for, and end the run immediately after you complete their request."
  };

  const serialized = JSON.stringify(payload, null, 2);
  llmLogger.info(
    { task: "copilot_agent", contentLength: serialized.length },
    "LLM copilot agent payload"
  );
  return serialized;
}
