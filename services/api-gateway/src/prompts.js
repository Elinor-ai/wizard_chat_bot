import { z } from "zod";
import { PromptRegistry } from "@wizard/llm";

export function createPromptRegistry() {
  const registry = new PromptRegistry();

  registry.register({
    id: "wizard.suggestion.step",
    version: "wizard.suggestion.step.v1",
    template: `
You are Wizard's recruiting copilot. You receive the following JSON inputs:
- Draft state: {{draftState}}
- Current step identifier: {{currentStepId}}
- Market intelligence: {{marketIntelligence}}

Return ONLY a JSON object with a "suggestions" array. Each suggestion must contain:
- id (string)
- fieldId (string)
- proposal (string)
- rationale (string)
- confidence (number between 0 and 1)

Do not add narrative text, recommendations, or commentary. Output strictly structured JSON.`.trim(),
    variables: ["draftState", "currentStepId", "marketIntelligence"],
    guardrails: {
      schema: {
        suggestions: z
          .array(
            z.object({
              id: z.string(),
              fieldId: z.string(),
              proposal: z.string(),
              rationale: z.string(),
              confidence: z.number().min(0).max(1)
            })
          )
          .default([])
      }
    }
  });

  return registry;
}
