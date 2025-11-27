import { llmLogger } from "../logger.js";
import { JOB_FIELD_GUIDE } from "../domain/job-fields.js";

export function buildRefinementInstructions(context = {}) {
  const strictNotes = context?.strictMode
    ? "Previous output was not valid JSON. You MUST return a single JSON object that exactly matches the responseContract."
    : null;

  const companyContextStr = context.companyContext
    ? `COMPANY BRANDING & TONE:\n${context.companyContext}`
    : "Company Context: Use a modern, professional, yet accessible tech-forward tone.";

  const payloadObject = {
    role: "You are a Conversion Copywriter and Recruitment SEO Strategist.",
    mission:
      "Take the user's rough job draft and transform it into a high-performing listing. Your goals are: 1. Maximize Click-Through Rate (CTR) from search results. 2. Increase conversion of high-quality talent. 3. Fix clarity and tone issues.",

    context_layer: {
      company_profile: companyContextStr,
      market_conditions:
        "Assume a competitive market where clear salary and remote options drive engagement.",
    },

    guidelines: [
      "SCORE CALCULATION: Start at 50. Add points for: Salary Range (+15), Remote/Hybrid clarity (+10), Action-oriented Title (+10), Exciting Hook (+10), Scannable Bullets (+5). Max score 100.",
      "CTR BOOST: If you add a salary range or fix a vague title, predict a high CTR boost (e.g., '+40%').",
      "SMART OVERWRITE: Fix spelling, grammar, and vague sections. Expand single-line descriptions into compelling hooks. Keep specific technical requirements intact.",
      "TITLE SEO: If the title is 'Dev' or 'Manager', rename it to the industry standard search term (e.g., 'Senior Full Stack Engineer').",
      "SALARY HANDLING: If the user did NOT provide a salary, DO NOT invent a number range. Instead, write a compelling value prop string in the 'salary' field like: 'Competitive + Equity & Full Benefits' or 'Top-tier Market Rate'. Make it sound premium to maintain high CTR.",
      "CHANGE DETAILS: Analyze the modifications you made and populate changeDetails with bullet-style strings for titleChanges, descriptionChanges, requirementsChanges, and any optional otherChanges entries.",
    ],

    responseContract: {
      refined_job: {
        roleTitle: "string",
        companyName: "string",
        location: "string",
        zipCode: "string (optional)",
        industry: "string",
        seniorityLevel: "string",
        employmentType: "string",
        workModel: "string",
        jobDescription: "string (The Hook)",
        coreDuties: ["string"],
        mustHaves: ["string"],
        benefits: ["string"],
        currency: "string",
        salary: "string",
        salaryPeriod: "string",
      },
      analysis: {
        improvement_score: "number (0-100)",
        original_score: "number (0-100, estimate based on input quality)",
        ctr_prediction: "string (e.g. '+25%')",
        impact_summary:
          "string (1 sentence marketing pitch of why this is better)",
        key_improvements: ["string (short bullet point)", "string"],
      },
      changeDetails: {
        titleChanges: [
          "string (why the title changed, e.g., 'Added keywords for SEO')"
        ],
        descriptionChanges: [
          "string (structure/tone improvements to the description)"
        ],
        requirementsChanges: [
          "string (clarity or formatting fixes to requirements)"
        ],
        otherChanges: ["string (optional)"]
      },
    },

    jobSchema: JOB_FIELD_GUIDE,
    jobDraft: context.jobDraft ?? {},
    attempt: context.attempt ?? 0,
    retryGuidance: strictNotes,
  };

  const payload = JSON.stringify(payloadObject, null, 2);
  llmLogger.info(
    { task: "refine", contextSize: payload.length },
    "LLM refinement prompt built"
  );
  return payload;
}
