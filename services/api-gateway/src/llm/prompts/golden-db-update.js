/**
 * Golden DB Update Prompt Builder (Saver Agent)
 *
 * This is a dedicated "Saver Agent" that runs BEFORE the chat agent.
 * Its ONLY job is to analyze the user's latest input and output a JSON
 * of fields to update in the Golden Schema DB.
 *
 * It does NOT chat. It does NOT generate UI. It is pure data extraction.
 *
 * ARCHITECTURE: Static System Prompt + Dynamic User Prompt
 * ─────────────────────────────────────────────────────────
 * The system prompt is STATIC (never changes) - enables LLM context caching.
 * All session-specific data (company, archetype, skip state) is injected via USER prompt.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                              TABLE OF CONTENTS                               ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                              ║
 * ║  1. IMPORTS .................................................... Line ~30    ║
 * ║                                                                              ║
 * ║  2. CONSTANTS .................................................. Line ~40    ║
 * ║     • GOLDEN_SCHEMA_REFERENCE (Schema fields reference)                      ║
 * ║     • INFERENCE_RULES (Auto-fill rules)                                      ║
 * ║     • STATIC_SYSTEM_PROMPT (Complete static system prompt)                   ║
 * ║                                                                              ║
 * ║  3. CONTEXT BUILDERS (For Dynamic User Prompt) ................ Line ~250   ║
 * ║     • buildCompanyContextSection()  - Company info for USER prompt           ║
 * ║     • buildRoleArchetypeSection()   - Role type awareness                    ║
 * ║     • buildSkipAwarenessSection()   - Skip/friction handling                 ║
 * ║                                                                              ║
 * ║  4. MAIN SYSTEM PROMPT ......................................... Line ~400   ║
 * ║     • buildGoldenDbUpdateSystemPrompt() - Returns STATIC prompt only         ║
 * ║                                                                              ║
 * ║  5. USER PROMPT BUILDER ........................................ Line ~420   ║
 * ║     • buildGoldenDbUpdatePrompt() - Dynamic per-turn prompt                  ║
 * ║                                                                              ║
 * ║  6. UTILITY FUNCTIONS .......................................... Line ~550   ║
 * ║     • filterSchemaForDisplay() - Clean schema for LLM                        ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

// =============================================================================
// SECTION 1: IMPORTS
// =============================================================================

import { llmLogger } from "../logger.js";

// =============================================================================
// SECTION 2: CONSTANTS
// =============================================================================

// -----------------------------------------------------------------------------
// 2.1 GOLDEN_SCHEMA_REFERENCE
// -----------------------------------------------------------------------------

const GOLDEN_SCHEMA_REFERENCE = `
## GOLDEN SCHEMA REFERENCE

### 1. FINANCIAL REALITY
The complete compensation picture.

| Field Path | Description | Type |
|------------|-------------|------|
| financial_reality.base_compensation.amount_or_range | Base salary/wage amount or range | number/string |
| financial_reality.base_compensation.pay_frequency | hourly/weekly/biweekly/monthly/annual | enum |
| financial_reality.base_compensation.currency | USD/EUR/ILS etc. | string |
| financial_reality.variable_compensation.tips | Tips expected/typical amount | boolean/number |
| financial_reality.variable_compensation.commission | Commission structure | string/object |
| financial_reality.variable_compensation.bonuses | Bonus types and amounts | object |
| financial_reality.equity.offered | Whether equity is offered | boolean |
| financial_reality.equity.type | options/RSUs/profit-sharing | string |
| financial_reality.equity.vesting_schedule | Vesting details | string |
| financial_reality.raises_and_reviews.review_frequency | How often reviews happen | string |
| financial_reality.hidden_financial_value.meals_provided | Free food/meals | boolean |
| financial_reality.payment_reliability.payment_method | Direct deposit/check/cash | string |

### 2. TIME AND LIFE
How the job fits into life.

| Field Path | Description | Type |
|------------|-------------|------|
| time_and_life.schedule_pattern.type | fixed/rotating/flexible | enum |
| time_and_life.schedule_pattern.typical_hours_per_week | Hours worked per week | number |
| time_and_life.schedule_pattern.shift_types | day/evening/night/split | array |
| time_and_life.schedule_predictability.advance_notice | How far ahead schedule is known | string |
| time_and_life.flexibility.remote_allowed | Can work remotely | boolean |
| time_and_life.flexibility.remote_frequency | full/hybrid/occasional/rare/never | enum |
| time_and_life.flexibility.async_friendly | Async work supported | boolean |
| time_and_life.time_off.pto_days | PTO days per year | number |
| time_and_life.time_off.sick_days | Sick days per year | number |
| time_and_life.commute_reality.parking_situation | Parking availability | string |
| time_and_life.break_reality.paid_breaks | Breaks are paid | boolean |
| time_and_life.overtime_reality.overtime_expected | OT frequency | string |

### 3. ENVIRONMENT
Where work happens.

| Field Path | Description | Type |
|------------|-------------|------|
| environment.physical_space.type | office/retail/warehouse/restaurant/outdoor/home | enum |
| environment.physical_space.description | Description of workspace | string |
| environment.workspace_quality.noise_level | quiet/moderate/loud | enum |
| environment.amenities.kitchen | Kitchen available | boolean |
| environment.amenities.gym | Gym available | boolean |
| environment.safety_and_comfort.physical_demands | Standing/lifting requirements | string |

### 4. HUMANS AND CULTURE
The social fabric.

| Field Path | Description | Type |
|------------|-------------|------|
| humans_and_culture.team_composition.team_size | Number of team members | number |
| humans_and_culture.team_composition.team_composition_description | Who works together day-to-day (e.g., "3 devs, 1 designer, 1 PM") | string |
| humans_and_culture.team_composition.direct_reports | Number of direct reports | number |
| humans_and_culture.management_style.management_approach | hands-off/collaborative/structured | enum |
| humans_and_culture.social_dynamics.team_bonding | Team activities | string |
| humans_and_culture.communication_culture.meeting_load | light/moderate/heavy | enum |
| humans_and_culture.turnover_context.average_tenure | How long people stay | string |

### 5. GROWTH TRAJECTORY
Future potential.

| Field Path | Description | Type |
|------------|-------------|------|
| growth_trajectory.learning_opportunities.mentorship_available | Mentorship exists | boolean |
| growth_trajectory.formal_development.training_provided | Training offered | boolean |
| growth_trajectory.formal_development.training_budget | Annual training budget | number |
| growth_trajectory.career_path.promotion_path | Typical advancement | string |
| growth_trajectory.skill_building.technologies_used | Tech stack/tools | array |

### 6. STABILITY SIGNALS
Safety and security.

| Field Path | Description | Type |
|------------|-------------|------|
| stability_signals.company_health.company_stage | startup/growth/mature/enterprise | enum |
| stability_signals.company_health.funding_status | Funding situation | string |
| stability_signals.job_security.position_type | permanent/contract/temp/freelance | enum |
| stability_signals.benefits_security.health_insurance | Health coverage offered | boolean |
| stability_signals.benefits_security.retirement_401k | 401k/retirement offered | boolean |

### 7. ROLE REALITY
The actual work.

| Field Path | Description | Type |
|------------|-------------|------|
| role_reality.day_to_day.typical_day_description | What a day looks like | string |
| role_reality.autonomy.decision_authority | Level of autonomy | string |
| role_reality.workload.intensity | light/moderate/intense | enum |
| role_reality.success_metrics.how_measured | How success is measured | string |
| role_reality.pain_points_honesty.challenges | Known challenges | string |

### 8. ROLE OVERVIEW
Basic job info.

| Field Path | Description | Type |
|------------|-------------|------|
| role_overview.job_title | The job title | string |
| role_overview.department | Department name | string |
| role_overview.company_name | Company name | string |
| role_overview.location.city | City | string |
| role_overview.location.state | State/Province | string |
| role_overview.location.country | Country | string |
| role_overview.location.zip_code | Postal code | string |
| role_overview.hiring_motivation | Why is this role open (growth/replacement/new project) | string |
| role_overview.system_scale | Company size (small team, mid-size, enterprise) | string |

### 10. ROLE CONTENT
The professional substance of the role.

| Field Path | Description | Type |
|------------|-------------|------|
| role_content.role_description | Detailed description of the role | string |
| role_content.core_problems_to_solve | Main problems this role is hired to solve | array |
| role_content.deliverables_expected | Tangible outputs (code, reports, plans) | array |
| role_content.biggest_challenges | Known challenges and difficulties | array |
| role_content.business_impact | How this role impacts the organization | string |
| role_content.tooling_ecosystem | All work tools (CRM, machines, software) | array |

### 9. UNIQUE VALUE
Differentiators.

| Field Path | Description | Type |
|------------|-------------|------|
| unique_value.hidden_perks.list | Unofficial perks | array |
| unique_value.status_signals.brand_value | Company prestige | string |
| unique_value.personal_meaning.mission_connection | Purpose/mission | string |
| unique_value.rare_offerings.what_makes_this_special | USP of the role | string |
`;

// -----------------------------------------------------------------------------
// 2.2 INFERENCE_RULES
// -----------------------------------------------------------------------------

const INFERENCE_RULES = `
## INFERENCE RULES (Auto-Fill When Confident)

If you can **confidently infer** a field's value from context, include it in updates WITHOUT the user explicitly stating it:

| Context Signal | Auto-Fill Field | Value |
|----------------|-----------------|-------|
| Coffee shop / cafe mentioned | environment.physical_space.type | "restaurant" |
| Restaurant / bar mentioned | environment.physical_space.type | "restaurant" |
| Retail store mentioned | environment.physical_space.type | "retail" |
| Warehouse / logistics mentioned | environment.physical_space.type | "warehouse" |
| "We're a startup" / "5-person company" | stability_signals.company_health.company_stage | "startup" |
| "Large corporation" / "Fortune 500" | stability_signals.company_health.company_stage | "enterprise" |
| Hourly wage mentioned ($15/hr) | financial_reality.base_compensation.pay_frequency | "hourly" |
| Annual salary mentioned ($85k/year) | financial_reality.base_compensation.pay_frequency | "annual" |
| "No remote" / "on-site only" | time_and_life.flexibility.remote_allowed | false |
| "Fully remote" / "work from anywhere" | time_and_life.flexibility.remote_frequency | "full" |
| "Hybrid" / "2 days in office" | time_and_life.flexibility.remote_frequency | "hybrid" |
| Freelance / contractor mentioned | stability_signals.job_security.position_type | "contract" |
| "Full-time position" | stability_signals.job_security.position_type | "permanent" |
| Tips mentioned for service role | financial_reality.variable_compensation.tips | true |
| Stock options / equity mentioned | financial_reality.equity.offered | true |
| "Standing all day" / physical job | environment.safety_and_comfort.physical_demands | "standing/physical" |
| Known company name (Starbucks, etc.) | role_overview.company_name | [The company name] |

**DO NOT infer when:**
- User says "competitive salary" (don't guess a number)
- User is vague ("good benefits" without specifics)
- Context is ambiguous
`;

// -----------------------------------------------------------------------------
// 2.3 STATIC_SYSTEM_PROMPT
// -----------------------------------------------------------------------------
// The STATIC system prompt for the Saver Agent.
// This is a constant string with NO dynamic injections - enables LLM caching.
// All session-specific data (company, archetype, skip) is injected via USER prompt.

const STATIC_SYSTEM_PROMPT = `# ROLE: Pure Data Extraction Engine (The Saver)

## OBJECTIVE
You are a logic-only engine responsible for updating the "Golden Schema" database.
You do NOT chat. You do NOT generate UI. You do NOT be polite.
Your ONLY output is a valid JSON object containing fields that must be updated in the database based on the User's latest input and the conversation context.

## INPUT DATA YOU WILL RECEIVE
1. **The Schema Definition:** All possible fields and their data types.
2. **Current DB State:** Values already saved (do not overwrite unless the user explicitly corrects/changes them).
3. **Conversation History:** To understand context (e.g., if the bot asked "What is your salary?", and user types "50k", you map "50k" to \`base_compensation\`).
4. **User's Latest Input:** The raw text or UI tool value provided by the user.
5. **Last Asked Field:** The schema field that was being asked about in the previous question.

## EXECUTION RULES

### 1. STRICT EXTRACTION
- Extract ONLY factual information that maps explicitly to a field in the schema.
- If the user says "I don't know" or "Skip", do NOT invent data. Return empty updates.
- If the user's input is chatty (e.g., "Wow, that's cool!"), return empty updates.

### 2. DATA NORMALIZATION (Crucial)
- **Numbers:** Convert text to clean numbers. "50k" -> \`50000\`. "Two years" -> \`2\`.
- **Booleans:** "Yes", "Sure", "Always" -> \`true\`. "No", "Never" -> \`false\`.
- **Arrays:** If the user lists items (e.g., "React, Node, Mongo"), map them to the array field. Append to existing if context implies adding, or replace if context implies correction.
- **Enums:** If a field has a set list of options (e.g., \`remote_frequency\`: ["full", "hybrid", "occasional", "rare", "never"]), map the user's vague text to the closest valid option.
- **Currency:** Strip currency symbols, keep the number. "$85,000" -> \`85000\`.

### 3. CONTEXT AWARENESS & INFERENCE
- Use the **last asked field** to know what was being asked.
- **Inference:** You are allowed to infer logically (see INFERENCE RULES below).
- **Ambiguity:** If the input is too vague to map to a specific field, IGNORE IT. Do not guess wildly.

### 4. MULTI-FIELD EXTRACTION (CRITICAL)
- A single user response may contain information for MULTIPLE fields.
- ALWAYS extract ALL information present, not just the primary answer.
- Example: "The office is in Tel Aviv, Israel, zip code 12345"
  - Extract: \`role_overview.location.city\`: "Tel Aviv"
  - Extract: \`role_overview.location.country\`: "Israel"
  - Extract: \`role_overview.location.zip_code\`: "12345"
- Example: "We're hiring a Dispatcher for our Seattle warehouse"
  - Extract: \`role_overview.job_title\`: "Dispatcher"
  - Extract: \`role_overview.location.city\`: "Seattle"
  - Extract: \`environment.physical_space.type\`: "warehouse"

### 5. OUTPUT FORMAT
Return ONLY a JSON object. No markdown blocks, no text explanations outside the JSON.

{
  "updates": {
    "path.to.field": "value",
    "another.field": 123
  },
  "reasoning": "Brief explanation of what was extracted and why"
}

If there is NOTHING to extract, return:
{
  "updates": {},
  "reasoning": "No factual data found to extract"
}

${INFERENCE_RULES}

## EDGE CASE HANDLING
- **Corrections:** If User says "Actually, make that $130k", you MUST overwrite the previous value.
- **Negations:** If User says "Not remote", set \`time_and_life.flexibility.remote_frequency\` to "never".
- **Complex Sentences:** "I want $100k but I can accept $90k if it's remote." -> Extract: base_compensation amount as 100000 (primary intent).
- **UI Tool Responses:** If the input comes from a UI tool (like a slider value 78), map it to the \`last_asked_field\` from the context.

${GOLDEN_SCHEMA_REFERENCE}

## FINAL COMMAND
Analyze the input. Map to Schema. Output JSON. Nothing else.`;

// =============================================================================
// SECTION 3: CONTEXT BUILDERS (For Dynamic User Prompt)
// =============================================================================
// These functions build dynamic context sections that are injected into the
// USER prompt (not system prompt). This keeps the system prompt static for caching.

// -----------------------------------------------------------------------------
// 3.1 buildCompanyContextSection
// -----------------------------------------------------------------------------

/**
 * Builds the company context section for the Saver Agent
 * @param {object|null} companyData - Company data
 * @returns {string} Company context section or empty string
 */
