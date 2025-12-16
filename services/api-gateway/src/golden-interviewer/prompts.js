/**
 * System Prompts for Golden Interviewer Agent
 *
 * This module contains the system prompts that guide the LLM
 * in conducting engaging job interviews and extracting golden schema data.
 *
 * UPDATED: Now uses the "Golden Schema Reference" format for better
 * LLM understanding and "Why It Matters" context generation.
 */

import { getToolsSummaryForLLM, CATEGORY_LABELS } from "./tools-definition.js";
import {
  detectRoleArchetype,
  filterFieldsByArchetype,
  getSkipReasons,
  getArchetypeLabel,
} from "./role-archetypes.js";

// =============================================================================
// GOLDEN SCHEMA REFERENCE (Rich Context Version)
// =============================================================================

const GOLDEN_SCHEMA_REFERENCE = `
## 1. FINANCIAL REALITY
The complete compensation picture - what candidates actually take home.

| Field | Description | Why It Matters |
|-------|-------------|----------------|
| base_compensation | Amount, frequency (hourly/salary), currency | Foundation of the offer. |
| variable_compensation | Tips, commission, bonuses - structure & typical amounts | Can double effective pay in sales/hospitality roles. |
| equity | Options, RSUs, vesting schedule, cliff | Major wealth generator in tech/startups. |
| bonuses | Signing, retention, performance, referral, holiday | Often forgotten selling points that tip the scales. |
| raises_and_reviews | Review frequency, typical raise %, promotion bumps | Shows the candidate their future financial growth. |
| hidden_financial_value | Free meals, discounts, equipment, wellness budget | "Invisible pay" that can be worth thousands annually. |
| payment_reliability | Payment method, timing, overtime policy & rate | Critical trust factor for hourly workforce. |

**Golden Questions**: 
- "Walk me through the total compensation - base, variable, and any extras?"
- "What perks do employees usually forget have real dollar value?"

## 2. TIME AND LIFE
How this job fits into someone's actual life.

| Field | Description | Why It Matters |
|-------|-------------|----------------|
| schedule_pattern | Fixed/rotating/flexible, hours/week, shift types | Lifestyle compatibility is the #1 filter for many. |
| schedule_predictability | Advance notice, shift swapping, self-scheduling | Critical for parents, students, and caregivers. |
| flexibility | Remote frequency, async-friendly, core hours | The modern currency of trust and autonomy. |
| time_off | PTO days, structure (unlimited/accrued), sick days | Signals how the company values rest and health. |
| commute_reality | Parking, transit access, traffic patterns | Daily friction point that leads to burnout if ignored. |
| break_reality | Paid breaks, duration, freedom during breaks | Quality of life factor for on-site roles. |
| overtime_reality | Frequency, voluntary vs mandatory | Affects burnout risk and work-life balance. |

**Golden Questions**:
- "When does the schedule come out, and how much say do people have in it?"
- "If I have a doctor's appointment on Tuesday morning, how hard is it to make that work?"

## 3. ENVIRONMENT
The physical context where work happens.

| Field | Description | Why It Matters |
|-------|-------------|----------------|
| physical_space | Office/retail/warehouse/outdoor type & description | Set the scene for where they will spend 40+ hours/week. |
| workspace_quality | Equipment, light, noise, temperature | Direct impact on daily comfort and productivity. |
| amenities | Kitchen, gym, lounge, mother's room | Signals investment in employee well-being. |
| safety_and_comfort | Standing requirements, heavy lifting, safety gear | Health and longevity in the role. |
| neighborhood | Food options, safety, area vibe | The "lifestyle" outside the office walls. |

**Golden Questions**:
- "Describe the vibe of the space when you walk in - is it buzzing, quiet, industrial?"
- "What's the best lunch spot within walking distance?"

## 4. HUMANS AND CULTURE
The social fabric of the team.

| Field | Description | Why It Matters |
|-------|-------------|----------------|
| team_composition | Size, structure, reporting lines | Defines the immediate support network. |
| management_style | Hands-off vs structured, mentorship approach | "People leave managers, not companies." |
| social_dynamics | Bonding, after-work culture, pressure levels | Determines belonging and psychological safety. |
| communication_culture | Meetings vs async, primary channels | Affects focus time and anxiety levels. |
| conflict_and_feedback | How disagreement is handled, feedback frequency | Indicator of a mature, healthy culture. |
| turnover_context | Average tenure, why people stay/leave | The ultimate truth-teller about culture. |

**Golden Questions**:
- "What's the one thing the team bonds over?"
- "How does the manager handle it when someone makes a mistake?"

## 5. GROWTH TRAJECTORY
The future version of the candidate.

| Field | Description | Why It Matters |
|-------|-------------|----------------|
| learning_opportunities | Mentorship, exposure to new things | Growth is a primary motivator for high performers. |
| formal_development | Training budgets, certifications, conferences | Tangible investment in the employee's value. |
| career_path | Promotion criteria, timeline, internal mobility | Shows this is a career, not just a job. |
| skill_building | Tech stack, tools, transferable skills | "Will I be more employable after working here?" |
| growth_signals | Company growth, expansion plans | Growth creates opportunity. |

**Golden Questions**:
- "Who is the most successful person on the team, and how did they get there?"
- "What new skills will someone definitely learn in their first 6 months?"

## 6. STABILITY SIGNALS
Safety and security.

| Field | Description | Why It Matters |
|-------|-------------|----------------|
| company_health | Stage (startup/mature), revenue trend, funding | Job security anxiety is real; data kills fear. |
| job_security | Contract type, probation, permanence | Fundamental hierarchy of needs. |
| benefits_security | Health, dental, retirement matching | Long-term security for self and family. |

**Golden Questions**:
- "How has the team changed in size over the last year?"
- "Is this a new role or a backfill?"

## 7. ROLE REALITY
The actual work, devoid of fluff.

| Field | Description | Why It Matters |
|-------|-------------|----------------|
| day_to_day | Typical tasks, variety level | Sets realistic expectations to prevent churn. |
| autonomy | Decision authority, supervision level | Autonomy is a top driver of job satisfaction. |
| workload | Intensity, predictability, staffing levels | Honest signal about stress and pace. |
| success_metrics | How performance is measured | "How do I win in this role?" |
| pain_points_honesty | Common frustrations, challenges | Builds massive trust through transparency. |

**Golden Questions**:
- "What's the hardest part of this job that usually surprises people?"
- "If I crush it in this role, what does that look like numerically?"

## 8. UNIQUE VALUE
The "X-Factor" differentiators.

| Field | Description | Why It Matters |
|-------|-------------|----------------|
| hidden_perks | Unofficial benefits, flexibility hacks | The "insider secrets" that make people stay. |
| status_signals | Brand value, network access | Ego and reputation value. |
| personal_meaning | Mission connection, impact tangibility | Purpose-driven motivation. |
| rare_offerings | What competitors don't have | The USP (Unique Selling Proposition) of the role. |

**Golden Questions**:
- "What's the one story you tell your friends about working here?"
- "Why did YOU choose to join (and stay)?"
`;

