import { llmLogger } from "../logger.js";
import {
  JOB_FIELD_GUIDE,
  JOB_REQUIRED_FIELDS,
} from "../domain/job-fields.js";

export function buildSuggestionInstructions(context = {}) {
  const strictNotes = context?.strictMode
    ? "Previous output was not valid JSON. You MUST return a single JSON object that exactly matches the responseContract. Do not include text before or after the JSON object."
    : null;
  const payloadObject = {
    role: "You are an expert recruitment assistant helping employers craft world-class job postings.",
    mission:
      "Analyse the partially completed job data and suggest polished values for any remaining fields so the final posting is compelling and ready for distribution.",
    guardrails: [
      "Never overwrite fields that already contain strong employer-provided content unless explicitly asked; focus on gaps.",
      "Use concise, candidate-friendly language that fits the field type.",
      "When you infer a value, explain the logic in the rationale so the employer can decide whether to accept it.",
      "Only return fields defined in the jobSchema. Ignore anything outside that contract.",
      "If visibleFieldIds are provided, suggest values only for those fields unless you have a high-confidence improvement elsewhere.",
      "Return exactly one JSON object. Do not include commentary or characters after the closing brace.",
      "Do not leave trailing commas before closing brackets or braces; ensure the JSON parses with JSON.parse().",
    ],
    responseContract: {
      autofill_candidates: [
        {
          fieldId: "string",
          value: "string | string[] | number",
          rationale: "string explaining why the suggestion helps",
          confidence: "number between 0 and 1 indicating how confident you are",
          source: "string tag for traceability (use 'expert-assistant')",
        },
      ],
    },
    exampleResponse: {
      autofill_candidates: [
        {
          fieldId: "industry",
          value: "Software & Technology",
          rationale:
            "The company ships AI-powered products, so the industry is Software/Technology.",
          confidence: 0.9,
          source: "expert-assistant",
        },
      ],
    },
    jobSchema: JOB_FIELD_GUIDE,
    requiredFields: JOB_REQUIRED_FIELDS,
    visibleFieldIds:
      Array.isArray(context.visibleFieldIds) &&
      context.visibleFieldIds.length > 0
        ? context.visibleFieldIds
        : null,
    currentJob: context.jobSnapshot ?? {},
    previousSuggestions: context.previousSuggestions ?? {},
    updatedFieldId: context.updatedFieldId ?? null,
    attempt: context.attempt ?? 0,
    retryGuidance: strictNotes,
    companyContext: context.companyContext ?? null,
  };

  const payload = JSON.stringify(payloadObject, null, 2);
  llmLogger.info(
    { task: "suggest", content: payload, length: payload.length },
    "LLM suggestion prompt"
  );
  return payload;
}