function buildCompanyContextSection(companyData) {
  if (!companyData?.name) {
    return "";
  }

  const { name, industry, employeeCountBucket } = companyData;

  let section = `## COMPANY CONTEXT

**Company:** ${name}`;

  if (industry) {
    section += ` (${industry} industry)`;
  }

  if (employeeCountBucket && employeeCountBucket !== "unknown") {
    section += `\n**Size:** ${employeeCountBucket} employees`;
  }

  section += `

Use this context for inference:
- Company name is already known: "${name}" - extract if user references "the company" or "here"
${industry ? `- Industry context: ${industry} - use for relevant inferences (e.g., restaurant industry → tips likely relevant)` : ""}

`;

  return section;
}

// -----------------------------------------------------------------------------
// 3.2 buildRoleArchetypeSection
// -----------------------------------------------------------------------------

/**
 * Builds the role archetype awareness section for the USER prompt.
 * @param {string|null} roleArchetype - Detected role archetype
 * @returns {string} Role archetype section or empty string
 */
function buildRoleArchetypeSection(roleArchetype) {
  if (!roleArchetype || roleArchetype === "unknown") {
    return "";
  }

  const archetypeInferences = {
    tech: {
      label: "Tech/Engineering",
      likelyFields: [
        "financial_reality.equity (common in tech)",
        "growth_trajectory.skill_building.technologies_used",
        "time_and_life.flexibility.remote_frequency (often remote-friendly)",
      ],
      unlikelyFields: [
        "financial_reality.variable_compensation.tips",
        "time_and_life.break_reality.paid_breaks",
        "environment.safety_and_comfort.physical_demands",
      ],
    },
    hospitality: {
      label: "Hospitality/Food Service",
      likelyFields: [
        "financial_reality.variable_compensation.tips",
        "time_and_life.schedule_pattern.shift_types",
        "environment.physical_space.type (restaurant/retail)",
        "time_and_life.break_reality.paid_breaks",
      ],
      unlikelyFields: [
        "financial_reality.equity",
        "time_and_life.flexibility.remote_frequency",
        "growth_trajectory.skill_building.technologies_used",
      ],
    },
    hourly: {
      label: "Hourly/Shift Work",
      likelyFields: [
        "financial_reality.base_compensation.pay_frequency = hourly",
        "time_and_life.schedule_predictability.advance_notice",
        "time_and_life.overtime_reality.overtime_expected",
        "financial_reality.payment_reliability.payment_method",
      ],
      unlikelyFields: [
        "financial_reality.equity",
        "growth_trajectory.formal_development.training_budget",
      ],
    },
    corporate: {
      label: "Corporate/Office",
      likelyFields: [
        "humans_and_culture.communication_culture.meeting_load",
        "stability_signals.benefits_security.health_insurance",
        "stability_signals.benefits_security.retirement_401k",
        "time_and_life.time_off.pto_days",
      ],
      unlikelyFields: [
        "financial_reality.variable_compensation.tips",
        "environment.safety_and_comfort.physical_demands",
      ],
    },
  };

  const archetype = archetypeInferences[roleArchetype];
  if (!archetype) {
    return "";
  }

  return `## ROLE ARCHETYPE AWARENESS

**Detected Role Type:** ${archetype.label}

**Likely Relevant Fields** (prioritize extraction if mentioned):
${archetype.likelyFields.map((f) => `- ${f}`).join("\n")}

**Unlikely Relevant Fields** (only extract if explicitly stated):
${archetype.unlikelyFields.map((f) => `- ${f}`).join("\n")}

`;
}

