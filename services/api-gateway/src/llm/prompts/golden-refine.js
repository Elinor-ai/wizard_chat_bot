/**
 * Golden Refine Prompt Builder
 *
 * Builds prompts for the Golden Refine LLM task.
 * This task analyzes free-text user input and suggests improvements/alternatives.
 *
 * WHEN TO USE:
 * - Only for free-text inputs (smart_textarea, tag_input, etc.)
 * - NOT for structured inputs (sliders, multi-select, etc.)
 *
 * PURPOSE:
 * - Validate if the user's answer is appropriate for the field (can_proceed)
 * - Evaluate if the answer could be improved (quality)
 * - Suggest 2-3 alternative phrasings if improvement is possible
 */

import { llmLogger } from "../logger.js";

// =============================================================================
// SYSTEM PROMPT (Static)
// =============================================================================

const SYSTEM_PROMPT = `You are a Response Validation and Refinement Specialist for job interview data collection.

## YOUR ROLE
You analyze free-text responses that users provide during a job details interview.
You have TWO jobs:
1. **VALIDATE**: Is this a valid answer for the field? (can_proceed)
2. **REFINE**: If valid, could it be improved? (quality + suggestions)

## VALIDATION vs REFINEMENT

These are DIFFERENT concerns:

| Aspect | Question | Example |
|--------|----------|---------|
| **Validation** | Is this the RIGHT TYPE of data? | "I love pizza" is NOT a job title |
| **Refinement** | Is this WELL-PHRASED data? | "software dev" IS a job title, but could be clearer |

## DECISION MATRIX

\`\`\`
User Input             → can_proceed  → quality         → Action
──────────────────────────────────────────────────────────────────
"Senior Engineer"      → true         → "good"          → Proceed immediately
"software dev"         → true         → "could_improve" → Show suggestions
"I love pizza"         → false        → -               → Block, show error
"asdfasdf"             → false        → -               → Block, show error
"good salary"          → false*       → -               → Block (not specific for salary field)
"$85,000"              → true         → "good"          → Proceed immediately
\`\`\`

*For salary fields, "good salary" is not specific enough to proceed.

## VALIDATION RULES (can_proceed)

Set \`can_proceed: false\` when:
- The response is completely unrelated to the field (gibberish, off-topic)
- The response type doesn't match the field (text when number expected, etc.)
- The response is too vague to be useful for this specific field
- The response appears to be a test/joke input

Set \`can_proceed: true\` when:
- The response is a valid attempt to answer the question
- Even if brief or imperfect, it's the right TYPE of data
- The user clearly understood what was being asked

## QUALITY RULES (when can_proceed=true)

Set \`quality: "good"\` when:
- The response is clear, complete, and appropriate
- No meaningful improvement would change the substance
- Length is appropriate for the field type

Set \`quality: "could_improve"\` when:
- The response is valid but could be clearer
- Missing helpful details that are common to include
- Phrasing could be more professional/standard
- Grammar/spelling could be improved
- **The text could be more ATTRACTIVE/COMPELLING to candidates** (see below)

## MAKING TEXT ATTRACTIVE (Important for Job Marketing)

Remember: This data will be used to attract job candidates! Some fields benefit from being MORE ENGAGING:

| Field Type | Should Be Attractive? | Example |
|------------|----------------------|---------|
| Job Title | NO - Keep standard | "Software Engineer" not "Rockstar Ninja Coder" |
| Company Name | NO - Use official name | "Google" not "The Amazing Google" |
| Benefits/Perks | YES - Make compelling! | "Unlimited PTO + mental health days" > "PTO available" |
| Role Description | YES - Sell the opportunity | "Build products used by millions" > "Write code" |
| Culture/Values | YES - Be authentic & engaging | "We celebrate failures as learning" > "Good culture" |
| What Makes This Special | YES - Highlight uniqueness | "Only company doing X in Y space" > "Good company" |
| Growth/Career Path | YES - Paint a picture | "Many engineers promoted to staff in 2-3 years" > "Growth opportunities" |

**When suggesting improvements for "attractive" fields:**
- Transform generic statements into specific, compelling ones
- Add concrete details that make it memorable
- Use active, engaging language
- Keep authenticity - don't over-promise

## RESPONSE FORMAT

Always respond with valid JSON:
{
  "can_proceed": boolean,
  "validation_issue": "string or null - ONLY when can_proceed is false",
  "quality": "good" | "could_improve",
  "reasoning": "Brief explanation of your evaluation",
  "suggestions": [
    {
      "value": "Improved version",
      "improvement_type": "clarity" | "completeness" | "specificity" | "professionalism" | "attractiveness",
      "why_better": "Brief explanation"
    }
  ]
}

## RULES

1. \`can_proceed\` is the GATE - if false, user cannot continue
2. \`validation_issue\` explains WHY they can't proceed (required when can_proceed=false)
3. \`suggestions\` array:
   - EMPTY [] when quality is "good"
   - EMPTY [] when can_proceed is false AND no valid alternatives exist
   - **EXACTLY 2-3 suggestions** when quality is "could_improve" (NEVER just 1!)
4. Each suggestion "value" should be a COMPLETE replacement
5. Each suggestion should offer a DIFFERENT improvement approach (clarity vs specificity vs attractiveness)
6. Be helpful, not critical - users are trying their best
7. Respect user intent - don't change the meaning

## SUGGESTION DIVERSITY (IMPORTANT)

When providing suggestions, offer VARIETY:
- One suggestion focused on **clarity/professionalism**
- One suggestion focused on **specificity/detail**
- One suggestion focused on **attractiveness/engagement** (if applicable to the field)

Example for role description "I write code":
\`\`\`json
"suggestions": [
  {"value": "Software Developer", "improvement_type": "clarity", "why_better": "Standard industry title"},
  {"value": "Full-Stack Software Engineer", "improvement_type": "specificity", "why_better": "More specific about scope"},
  {"value": "Software Engineer building scalable web applications", "improvement_type": "completeness", "why_better": "Adds context about the work"}
]
\`\`\`

## FIELD-SPECIFIC GUIDANCE

- **Job Title**: Must be a recognizable job title/role name
- **Company Name**: Must be a company/organization name
- **Salary/Compensation**: Must include a number or range
- **Description fields**: Some detail is needed, but brief is OK
- **Yes/No fields**: Accept variations like "yes", "yeah", "nope", etc.`;