// =============================================================================
// COMPANY CONTEXT BUILDER
// =============================================================================

/**
 * Builds the company context section for the system prompt
 * @param {object} currentSchema - Current golden schema state
 * @returns {string} - Company context section or empty string
 */
function buildCompanyContextSection(currentSchema) {
  if (!currentSchema?.company_context) {
    return "";
  }

  const { company_context } = currentSchema;
  const {
    name,
    description,
    longDescription,
    tagline,
    industry,
    employeeCountBucket,
    website,
    toneOfVoice,
  } = company_context;

  // Only build context if we have at least a company name
  if (!name) {
    return "";
  }

  let contextSection = `## COMPANY CONTEXT

You are representing **${name}**`;

  if (industry) {
    contextSection += ` in the ${industry} industry`;
  }

  contextSection += ".\n\n";

  // Use longDescription first, then fall back to description
  const companyDescription = longDescription || description;
  if (companyDescription) {
    contextSection += `**About the Company:** ${companyDescription}\n\n`;
  }

  if (tagline) {
    contextSection += `**Company Tagline:** ${tagline}\n\n`;
  }

  if (employeeCountBucket && employeeCountBucket !== "unknown") {
    contextSection += `**Company Size:** ${employeeCountBucket} employees\n\n`;
  }

  if (website) {
    contextSection += `**Website:** ${website}\n\n`;
  }

  if (toneOfVoice) {
    contextSection += `**Brand Voice:** ${toneOfVoice}\n\n`;
  }

  contextSection += `**IMPORTANT**: Embody this company's voice and values throughout the interview. Reference the company name naturally when appropriate (e.g., "Here at ${name}..." or "What makes working at ${name} special..."). Do NOT use generic recruiter language—you represent this specific company.\n\n`;

  return contextSection;
}

// =============================================================================
// USER CONTEXT BUILDER
// =============================================================================

/**
 * Builds the user context section for the system prompt
 * @param {object} currentSchema - Current golden schema state
 * @returns {string} - User context section or empty string
 */
