import { llmLogger } from "../logger.js";
import { JOB_FIELD_GUIDE, JOB_REQUIRED_FIELDS } from "../domain/job-fields.js";

export function buildSuggestionInstructions(context = {}) {
  const strictNotes = context?.strictMode
    ? "Previous output was not valid JSON. You MUST return a single JSON object that exactly matches the responseContract. Do not include text before or after the JSON object."
    : null;
  const companyContextStr = context.companyContext
    ? `COMPANY CONTEXT (Use this to align tone, benefits, and industry):\n${context.companyContext}`
    : "No specific company context provided. Use industry standards for top-tier tech companies.";
  let updateGuidance = "";
  if (context.updatedFieldId && context.updatedFieldId !== "unknown") {
    updateGuidance = `USER ACTION: The user just updated the field "${context.updatedFieldId}".
    IMMEDIATE TASK: Re-evaluate dependent fields based on this change.
    - If "roleTitle" changed, suggest matching "coreDuties" and "seniorityLevel".
    - If "location" changed, update "currency" or "salary" norms.
    - If "industry" changed, adjust the jargon in "mustHaves".`;
  }
  const payloadObject = {
    role: "You are a Senior Talent Acquisition Specialist and Hiring Strategist.",
    mission:
      "Review the job draft and proactively fill in missing or weak fields. Your goal is to maximize conversion rate (applicants) by being specific, authentic, and avoiding generic recruiting clichés.",
    context_layer: {
      company_profile: companyContextStr,
      trigger_event: updateGuidance || "Routine auto-fill check.",
    },
    guardrails: [
      "SMART OVERWRITE: You may suggest values for non-empty fields ONLY if the existing content meets these 'Low Quality' criteria:",
      "1. Placeholders: Words like 'TBD', 'n/a', 'TODO', 'fill later', or 'copy from doc'.",
      "2. Too Short/Vague: Descriptions under 10 characters (e.g., 'good job') or single words for complex fields.",
      "3. Gibberish: Random strings like 'asdf' or 'test'.",
      "PRESERVATION RULE: If the user's text is a valid, coherent attempt (even if short or imperfect), DO NOT overwrite it. Treat it as the source of truth.",
      "When you infer a value, explain the logic in the rationale so the employer can decide whether to accept it.",
      "Only return fields defined in the jobSchema. Ignore anything outside that contract.",
      "If visibleFieldIds are provided, suggest values only for those fields unless you have a high-confidence improvement elsewhere.",
      "Return exactly one JSON object. Do not include commentary or characters after the closing brace.",
      "Do not leave trailing commas before closing brackets or braces; ensure the JSON parses with JSON.parse().",
    ],
    responseContract: {
      autofill_candidates: [
        {
          fieldId: "string (must match jobSchema ids)",
          value: "string | string[] | number",
          rationale:
            "string (concise reason: 'Based on [City] market rates' or 'Standard for [Role]')",
          confidence: "number (0.0 to 1.0)",
          source: "expert-assistant",
        },
      ],
    },

    exampleResponse: {
      autofill_candidates: [
        {
          fieldId: "coreDuties",
          value: [
            "Design and build scalable RESTful APIs using Node.js.",
            "Mentor junior engineers and conduct code reviews.",
            "Collaborate with Product Managers to define roadmap milestones.",
          ],
          rationale:
            "Standard senior backend responsibilities adapted for a SaaS product context.",
          confidence: 0.95,
          source: "expert-assistant",
        },
        {
          fieldId: "salary",
          value: "$140,000 - $170,000",
          rationale:
            "Market rate for Senior Backend Engineer in Tel Aviv/Remote US.",
          confidence: 0.8,
          source: "expert-assistant",
        },
      ],
    },

    jobSchema: JOB_FIELD_GUIDE,
    requiredFields: JOB_REQUIRED_FIELDS,

    // Context passing
    visibleFieldIds:
      Array.isArray(context.visibleFieldIds) &&
      context.visibleFieldIds.length > 0
        ? context.visibleFieldIds
        : null,
    currentJob: context.jobSnapshot ?? {},
    previousSuggestions: context.previousSuggestions ?? {},
    attempt: context.attempt ?? 0,
    retryGuidance: strictNotes,
  };

  const payload = JSON.stringify(payloadObject, null, 2);

  llmLogger.info(
    {
      task: "suggest",
      contextSize: payload.length,
      updatedField: context.updatedFieldId,
    },
    "LLM suggestion prompt built"
  );

  return payload;
}