// =============================================================================
// FIELD CONTEXT HELPERS
// =============================================================================

/**
 * Get human-readable description of a schema field path.
 * Helps the LLM understand what type of data is expected.
 */
function getFieldContext(fieldPath) {
  const fieldContextMap = {
    // Role Overview
    "role_overview.job_title": {
      label: "Job Title",
      expectation: "A clear, standard job title (e.g., 'Senior Software Engineer', 'Restaurant Manager')",
      idealLength: "short",
      validationType: "Must be a recognizable job title or role name",
    },
    "role_overview.role_summary": {
      label: "Role Summary",
      expectation: "A brief overview of the role's purpose and main responsibilities",
      idealLength: "medium",
      validationType: "Should describe a job role",
    },
    "role_overview.company_name": {
      label: "Company Name",
      expectation: "The official company name",
      idealLength: "short",
      validationType: "Must be a company or organization name",
    },
    "role_overview.department": {
      label: "Department",
      expectation: "The department or team name",
      idealLength: "short",
      validationType: "Should be a department or team identifier",
    },

    // Financial
    "financial_reality.base_compensation.amount_or_range": {
      label: "Base Salary",
      expectation: "A specific amount or range (e.g., '$85,000', '$80k-100k')",
      idealLength: "short",
      validationType: "Must include a number or numeric range",
    },
    "financial_reality.variable_compensation.structure": {
      label: "Variable Compensation Structure",
      expectation: "How bonuses/commissions are calculated and paid",
      idealLength: "medium",
      validationType: "Should describe compensation structure",
    },

    // Time and Life
    "time_and_life.flexibility.remote_details": {
      label: "Remote Work Details",
      expectation: "Specifics about remote work policy and expectations",
      idealLength: "medium",
      validationType: "Should describe remote work arrangements",
    },

    // Environment
    "environment.physical_space.description": {
      label: "Workspace Description",
      expectation: "Description of the physical work environment",
      idealLength: "medium",
      validationType: "Should describe a workplace",
    },
    "environment.neighborhood.area_description": {
      label: "Area Description",
      expectation: "Description of the neighborhood/area where the job is located",
      idealLength: "medium",
      validationType: "Should describe a location or area",
    },

    // Culture
    "humans_and_culture.management_style.manager_description": {
      label: "Manager Description",
      expectation: "Description of the direct manager's style and background",
      idealLength: "medium",
      validationType: "Should describe a person or management style",
    },
    "humans_and_culture.values_in_practice.values_evidence": {
      label: "Values in Practice",
      expectation: "Examples of how company values are demonstrated day-to-day",
      idealLength: "long",
      validationType: "Should provide examples or evidence",
    },

    // Growth
    "growth_trajectory.career_path.promotion_path": {
      label: "Career Path",
      expectation: "Description of typical promotion/advancement paths",
      idealLength: "medium",
      validationType: "Should describe career progression",
    },

    // Role Reality
    "role_reality.day_to_day.typical_day_description": {
      label: "Typical Day",
      expectation: "Description of what a typical workday looks like",
      idealLength: "long",
      validationType: "Should describe work activities",
    },
    "role_reality.pain_points_honesty.challenges": {
      label: "Role Challenges",
      expectation: "Honest description of challenges or difficulties in the role",
      idealLength: "medium",
      validationType: "Should describe challenges or difficulties",
    },

    // Unique Value
    "unique_value.rare_offerings.what_makes_this_special": {
      label: "What Makes This Special",
      expectation: "What sets this opportunity apart from similar roles",
      idealLength: "medium",
      validationType: "Should describe unique benefits or differentiators",
    },
  };

  // Return specific context if available, otherwise generate generic context
  if (fieldContextMap[fieldPath]) {
    return fieldContextMap[fieldPath];
  }

  // Generate generic context from field path
  const parts = fieldPath.split(".");
  const fieldName = parts[parts.length - 1]
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    label: fieldName,
    expectation: `A clear, relevant response for: ${fieldName}`,
    idealLength: "medium",
    validationType: `Should be relevant to ${fieldName.toLowerCase()}`,
  };
}