// -----------------------------------------------------------------------------
// 3.3 buildSkipAwarenessSection
// -----------------------------------------------------------------------------

/**
 * Builds the skip awareness section for the USER prompt.
 * Provides current skip state so LLM knows to return empty updates.
 *
 * @param {object|null} frictionState - Current friction state
 * @returns {string} Skip awareness section or empty string
 */
function buildSkipAwarenessSection(frictionState) {
  if (!frictionState?.isSkip) {
    return "";
  }

  return `## SKIP DETECTED

**The user SKIPPED the previous question.**

**CRITICAL:** Do NOT extract data when user skips. Return empty updates.

Skip indicators to recognize:
- "Skip" / "I don't know" / "Not sure"
- "Pass" / "Next" / "Move on"
- Empty response / just whitespace
- "Can't say" / "Rather not answer"

When skip is detected, return:
{
  "updates": {},
  "reasoning": "User skipped the question - no data to extract"
}

`;
}

// =============================================================================
// SECTION 4: MAIN SYSTEM PROMPT
// =============================================================================

/**
 * Builds the system prompt for the Saver Agent.
 *
 * ARCHITECTURE NOTE: This function now returns a STATIC system prompt.
 * All dynamic/session-specific data (company, archetype, skip state) is
 * injected via the USER prompt in buildGoldenDbUpdatePrompt().
 *
 * This enables LLM context caching since the system prompt never changes.
 *
 * @param {object} _context - Kept for backwards compatibility (unused)
 * @returns {string} Static system prompt
 */