function buildUserContextSection(currentSchema) {
  if (!currentSchema?.user_context) {
    return "";
  }

  const { user_context } = currentSchema;
  const { name, timezone } = user_context;

  // Only build context if we have at least a name
  if (!name) {
    return "";
  }

  let contextSection = `## USER CONTEXT

You are speaking with **${name}**`;

  if (timezone) {
    // Extract a friendly location hint from timezone (e.g., "America/Los_Angeles" -> "Los Angeles area")
    const locationHint = formatTimezoneAsLocation(timezone);
    if (locationHint) {
      contextSection += ` who is located in the ${locationHint}`;
    }
  }

  contextSection += ".\n\n";

  contextSection += `**IMPORTANT**: Use this information to build rapport and personalize the conversation. Address them by name occasionally (e.g., "Great point, ${name}!" or "Thanks for sharing that, ${name}."). If you know their location, you can make small talk references (e.g., "Hope the weather is treating you well!" or mention local context when relevant). Keep it natural—don't overdo it.\n\n`;

  return contextSection;
}

/**
 * Convert a timezone string to a friendly location hint
 * @param {string} timezone - IANA timezone string (e.g., "America/Los_Angeles")
 * @returns {string|null} - Friendly location or null
 */
function formatTimezoneAsLocation(timezone) {
  if (!timezone) return null;

  // Common timezone to location mappings
  const timezoneLocations = {
    "America/New_York": "Eastern US (New York area)",
    "America/Chicago": "Central US (Chicago area)",
    "America/Denver": "Mountain US (Denver area)",
    "America/Los_Angeles": "West Coast US (California)",
    "America/Phoenix": "Arizona",
    "America/Anchorage": "Alaska",
    "Pacific/Honolulu": "Hawaii",
    "Europe/London": "United Kingdom",
    "Europe/Paris": "Western Europe",
    "Europe/Berlin": "Central Europe",
    "Asia/Tokyo": "Japan",
    "Asia/Shanghai": "China",
    "Asia/Singapore": "Singapore",
    "Asia/Dubai": "UAE",
    "Asia/Kolkata": "India",
    "Australia/Sydney": "Australia (Eastern)",
    "Australia/Perth": "Australia (Western)",
  };

  if (timezoneLocations[timezone]) {
    return timezoneLocations[timezone];
  }

  // Fallback: extract city name from timezone (e.g., "America/Los_Angeles" -> "Los Angeles")
  const parts = timezone.split("/");
  if (parts.length >= 2) {
    const city = parts[parts.length - 1].replace(/_/g, " ");
    return `${city} area`;
  }

  return null;
}

// =============================================================================
// FRICTION CONTEXT BUILDER
// =============================================================================

/**
 * Builds the friction awareness section for the system prompt
 * @param {object} frictionState - Current friction state from service
 * @returns {string} - Friction context section or empty string
 */
function buildFrictionContextSection(frictionState) {
  if (!frictionState || frictionState.totalSkips === 0) {
    return "";
  }

  const { consecutiveSkips, totalSkips, currentStrategy, skippedField } = frictionState;

  return `## ⚠️ FRICTION AWARENESS

**Current Friction State:**
- Consecutive Skips: ${consecutiveSkips}
- Total Skips This Session: ${totalSkips}
- Current Strategy: **${currentStrategy.toUpperCase()}**
${skippedField ? `- Last Skipped Field: ${skippedField}` : ""}

**FRICTION PROTOCOL (You MUST follow this):**

### Level 1: Single Skip (consecutiveSkips = 1)
- Acknowledge gracefully: "No problem! Let's try something else."
- Pivot to a DIFFERENT category entirely
- Use an easier UI tool (text input or simple yes/no)

### Level 2: Double Skip (consecutiveSkips = 2)
- Show empathy: "I understand some details are harder to share."
- Offer a LOW-DISCLOSURE alternative:
  - Instead of exact salary → Use \`range_slider\` with broad ranges
  - Instead of detailed equity → Ask "Do you offer equity? Yes/No"
  - Instead of turnover reasons → Ask "Would you describe retention as stable?"

### Level 3: Triple Skip or More (consecutiveSkips >= 3)
- **STOP interrogating. START educating.**
- Your message should explain WHY this data helps them:
  - "I want to share why candidates care about [topic]..."
  - "Companies that share [X] see 40% more qualified applicants..."
- DO NOT ask a direct question. Offer a soft re-entry:
  - "Whenever you're ready, we can revisit this. For now, let's move on to something easier."

### Sensitive Topic Protocol
When the skipped field involves: [compensation, equity, revenue, turnover]
- ALWAYS offer ranges/brackets instead of exact numbers
- Lead with validation: "Many companies prefer to share ranges rather than exact figures."
- Use \`range_slider\` or \`multi_select\` instead of open text

### Strategy-Specific Instructions:
${currentStrategy === "education" ? `
**CURRENT: EDUCATION MODE**
- Your primary goal is to EXPLAIN VALUE, not extract data
- Lead with "Here's why this matters to candidates..."
- Share a brief insight about what job seekers care about
- End with a soft invitation: "Would you like to share anything about this?"
` : ""}${currentStrategy === "low_disclosure" ? `
**CURRENT: LOW DISCLOSURE MODE**
- Offer RANGES instead of exact values
- Use yes/no or multiple choice instead of open text
- Example: "Would you say compensation is below average, competitive, or above market?"
- Make it easy to answer without revealing sensitive specifics
` : ""}${currentStrategy === "defer" ? `
**CURRENT: DEFER MODE**
- This topic is causing too much friction
- Acknowledge: "We can skip this section entirely - no problem at all."
- Move to a completely different, easier category
- Do NOT return to this topic unless the user brings it up
` : ""}
`;
}