/**
 * Extract the last question asked from conversation history.
 */
function getLastQuestion(conversationHistory = []) {
  // Find the last assistant message
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msg = conversationHistory[i];
    if (msg.role === "assistant" && msg.content) {
      return msg.content;
    }
  }
  return null;
}

/**
 * Extract relevant schema context (what we already know).
 * Only includes non-null top-level sections.
 */
function getRelevantSchemaContext(currentSchema = {}) {
  const relevantSections = {};

  // Include role_overview if present (always relevant)
  if (currentSchema.role_overview) {
    const { job_title, company_name, department, employment_type, location_type } =
      currentSchema.role_overview;
    if (job_title || company_name || department) {
      relevantSections.role_context = {
        job_title,
        company_name,
        department,
        employment_type,
        location_type,
      };
    }
  }

  // Include detected metadata if present
  if (currentSchema.extraction_metadata) {
    const { industry_detected, role_category_detected, seniority_detected } =
      currentSchema.extraction_metadata;
    if (industry_detected || role_category_detected || seniority_detected) {
      relevantSections.detected_context = {
        industry: industry_detected,
        role_type: role_category_detected,
        seniority: seniority_detected,
      };
    }
  }

  return Object.keys(relevantSections).length > 0 ? relevantSections : null;
}

// =============================================================================
// PROMPT BUILDERS
// =============================================================================

/**
 * Builds the user prompt for a Golden Refine request.
 *
 * @param {object} context - The context for the refine request
 * @param {string} context.userMessage - The user's free-text input to evaluate
 * @param {string} context.lastAskedField - The schema field path being answered
 * @param {object} [context.currentSchema] - Current state of the golden schema
 * @param {array} [context.conversationHistory] - Previous conversation messages
 * @param {object} [context.companyData] - Company context data
 * @returns {string} - The user prompt for the LLM
 */
