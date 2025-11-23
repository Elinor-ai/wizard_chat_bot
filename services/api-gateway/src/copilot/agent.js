function formatFieldLabel(fieldId) {
  if (!fieldId || typeof fieldId !== "string") {
    return null;
  }
  return fieldId
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildActionSummary(actions = []) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return "I applied the requested updates. Let me know if you'd like any other tweaks.";
  }
  const updatedFields = Array.from(
    new Set(
      actions
        .map((action) => action?.fieldId)
        .filter(Boolean)
    )
  );
  if (updatedFields.length === 0) {
    return "I applied the requested updates. Let me know if you'd like any other tweaks.";
  }
  if (updatedFields.length === 1) {
    const label = formatFieldLabel(updatedFields[0]) ?? updatedFields[0];
    return `I updated ${label} as requested. Let me know if you'd like any other tweaks.`;
  }
  const joined = updatedFields
    .map((field) => formatFieldLabel(field) ?? field)
    .join(", ");
  return `I updated ${joined} as requested. Let me know if you'd like any other tweaks.`;
}

export class WizardCopilotAgent {
  constructor({ llmClient, tools, logger, maxTurns = 8, usageTracker = null }) {
    this.llmClient = llmClient;
    this.toolRegistry = new Map(tools.map((tool) => [tool.name, tool]));
    this.logger = logger;
    this.maxTurns = maxTurns;
    this.usageTracker = usageTracker;
  }

  resolveTools(tools) {
    if (Array.isArray(tools) && tools.length > 0) {
      return tools;
    }
    return Array.from(this.toolRegistry.values());
  }

  async run({
    jobId,
    userId,
    userMessage,
    currentStepId,
    stage,
    stageConfig,
    tools,
    conversation,
    jobSnapshot,
    suggestions,
    toolContext,
    companyContext
  }) {
    const scratchpad = [];
    const appliedActions = [];
    const activeTools = this.resolveTools(tools);
    const toolMap = new Map(activeTools.map((tool) => [tool.name, tool]));

    for (let turn = 0; turn < this.maxTurns; turn += 1) {
      const llmResult = await this.llmClient.runCopilotAgent({
        jobId,
        userId,
        userMessage,
        currentStepId,
        stage,
        stageConfig,
        conversation,
        jobSnapshot,
        suggestions,
        scratchpad,
        companyContext,
        tools: activeTools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          schema: tool.schemaDescription
        }))
      });
      if (this.usageTracker) {
        await this.usageTracker({
          result: llmResult,
          usageContext: {
            jobId,
            userId,
            taskType: "copilot_agent"
          }
        });
      }

      if (!llmResult || llmResult.error) {
        this.logger?.warn({ jobId, turn, error: llmResult?.error }, "Copilot agent LLM error");
        break;
      }

      if (llmResult.type === "tool_call") {
        const toolName = llmResult.tool;
        const tool = toolMap.get(toolName);
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
            return {
              reply: buildActionSummary(appliedActions),
              actions: appliedActions,
              scratchpad
            };
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

    if (appliedActions.length > 0) {
      return {
        reply: buildActionSummary(appliedActions),
        actions: appliedActions,
        scratchpad
      };
    }

    return {
      reply:
        "I hit a snag while reasoning through that. Could you restate or guide me toward a specific field?",
      actions: appliedActions,
      scratchpad
    };
  }
}