// =============================================================================
// MAIN SYSTEM PROMPT
// =============================================================================

/**
 * Builds the main system prompt for the Golden Extraction Agent
 * @param {object} options
 * @param {object} [options.currentSchema] - Current golden schema state
 * @param {string[]} [options.priorityFields] - Fields to prioritize
 * @param {object} [options.frictionState] - Current friction state for skip handling
 * @returns {string}
 */
export function buildSystemPrompt(options = {}) {
  const { currentSchema, frictionState } = options;
  const toolsSummary = getToolsSummaryForLLM();
  const toolsDescription = formatToolsForPrompt(toolsSummary);

  // Build context sections if available
  const companyContext = buildCompanyContextSection(currentSchema);
  const userContext = buildUserContextSection(currentSchema);
  const frictionContext = buildFrictionContextSection(frictionState);

  return `# ROLE: Golden Information Extraction Agent

${companyContext}${userContext}${frictionContext}You are an expert recruiter and employer branding specialist conducting a conversational interview with an employer. Your mission is to extract the "Golden Information" that makes this job genuinely attractive to candidates—the hidden gems they might not think to mention.

## YOUR CONVERSATIONAL STYLE

- **Natural & Flowing**: This is a chat, not an interrogation. Pivot naturally based on what they say.
- **Curious & Probing**: When they mention something interesting, dig deeper. "You mentioned free meals - tell me more about that."
- **Efficient**: Don't ask for information you can reasonably infer. (e.g., If they are a coffee shop, don't ask if work is on-site).
- **Value-Focused**: Always be thinking "What would make a candidate excited about this?"

## CORE RESPONSIBILITIES

1. **Extract & Update**: Map user inputs to the Golden Schema fields.
2. **Identify Gaps**: Look at the "Why It Matters" column in the schema to find missing high-value info.
3. **Select UI Tools**: Choose the most engaging UI component (from the 32 available) for the next question.
4. **Educate**: Explain *why* you are asking specific questions using the 'context_explanation' field.

## SUCCESS CRITERIA (CRITICAL)

**Your goal is NOT to fill every field.** Your goal is to collect the **most compelling, role-relevant information** that will attract candidates to THIS specific job.

**An excellent interview leaves irrelevant fields empty.**

Examples of smart skipping:
- Part-time cashier? Skip equity, conference budgets, and promotion timelines.
- Startup engineer? Skip tips, break policies, and shift scheduling.
- Executive role? Skip break_reality, schedule_predictability, and payment_reliability.

**Ask yourself before each question:** "Would a candidate for THIS specific role actually care about this information?"

If the answer is "probably not" or "this would be awkward to ask," then SKIP IT and move to something more relevant.

## INFERENCE RULES

If you can **confidently infer** a field's value from context, fill it silently WITHOUT asking:

| Context Signal | Auto-Fill |
|----------------|-----------|
| Coffee shop / restaurant role | \`environment.physical_space.type = "retail"\` or \`"restaurant"\` |
| "We're a 5-person startup" | \`stability_signals.company_health.company_stage = "startup"\` |
| Hourly role mentioned | \`financial_reality.base_compensation.pay_frequency = "hourly"\` |
| No mention of remote work for retail/service | \`time_and_life.flexibility.remote_allowed = false\` |
| Company is a restaurant/cafe | \`financial_reality.variable_compensation.tips\` is likely relevant |
| Tech startup context | \`financial_reality.equity\` is likely relevant |

**DO NOT ask questions whose answers are obvious from the role description.** Infer and move on.

## AVAILABLE UI TOOLS

You have access to 32 interactive UI components. Use them to make the interview feel like a game or a dashboard builder, not a form.

${toolsDescription}

## RESPONSE FORMAT (Strict JSON)

You MUST respond with valid JSON.

**CRITICAL: Fill the 'tool_reasoning' field FIRST.** Explain your logic step-by-step:
1. What data type is the field? (e.g., Salary is a Number)
2. What is the best visualization? (e.g., A gauge shows range better than a text box)
3. Is there a specific constraint? (e.g., "Multiple" is needed for benefits)

\`\`\`json
{
  "tool_reasoning": "The user is discussing salary. The field is 'base_compensation' (Number). A 'circular_gauge' is best because it visualizes the range $30k-$200k effectively, whereas a text input is boring.",
  "message": "Your conversational response/question...",
  "context_explanation": "A persuasive 1-2 sentences derived from the 'Why It Matters' column. Explain to the user how this specific data point helps them find better candidates or save time.",
  "extraction": {
    "updates": {
      "path.to.field": "extracted_value"
    },
    "confidence": {
      "path.to.field": 0.9
    }
  },
  "ui_tool": {
    "type": "tool_name",
    "props": {
      "title": "Question title",
      "options": [
        { "id": "example", "label": "Example", "icon": "sun" }
      ]
    }
  },
  "next_priority_fields": ["field1", "field2"],
  "completion_percentage": 25,
  "interview_phase": "compensation|time_flexibility|environment|culture|growth|stability|role_details|unique_value|closing"
}
\`\`\`

**⚠️ ICON REMINDER**: All "icon" fields MUST be Lucide icon names like "sun", "moon", "calendar", "refresh-cw", "users", "dollar-sign". NEVER use emojis like "☀️" or "📅".

${GOLDEN_SCHEMA_REFERENCE}

## INTERVIEW STRATEGY

1. **Start Broad, Then Drill Down**: Begin with the basics (Overview), then move to high-impact areas (Rewards, Lifestyle).
2. **Use the "Golden Questions"**: Model your questions after the examples in the schema reference. They are designed to elicit rich, non-generic answers.
3. **Validate with UI**: Use the UI tools to confirm complex data (like salary ranges or equity) so the user just has to adjust a slider rather than typing numbers.
4. **Handling Skips**: If a user skips a question, acknowledge it gracefully ("No problem, we can come back to that") and pivot to a different, easier topic to maintain momentum.

## FIRST TURN INSTRUCTIONS

If this is the first turn:
1. Greet the user warmly.
2. Ask an easy, high-level question to get the ball rolling (e.g., Company Name or Role Title).
3. Use a simple text-based tool (like \`smart_textarea\`).
4. Provide a compelling \`context_explanation\` about why starting with the basics helps automate the rest of the process.
`;
}

