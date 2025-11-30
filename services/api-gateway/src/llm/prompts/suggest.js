import { llmLogger } from "../logger.js";
import { JOB_FIELD_GUIDE, JOB_REQUIRED_FIELDS } from "../domain/job-fields.js";

export function buildSuggestionInstructions(context = {}) {
  const {
    companyContext = "",
    visibleFieldIds = null,
    jobSnapshot = {},
    previousSuggestions = {},
    updatedFieldId,
    updatedFieldValue,
    attempt = 0,
    strictMode = false,
  } = context;

  const strictNotes = context?.strictMode
    ? "Previous output was not valid JSON. You MUST return a single JSON object that exactly matches the responseContract. Do not include text before or after the JSON object."
    : null;
  const companyContextStr = companyContext
    ? `COMPANY CONTEXT (reflect industry, tone, and realities for this company):\n${companyContext}`
    : "COMPANY CONTEXT: None provided. Default to realistic assumptions for the stated industry and role type (hospitality vs tech vs logistics).";

  const updateGuidance =
    updatedFieldId && updatedFieldId !== "unknown"
      ? `USER ACTION: field "${updatedFieldId}" was updated${updatedFieldValue ? ` to "${String(updatedFieldValue)}"` : ""}. Reassess dependent fields (work model, duties, compensation, skills).`
      : "USER ACTION: Routine auto-fill check.";

  const focusFields =
    Array.isArray(visibleFieldIds) && visibleFieldIds.length > 0
      ? `VISIBLE TARGET FIELDS: ${visibleFieldIds.join(", ")}`
      : "VISIBLE TARGET FIELDS: All optional fields.";

  const guardrails = [
    "PRESERVE user intent. Only overwrite if the current value is empty, placeholder text (TBD/n/a/???), gibberish, or < 10 chars for a descriptive field.",
    "ALIGN WITH REALITY: Respect workModel and role type. If workModel is on_site/hybrid or the duties require physical presence (hospitality, retail, manufacturing), DO NOT suggest remote-only patterns. If workModel is remote, avoid on-site-only language.",
    "LOCATION AWARE: Use the provided location/currency to keep compensation and benefits region-appropriate. Do not mix geographies or currencies.",
    "COMPANY FIT: Use the company context to influence examples, jargon, and benefits. A cafe/restaurant has different duties/benefits than a tech startup.",
    "NO HALLUCINATIONS: Do not invent technologies, products, or perks not implied by the job/company. Skip uncertain fields rather than guessing.",
    "CONCISE: Keep rationale short and specific: explain why this value matches the role/location/company.",
    "OUTPUT: Return exactly one JSON object matching responseContract. No prose before/after. No trailing commas.",
  ];

  const responseContract = {
    autofill_candidates: [
      {
        fieldId: "string (must match jobSchema ids)",
        value: "string | string[] | number",
        rationale:
          "string (concise reason: 'Based on [City] market rates' or 'Standard for [Role] in hospitality')",
        confidence: "number (0.0 to 1.0)",
        source: "expert-assistant",
      },
    ],
  };

  const exampleResponse = {
    autofill_candidates: [
      {
        fieldId: "coreDuties",
        value: [
          "Run the front counter and drive-thru with friendly, fast service.",
          "Maintain food safety and cleanliness to brand standards.",
          "Train new hires on prep stations and closing routines.",
        ],
        rationale:
          "Typical responsibilities for a quick-service restaurant team lead.",
        confidence: 0.9,
        source: "expert-assistant",
      },
      {
        fieldId: "workModel",
        value: "on_site",
        rationale:
          "Hospitality roles are performed on location; remote is not viable.",
        confidence: 0.95,
        source: "expert-assistant",
      },
    ],
  };

  const payload = [
    "ROLE: You are a Senior Talent Acquisition Specialist and Hiring Strategist.",
    "MISSION: Proactively fill missing or weak fields to maximize candidate clarity and conversion.",
    companyContextStr,
    updateGuidance,
    focusFields,
    "QUALITY GUARDRAILS:",
    guardrails.map((line) => `- ${line}`).join("\n"),
    "JOB SCHEMA (reference only):",
    JSON.stringify(JOB_FIELD_GUIDE, null, 2),
    "REQUIRED FIELDS:",
    JSON.stringify(JOB_REQUIRED_FIELDS, null, 2),
    "CURRENT JOB SNAPSHOT (source of truth; do not conflict):",
    JSON.stringify(jobSnapshot ?? {}, null, 2),
    "PREVIOUS SUGGESTIONS (avoid repetition):",
    JSON.stringify(previousSuggestions ?? {}, null, 2),
    "RESPONSE CONTRACT (must match exactly):",
    JSON.stringify(responseContract, null, 2),
    "EXAMPLE RESPONSE (follow structure, not content):",
    JSON.stringify(exampleResponse, null, 2),
    strictNotes ? `RETRY GUIDANCE: ${strictNotes}` : "",
    `ATTEMPT: ${attempt}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  llmLogger.info(
    {
      task: "suggest",
      contextSize: payload.length,
      updatedField: updatedFieldId,
    },
    "LLM suggestion prompt built"
  );

  return payload;
}
