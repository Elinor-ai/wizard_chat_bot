/**
 * @file job-snippet-classifier.js
 * Prompt builder for classifying whether a text snippet is a job posting.
 */

/**
 * Build the prompt for job snippet classification.
 *
 * @param {Object} context - Context for the prompt
 * @param {string} [context.companyName] - Target company name
 * @param {string} [context.companyDomain] - Target company domain
 * @param {string} [context.text] - Text content to classify
 * @param {string} [context.title] - Title of the content (e.g., search result title)
 * @param {string} [context.url] - URL of the content
 * @param {string} [context.locale] - Locale hint
 * @param {number} [context.attempt] - Attempt number (0-indexed)
 * @param {boolean} [context.strictMode] - Whether to use strict JSON mode
 * @returns {string} The constructed prompt
 */
export function buildJobSnippetClassifierPrompt(context = {}) {
  const {
    companyName,
    companyDomain,
    text,
    title,
    url,
    locale,
    attempt = 0,
    strictMode = false,
  } = context;

  const guardrails = [
    "Classify whether the text is likely a job posting or hiring announcement.",
    "If it mentions careers, jobs, hiring, or open positions at the target company, it is likely a job.",
    "If the employer appears to be the target company (by name or domain match), set employerMatchesCompany = true.",
    "If not enough evidence to determine, set isLikelyJob = false and confidence low.",
    "Extract any job title, location, or employment type you can infer from the text.",
    "Return ONLY valid JSON matching the responseContract.",
  ];

  const responseContract = {
    isLikelyJob: "boolean - true if this appears to be a job posting",
    confidence: "number 0-1 - how confident you are in the classification",
    employerMatchesCompany: "boolean - true if the employer is the target company",
    inferredTitle: "string | null - job title if you can infer one",
    inferredLocation: "string | null - location if mentioned",
    inferredEmploymentType: "string | null - full_time, part_time, contract, etc.",
  };

  const strictNotes = strictMode
    ? "STRICT MODE: Previous output was invalid JSON. Return ONLY a JSON object matching responseContract with no extra text."
    : null;

  const prompt = [
    `ROLE: You are a classifier that determines whether a piece of text is a job posting.`,
    companyName ? `TARGET COMPANY: ${companyName}` : null,
    companyDomain ? `COMPANY DOMAIN: ${companyDomain}` : null,
    locale ? `LOCALE: ${locale}` : null,
    "",
    "INPUT:",
    title ? `TITLE: ${title}` : null,
    url ? `URL: ${url}` : null,
    "TEXT:",
    text ?? "(no text provided)",
    "",
    "GUARDRAILS:",
    guardrails.map((g) => `- ${g}`).join("\n"),
    "",
    "RESPONSE CONTRACT (return JSON with these fields):",
    JSON.stringify(responseContract, null, 2),
    "",
    strictNotes,
    `ATTEMPT: ${attempt}`,
  ]
    .filter(Boolean)
    .join("\n");

  return prompt;
}