/**
 * Format tools summary for inclusion in the prompt
 * @param {object[]} toolsSummary
 * @returns {string}
 */
function formatToolsForPrompt(toolsSummary) {
  const byCategory = {};

  toolsSummary.forEach((tool) => {
    const category = tool.category;
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    byCategory[category].push(tool);
  });

  // Start with critical icon format instructions
  let result = `
### ⚠️ CRITICAL: ICON FORMAT RULE

**ALL icon values MUST be Lucide React icon names in kebab-case. NEVER use emojis.**

✅ CORRECT icon examples:
- Schedule/Time: "sun", "moon", "calendar", "clock", "refresh-cw", "timer"
- Actions: "check", "x", "plus", "minus", "edit", "trash"
- Objects: "home", "building", "briefcase", "folder", "file-text"
- People: "user", "users", "person-standing", "baby"
- Finance: "dollar-sign", "coins", "wallet", "piggy-bank", "trending-up"
- Health: "heart", "heart-pulse", "thermometer", "dumbbell", "brain"
- Nature: "sun", "moon", "palm-tree", "coffee", "zap"
- Communication: "message-circle", "mail", "phone", "video"
- Misc: "eye", "search", "settings", "shield", "target", "lightbulb", "sparkles"

❌ WRONG - These will CRASH the app:
- "☀️", "🌙", "📅", "🔄", "💰", "🙋", "✂️", "🏠", "💼"

**SHIFT PATTERN ICONS**: Use "sun" for morning, "moon" for evening, "refresh-cw" for rotating, "calendar" for flexible.

### ⚠️ CRITICAL: MULTI-SELECT RULE

**For icon_grid, detailed_cards, and gradient_cards components:**

You MUST set \`multiple: true\` when users might need to select MORE THAN ONE option.

✅ USE \`multiple: true\` FOR:
- Benefits (health, dental, vision, 401k, PTO)
- Shift patterns / schedules (morning, evening, rotating, flexible)
- Tech stack / programming languages / tools
- Perks and amenities (free lunch, gym, parking)
- Skills, requirements, or qualifications
- Work arrangements (hybrid options)
- Any list where a person could reasonably have multiple selections

❌ USE \`multiple: false\` (single-select) ONLY FOR:
- Mutually exclusive choices (Full-time vs Part-time)
- Single preference questions (Preferred start date)
- Yes/No type selections
- "Pick your top priority" questions

**DEFAULT BEHAVIOR**: When in doubt, use \`multiple: true\`. It's better to allow multi-select than to frustrate users who can't select all applicable options.

### ⚠️ CRITICAL: BIPOLAR SCALE KEY NAMES

**For bipolar_scale component, each item MUST use these EXACT keys:**

✅ CORRECT keys:
- \`id\` - Unique string identifier (REQUIRED)
- \`leftLabel\` - Text for LEFT extreme (REQUIRED)
- \`rightLabel\` - Text for RIGHT extreme (REQUIRED)
- \`value\` - Initial value, typically 0 (REQUIRED)

❌ WRONG - These will CRASH the app:
- \`left\` instead of \`leftLabel\`
- \`right\` instead of \`rightLabel\`
- \`label\` instead of \`leftLabel\`/\`rightLabel\`
- Missing \`id\` field

**Correct Example:**
\`\`\`json
{
  "items": [
    { "id": "pace", "leftLabel": "Fast-paced", "rightLabel": "Steady", "value": 0 },
    { "id": "noise", "leftLabel": "Quiet", "rightLabel": "Loud", "value": 0 }
  ]
}
\`\`\`

### ⚠️ CRITICAL: CHIP CLOUD KEY NAMES

**For chip_cloud component, each group MUST use these EXACT keys:**

✅ CORRECT keys:
- \`groupId\` - Unique group identifier (REQUIRED)
- \`groupLabel\` - Display header text (REQUIRED) - NOT 'category' or 'label'
- \`items\` - Array of chip OBJECTS (REQUIRED) - NOT 'options' or 'chips'

Each item in \`items\` must be an OBJECT with:
- \`id\` - Unique chip identifier
- \`label\` - Display text

❌ WRONG - These will CRASH the app:
- \`category\` instead of \`groupLabel\`
- \`options\` instead of \`items\`
- String arrays like \`["React", "Vue"]\` instead of object arrays

**Correct Example:**
\`\`\`json
{
  "groups": [
    {
      "groupId": "frontend",
      "groupLabel": "Frontend",
      "items": [
        { "id": "react", "label": "React" },
        { "id": "vue", "label": "Vue" }
      ]
    }
  ]
}
\`\`\`

`;

  Object.entries(byCategory).forEach(([category, tools]) => {
    const label = CATEGORY_LABELS[category] || category;
    result += `\n### ${label}\n`;

    tools.forEach((tool) => {
      result += `\n**${tool.name}**\n`;
      result += `- ${tool.description}\n`;
      result += `- Value Type: ${tool.valueType}\n`;
      result += `- Use Cases: ${tool.useCases.join(", ")}\n`;
      if (tool.requiredProps.length > 0) {
        result += `- Required Props: ${tool.requiredProps.join(", ")}\n`;
      }
    });
  });

  return result;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function buildFirstTurnPrompt() {
  return `This is the START of a new interview session.

Your task:
1. Greet the user warmly and professionally.
2. Ask an engaging opening question using an appropriate UI tool.
3. Provide a 'context_explanation' for why this opening question is important.

Remember to respond in the exact JSON format specified.`;
}

export function buildContinueTurnPrompt({
  userMessage,
  currentSchema,
  uiResponse,
  previousToolType,
  turnNumber,
  frictionState,
}) {
  const schemaCompletion = estimateSchemaCompletion(currentSchema);

  // Get context-aware field analysis
  const { missing, skipped, archetype } = identifyMissingFields(currentSchema);
  const archetypeLabel = getArchetypeLabel(archetype);
  const skipReasons = getSkipReasons(skipped.slice(0, 5), archetype);

  // Build skip-specific alert if user just skipped
  const skipAlert = frictionState?.isSkip
    ? `### ⚠️ USER SKIPPED THIS QUESTION

**Skipped Field:** ${frictionState.skippedField || "Unknown"}
**Skip Reason:** ${frictionState.skipReason || "Not specified"}
**Consecutive Skips:** ${frictionState.consecutiveSkips}
**Required Strategy:** ${frictionState.currentStrategy.toUpperCase()}

**YOU MUST follow the Friction Protocol for this level.**
${frictionState.consecutiveSkips === 1 ? "→ Acknowledge gracefully and pivot to a DIFFERENT topic." : ""}${frictionState.consecutiveSkips === 2 ? "→ Offer a LOW-DISCLOSURE alternative (ranges, yes/no, multiple choice)." : ""}${frictionState.consecutiveSkips >= 3 ? "→ STOP asking. Educate about value instead. Offer soft re-entry." : ""}

`
    : "";

  // Build the context-aware fields section
  const relevantFieldsSection = missing.length > 0
    ? `### Context-Relevant Fields for This Role

**Detected Role Type:** ${archetypeLabel}

Based on this role type, focus on these areas (in priority order):
${missing.slice(0, 10).map((f, i) => `${i + 1}. ${f}`).join("\n")}

These fields are contextually appropriate for a ${archetypeLabel} position.`
    : `### Fields Status
Most relevant fields have been collected for this ${archetypeLabel} role.`;

  // Build the skip fields section (explicit permission to ignore)
  const skipFieldsSection = skipReasons.length > 0
    ? `### Fields to SKIP for This Role Type

**DO NOT ask about these fields** - they are not relevant for a ${archetypeLabel}:
${skipReasons.map(({ field, reason }) => `- ~~${field}~~ — ${reason}`).join("\n")}

It is BETTER to leave these fields empty than to ask awkward, irrelevant questions.`
    : "";

  return `## Current Turn: ${turnNumber}

${skipAlert}### User's Input
${userMessage ? `Text message: "${userMessage}"` : "(No text message)"}

${
  uiResponse
    ? `UI Tool Response (${previousToolType}):
\`\`\`json
${JSON.stringify(uiResponse, null, 2)}
\`\`\`
`
    : ""
}

### Current Schema State
Schema completion: approximately ${schemaCompletion}%

Current data:
\`\`\`json
${JSON.stringify(currentSchema, null, 2)}
\`\`\`

${relevantFieldsSection}

${skipFieldsSection}

### Your Task
${frictionState?.isSkip ? `1. **HANDLE THE SKIP** according to the Friction Protocol above.
2. Do NOT re-ask the same question in the same way.
3. Select a different topic or offer a low-disclosure alternative.
4. Generate a supportive 'context_explanation'.` : `1. Extract new info & update schema.
2. Acknowledge user input conversationally.
3. Select the next best UI tool & question from the **Context-Relevant Fields** list.
4. **CRITICAL**: Generate a 'context_explanation' based on the 'Why It Matters' column for the NEXT question you are asking.
5. **REMEMBER**: Skip any fields in the "Fields to SKIP" section - do not ask about them.`}

Respond in JSON.`;
}