export function buildGoldenRefinePrompt(context = {}) {
  const {
    userMessage = "",
    lastAskedField = null,
    currentSchema = {},
    conversationHistory = [],
    companyData = null,
  } = context;

  // Get field-specific context
  const fieldContext = lastAskedField
    ? getFieldContext(lastAskedField)
    : {
        label: "Response",
        expectation: "A clear, relevant response",
        idealLength: "medium",
        validationType: "Should be relevant to the question",
      };

  // Get the question that was asked
  const lastQuestion = getLastQuestion(conversationHistory);

  // Get relevant schema context
  const schemaContext = getRelevantSchemaContext(currentSchema);

  // Build company context section (same fields as Golden Interview)
  let companySection = "";
  if (companyData?.name || companyData?.industry) {
    const lines = [
      `- Company: ${companyData.name || "Unknown"}`,
      `- Industry: ${companyData.industry || "Unknown"}`,
    ];

    // Add optional fields if present
    if (companyData.description) {
      lines.push(`- Description: ${companyData.description}`);
    }
    if (companyData.employeeCountBucket) {
      lines.push(`- Size: ${companyData.employeeCountBucket}`);
    }
    if (companyData.companyType) {
      lines.push(`- Type: ${companyData.companyType}`);
    }
    if (companyData.tagline) {
      lines.push(`- Tagline: ${companyData.tagline}`);
    }
    if (companyData.hqCountry || companyData.hqCity) {
      const location = [companyData.hqCity, companyData.hqCountry].filter(Boolean).join(", ");
      lines.push(`- Location: ${location}`);
    }
    if (companyData.toneOfVoice) {
      lines.push(`- Brand Voice: ${companyData.toneOfVoice}`);
    }
    if (companyData.intelSummary) {
      lines.push(`- Summary: ${companyData.intelSummary}`);
    }

    companySection = `
## COMPANY CONTEXT
${lines.join("\n")}
`;
  }

  // Build role context section
  let roleSection = "";
  if (schemaContext) {
    roleSection = `
## ROLE CONTEXT (What we know so far)
${JSON.stringify(schemaContext, null, 2)}
`;
  }

  const prompt = `
## TASK
Validate and evaluate the following free-text response.

## FIELD BEING ANSWERED
- Field: ${fieldContext.label}
- Path: ${lastAskedField || "unknown"}
- Expected: ${fieldContext.expectation}
- Ideal Length: ${fieldContext.idealLength}
- Validation Rule: ${fieldContext.validationType}

## QUESTION ASKED
${lastQuestion || "Not available"}

## USER'S RESPONSE
"""
${userMessage}
"""
${companySection}${roleSection}
## YOUR TASK

**Step 1: VALIDATE (can_proceed)**
Is this a valid answer for the "${fieldContext.label}" field?
- If NO → set can_proceed=false, provide validation_issue
- If YES → continue to Step 2

**Step 2: EVALUATE QUALITY**
Is the response good as-is, or could it be improved?
- If good → set quality="good", suggestions=[]
- If could be better → set quality="could_improve", provide suggestions

## EXAMPLES FOR THIS FIELD TYPE

${fieldContext.label === "Job Title" ? `
Valid (can_proceed=true):
- "Senior Software Engineer" → quality: good
- "software dev" → quality: could_improve
- "Dev" → quality: could_improve

Invalid (can_proceed=false):
- "I love pizza" → Not a job title
- "asdfasdf" → Gibberish
- "yes" → Not a job title
` : `
Consider what type of data this field expects and whether the response matches.
`}

Respond with valid JSON only.
`.trim();

  llmLogger.info(
    {
      task: "golden_refine",
      field: lastAskedField,
      fieldLabel: fieldContext.label,
      userMessageLength: userMessage?.length || 0,
      hasCompanyData: Boolean(companyData),
      hasSchemaContext: Boolean(schemaContext),
    },
    "Golden Refine prompt built"
  );

  return prompt;
}

/**
 * Builds the system prompt for Golden Refine.
 * This is static and doesn't depend on context.
 *
 * @param {object} _context - The context (unused, kept for interface consistency)
 * @returns {string} - The system prompt
 */
export function buildGoldenRefineSystemPrompt(_context = {}) {
  return SYSTEM_PROMPT;
}