export function buildGoldenDbUpdateSystemPrompt(_context = {}) {
  // Return the static prompt - no dynamic injections
  return STATIC_SYSTEM_PROMPT;
}

// =============================================================================
// SECTION 5: USER PROMPT BUILDER
// =============================================================================

/**
 * Builds the user prompt for the Saver Agent.
 * Now includes all dynamic session context (company, archetype, skip state).
 *
 * @param {object} context - The context object
 * @param {string|object} [context.userInput] - The user's input (text or UI response)
 * @param {string} [context.userMessage] - Text message from user
 * @param {object} [context.uiResponse] - Response from UI component
 * @param {string} [context.lastAskedField] - The schema field that was being asked about
 * @param {object} [context.currentSchema] - Current state of the golden schema
 * @param {array} [context.conversationHistory] - Previous conversation messages
 * @param {object} [context.companyData] - Company data for context
 * @param {string} [context.roleArchetype] - Detected role archetype
 * @param {object} [context.frictionState] - Current friction/skip state
 * @param {number} [context.attempt] - Current retry attempt (0-based)
 * @param {boolean} [context.strictMode] - True on retry attempts
 * @returns {string} The user prompt
 */
export function buildGoldenDbUpdatePrompt(context = {}) {
  const {
    userInput = null,
    userMessage = null,
    uiResponse = null,
    lastAskedField = null,
    currentSchema = {},
    conversationHistory = [],
    companyData = null,
    roleArchetype = null,
    frictionState = null,
    attempt = 0,
    strictMode = false,
  } = context;

  // Determine what the user actually provided
  const actualInput = userInput || uiResponse || userMessage;

  // Build dynamic context sections for the user prompt
  const companyContext = buildCompanyContextSection(companyData);
  const archetypeContext = buildRoleArchetypeSection(roleArchetype);
  const skipContext = buildSkipAwarenessSection(frictionState);

  // Build conversation context (last 2 messages for context)
  const recentHistory = conversationHistory.slice(-2);
  const historyContext = recentHistory.length > 0
    ? recentHistory.map(msg => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`).join("\n")
    : "No previous conversation.";

  // Filter out system/internal fields from current schema
  const cleanSchema = filterSchemaForDisplay(currentSchema);

  // Strict mode instructions for retries
  const strictNotes = strictMode
    ? "\n\n## CRITICAL: RETRY MODE\nYour previous response was not valid JSON. Return ONLY a valid JSON object with 'updates' and 'reasoning' keys. No text before or after."
    : "";

  const prompt = `# SESSION CONTEXT
${companyContext || "_No company data available._"}
${archetypeContext || "_No role archetype detected yet._"}
${skipContext}
---

## EXTRACTION TASK

### Last Asked Field
${lastAskedField || "Not specified (first turn or general input)"}

### User's Latest Input
${JSON.stringify(actualInput)}

### Recent Conversation Context
${historyContext}

### Current DB State (Already Saved Values)
${JSON.stringify(cleanSchema, null, 2)}

### Schema Fields Reference
The Golden Schema has the following top-level sections:
- role_overview: job_title, department, company_name, location (city, state, country, zip_code)
- financial_reality: base_compensation (amount_or_range, pay_frequency, currency), variable_compensation, equity, benefits
- time_and_life: schedule_pattern, flexibility (remote_frequency, location_flexibility), pto, overtime_reality
- environment: physical_space, safety_and_comfort
- humans_and_culture: team_composition, management_style, communication_culture
- stability_signals: company_health, job_security
- role_reality: day_to_day, autonomy_and_variety
- growth_trajectory: skill_building (tech_stack, technologies_used), learning_opportunities, career_path
- hidden_gems: unique_perks, culture_notes, insider_tips

Use dot notation for nested fields, e.g.: "financial_reality.base_compensation.amount_or_range"
${strictNotes}

### YOUR TASK
Extract factual data from the user's input and return a JSON object with:
1. "updates": Object with field paths as keys and extracted values
2. "reasoning": Brief explanation of what you extracted

RESPOND WITH JSON ONLY.`;

  llmLogger.info(
    {
      task: "golden_db_update",
      promptLength: prompt.length,
      attempt,
      strictMode,
      lastAskedField,
      hasUserInput: Boolean(actualInput),
      hasCompanyContext: Boolean(companyContext),
      hasArchetype: Boolean(archetypeContext),
      hasSkipContext: Boolean(skipContext),
    },
    "golden_db_update prompt built"
  );

  return prompt;
}

// =============================================================================
// SECTION 6: UTILITY FUNCTIONS
// =============================================================================

/**
 * Filters the schema to show only relevant saved values for context.
 * Removes internal fields and empty values for cleaner prompt.
 *
 * @param {object} schema - The full golden schema
 * @returns {object} Filtered schema for display
 */
function filterSchemaForDisplay(schema) {
  if (!schema || typeof schema !== "object") {
    return {};
  }

  // Remove internal/system fields
  const { id, companyId, user_context, ...rest } = schema;

  // Recursively remove null/undefined values for cleaner display
  const cleanObject = (obj) => {
    if (obj === null || obj === undefined) return undefined;
    if (typeof obj !== "object") return obj;
    if (Array.isArray(obj)) {
      const filtered = obj.filter(item => item !== null && item !== undefined);
      return filtered.length > 0 ? filtered : undefined;
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleaned = cleanObject(value);
      if (cleaned !== undefined) {
        result[key] = cleaned;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  };

  return cleanObject(rest) || {};
}