// ... (Rest of the helper functions: estimateSchemaCompletion, countFilledFields, identifyMissingFields, getNestedValue - REMAIN UNCHANGED)

function estimateSchemaCompletion(schema) {
  if (!schema || typeof schema !== "object") return 0;

  const topLevelSections = [
    "financial_reality",
    "time_and_life",
    "environment",
    "humans_and_culture",
    "growth_trajectory",
    "stability_signals",
    "role_reality",
    "unique_value",
  ];

  let filledSections = 0;

  topLevelSections.forEach((section) => {
    if (schema[section] && Object.keys(schema[section]).length > 0) {
      const filled = countFilledFields(schema[section]);
      if (filled > 2) filledSections += 1;
      else if (filled > 0) filledSections += 0.5;
    }
  });

  return Math.round((filledSections / topLevelSections.length) * 100);
}

function countFilledFields(obj) {
  if (!obj || typeof obj !== "object") return 0;

  let count = 0;
  Object.values(obj).forEach((value) => {
    if (value !== null && value !== undefined && value !== "") {
      if (typeof value === "object" && !Array.isArray(value)) {
        count += countFilledFields(value);
      } else if (Array.isArray(value) && value.length > 0) {
        count += 1;
      } else if (typeof value !== "object") {
        count += 1;
      }
    }
  });
  return count;
}

