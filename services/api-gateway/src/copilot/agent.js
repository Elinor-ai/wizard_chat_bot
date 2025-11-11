export class WizardCopilotAgent {
  constructor({ llmClient, tools, logger, maxTurns = 4 }) {
    this.llmClient = llmClient;
    this.tools = tools;
    this.logger = logger;
    this.maxTurns = maxTurns;
    this.toolMap = new Map(tools.map((tool) => [tool.name, tool]));
  }

  async run({
    jobId,
    userId,
    userMessage,
    currentStepId,
    conversation,
    jobSnapshot,
    suggestions,
    toolContext
  }) {
    const scratchpad = [];
    const appliedActions = [];

    for (let turn = 0; turn < this.maxTurns; turn += 1) {
      const llmResult = await this.llmClient.runCopilotAgent({
        jobId,
        userId,
        userMessage,
        currentStepId,
        conversation,
        jobSnapshot,
        suggestions,
        scratchpad,
        tools: this.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          schema: tool.schemaDescription
        }))
      });

      if (!llmResult || llmResult.error) {
        this.logger?.warn({ jobId, turn, error: llmResult?.error }, "Copilot agent LLM error");
        break;
      }

      if (llmResult.type === "tool_call") {
        const toolName = llmResult.tool;
        const tool = this.toolMap.get(toolName);
        if (!tool) {
          scratchpad.push({
            type: "tool_error",
            tool: toolName,
            error: `Unknown tool: ${toolName}`
          });
          continue;
        }
        try {
          const parsedInput = tool.schema.parse(llmResult.input ?? {});
          const result = await tool.execute(
            {
              ...toolContext,
              cache: toolContext.cache ?? (toolContext.cache = {}),
              jobId,
              userId
            },
            parsedInput
          );
          scratchpad.push({
            type: "tool_result",
            tool: toolName,
            input: parsedInput,
            result
          });
          if (result?.action) {
            appliedActions.push(result.action);
          }
          continue;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          scratchpad.push({
            type: "tool_error",
            tool: toolName,
            input: llmResult.input ?? {},
            error: message
          });
          this.logger?.warn({ jobId, tool: toolName, error: message }, "Copilot tool execution failed");
          continue;
        }
      }

      if (llmResult.type === "final") {
        return {
          reply:
            llmResult.message && llmResult.message.trim().length > 0
              ? llmResult.message.trim()
              : "All set. Let me know what else you’d like to adjust.",
          actions: appliedActions,
          scratchpad
        };
      }
    }

    return {
      reply:
        "I hit a snag while reasoning through that. Could you restate or guide me toward a specific field?",
      actions: appliedActions,
      scratchpad
    };
  }
}
