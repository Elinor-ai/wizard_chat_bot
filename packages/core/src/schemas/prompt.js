import { z } from "zod";

export const PromptSchema = z.object({
  id: z.string(),
  version: z.string(),
  template: z.string(),
  variables: z.array(z.string()),
  guardrails: z.object({
    schema: z.unknown().optional(),
    maxTokens: z.number().optional(),
    temperature: z.number().optional()
  })
});