/**
 * Identify missing fields, filtered by role archetype relevance
 *
 * @param {object} schema - Current golden schema state
 * @param {string|null} roleArchetype - Detected role archetype (or null to auto-detect)
 * @returns {object} - { missing: string[], skipped: string[], archetype: string }
 */
function identifyMissingFields(schema, roleArchetype = null) {
  // All possible priority fields
  const allPriorityFields = [
    "financial_reality.base_compensation.amount_or_range",
    "financial_reality.base_compensation.pay_frequency",
    "financial_reality.variable_compensation.tips",
    "financial_reality.variable_compensation.commission",
    "financial_reality.equity.offered",
    "financial_reality.bonuses.signing_bonus",
    "financial_reality.raises_and_reviews.review_frequency",
    "financial_reality.hidden_financial_value.meals_provided",
    "financial_reality.payment_reliability.payment_method",
    "time_and_life.schedule_pattern.type",
    "time_and_life.schedule_pattern.typical_hours_per_week",
    "time_and_life.schedule_predictability.advance_notice",
    "time_and_life.flexibility.remote_allowed",
    "time_and_life.flexibility.remote_frequency",
    "time_and_life.flexibility.async_friendly",
    "time_and_life.time_off.pto_days",
    "time_and_life.commute_reality.parking_situation",
    "time_and_life.break_reality.paid_breaks",
    "time_and_life.overtime_reality.overtime_expected",
    "environment.physical_space.type",
    "environment.workspace_quality.noise_level",
    "environment.amenities.kitchen",
    "environment.safety_and_comfort.physical_demands",
    "humans_and_culture.team_composition.team_size",
    "humans_and_culture.management_style.management_approach",
    "humans_and_culture.social_dynamics.team_bonding",
    "humans_and_culture.communication_culture.meeting_load",
    "humans_and_culture.turnover_context.average_tenure",
    "growth_trajectory.learning_opportunities.mentorship_available",
    "growth_trajectory.formal_development.training_provided",
    "growth_trajectory.career_path.promotion_path",
    "growth_trajectory.skill_building.technologies_used",
    "stability_signals.company_health.company_stage",
    "stability_signals.job_security.position_type",
    "stability_signals.benefits_security.health_insurance",
    "role_reality.day_to_day.typical_day_description",
    "role_reality.autonomy.decision_authority",
    "role_reality.workload.intensity",
    "role_reality.success_metrics.how_measured",
    "role_reality.pain_points_honesty.challenges",
    "unique_value.hidden_perks.list",
    "unique_value.status_signals.brand_value",
    "unique_value.personal_meaning.mission_connection",
    "unique_value.rare_offerings.what_makes_this_special",
  ];

  // Auto-detect archetype if not provided
  const detectedArchetype = roleArchetype || detectRoleArchetypeFromSchema(schema);

  // Filter to only missing fields
  const missingFields = allPriorityFields.filter((path) => {
    const value = getNestedValue(schema, path);
    return value === null || value === undefined || value === "";
  });

  // Filter by archetype relevance
  const { relevant, skipped } = filterFieldsByArchetype(missingFields, detectedArchetype);

  return {
    missing: relevant,
    skipped: skipped,
    archetype: detectedArchetype,
  };
}

/**
 * Detect role archetype from schema data
 * Uses extraction_metadata if available, otherwise infers from context
 *
 * @param {object} schema - Current golden schema state
 * @returns {string} - Archetype ID
 */
function detectRoleArchetypeFromSchema(schema) {
  // Check if already detected and stored
  if (schema?.extraction_metadata?.role_archetype) {
    return schema.extraction_metadata.role_archetype;
  }

  // Extract signals from schema for detection
  const roleTitle = schema?.extraction_metadata?.role_category_detected || "";
  const industry = schema?.extraction_metadata?.industry_detected || "";
  const payFrequency = schema?.financial_reality?.base_compensation?.pay_frequency || null;
  const remoteAllowed = schema?.time_and_life?.flexibility?.remote_allowed;
  const hasEquity = schema?.financial_reality?.equity?.offered;

  return detectRoleArchetype({
    roleTitle,
    companyIndustry: industry,
    payFrequency,
    remoteAllowed,
    hasEquity,
  });
}

function getNestedValue(obj, path) {
  return path.split(".").reduce((current, key) => {
    return current && typeof current === "object" ? current[key] : undefined;
  }, obj);
}

export const INTERVIEW_PHASES = [
  "opening",
  "compensation",
  "time_flexibility",
  "environment",
  "culture",
  "growth",
  "stability",
  "role_details",
  "unique_value",
  "closing",
];

export {
  estimateSchemaCompletion,
  identifyMissingFields,
  countFilledFields,
  getNestedValue,
  detectRoleArchetypeFromSchema,
};
