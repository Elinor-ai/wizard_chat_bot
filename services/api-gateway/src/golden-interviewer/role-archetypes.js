/**
 * Role Archetype System for Golden Interviewer
 *
 * This module defines role archetypes and field relevance mappings
 * to ensure the interviewer only asks contextually appropriate questions.
 *
 * ARCHITECTURE:
 * - Archetypes represent common job categories with different data needs
 * - Each field has a relevance level per archetype: "required", "optional", or "skip"
 * - The system filters fields BEFORE sending to the LLM, preventing awkward questions
 */

// =============================================================================
// ROLE ARCHETYPES DEFINITION
// =============================================================================

/**
 * Role archetype definitions with descriptions and detection keywords
 */
export const ROLE_ARCHETYPES = {
  hourly_service: {
    id: "hourly_service",
    label: "Hourly Service Role",
    description: "Retail, food service, hospitality, customer-facing hourly positions",
    keywords: [
      "cashier", "barista", "server", "waiter", "waitress", "host", "hostess",
      "retail", "sales associate", "store clerk", "customer service", "front desk",
      "receptionist", "food service", "restaurant", "cafe", "coffee shop", "bar",
      "bartender", "busser", "dishwasher", "fast food", "quick service", "hotel",
      "housekeeper", "housekeeping", "bellhop", "concierge", "valet", "part-time",
    ],
    payType: "hourly",
    remoteRelevant: false,
    equityRelevant: false,
    tipsRelevant: true,
  },

  hourly_skilled: {
    id: "hourly_skilled",
    label: "Hourly Skilled/Trade Role",
    description: "Warehouse, manufacturing, logistics, trade, healthcare support",
    keywords: [
      "warehouse", "forklift", "picker", "packer", "shipping", "receiving",
      "manufacturing", "assembly", "production", "machinist", "welder",
      "electrician", "plumber", "hvac", "mechanic", "technician", "driver",
      "delivery", "courier", "trucker", "cdl", "logistics", "fulfillment",
      "amazon", "cna", "medical assistant", "phlebotomist", "caregiver",
      "home health aide", "security", "guard", "construction", "laborer",
    ],
    payType: "hourly",
    remoteRelevant: false,
    equityRelevant: false,
    tipsRelevant: false,
  },

  salaried_entry: {
    id: "salaried_entry",
    label: "Entry-Level Salaried",
    description: "Administrative, support, junior office roles",
    keywords: [
      "administrative", "admin assistant", "office assistant", "coordinator",
      "specialist", "associate", "junior", "entry level", "assistant",
      "customer support", "help desk", "data entry", "bookkeeper", "clerk",
      "scheduler", "dispatcher", "secretary", "front office",
    ],
    payType: "salary",
    remoteRelevant: true,
    equityRelevant: false,
    tipsRelevant: false,
  },

  salaried_professional: {
    id: "salaried_professional",
    label: "Professional Salaried",
    description: "Mid-level corporate, professional services, specialists",
    keywords: [
      "manager", "analyst", "accountant", "marketing", "hr", "human resources",
      "project manager", "program manager", "consultant", "advisor", "specialist",
      "senior", "lead", "supervisor", "director", "coordinator", "business",
      "operations", "finance", "legal", "paralegal", "recruiter", "buyer",
      "procurement", "compliance", "audit", "quality", "trainer",
    ],
    payType: "salary",
    remoteRelevant: true,
    equityRelevant: false,
    tipsRelevant: false,
  },

  tech_startup: {
    id: "tech_startup",
    label: "Tech / Startup Role",
    description: "Software, engineering, product, design roles - typically equity-eligible",
    keywords: [
      "software", "engineer", "developer", "programmer", "frontend", "backend",
      "fullstack", "full stack", "devops", "sre", "infrastructure", "cloud",
      "data scientist", "data engineer", "machine learning", "ml", "ai",
      "product manager", "product owner", "ux", "ui", "designer", "researcher",
      "startup", "tech", "saas", "fintech", "healthtech", "edtech",
      "seed", "series a", "series b", "venture", "vc-backed", "remote-first",
    ],
    payType: "salary",
    remoteRelevant: true,
    equityRelevant: true,
    tipsRelevant: false,
  },

  executive: {
    id: "executive",
    label: "Executive / Leadership",
    description: "C-suite, VP, senior leadership with complex compensation",
    keywords: [
      "ceo", "cto", "cfo", "coo", "cmo", "cio", "cpo", "chief",
      "vp", "vice president", "svp", "evp", "president", "partner",
      "principal", "executive", "head of", "general manager", "gm",
      "founder", "co-founder", "board", "c-level", "c-suite",
    ],
    payType: "salary",
    remoteRelevant: true,
    equityRelevant: true,
    tipsRelevant: false,
  },

  gig_contract: {
    id: "gig_contract",
    label: "Gig / Contract Work",
    description: "Freelance, 1099, temporary, project-based work",
    keywords: [
      "freelance", "contractor", "1099", "contract", "temporary", "temp",
      "project-based", "gig", "seasonal", "on-call", "per diem", "prn",
      "consultant", "independent", "self-employed", "agency", "staffing",
    ],
    payType: "varies",
    remoteRelevant: true,
    equityRelevant: false,
    tipsRelevant: false,
  },
};

// =============================================================================
// FIELD RELEVANCE MAP
// =============================================================================

/**
 * Field relevance levels:
 * - "required": Always ask about this for this archetype
 * - "optional": Ask if time permits or context suggests relevance
 * - "skip": Do NOT ask about this - irrelevant for this archetype
 */
export const FIELD_RELEVANCE_MAP = {
  // =========================================================================
  // ROLE OVERVIEW
  // =========================================================================
  "role_overview.visa_sponsorship": {
    hourly_service: "skip",        // Rarely relevant
    hourly_skilled: "optional",    // Some trades may need
    salaried_entry: "optional",
    salaried_professional: "optional",
    tech_startup: "required",      // Common question for global talent
    executive: "optional",
    gig_contract: "skip",
  },

  "role_overview.relocation_assistance": {
    hourly_service: "skip",
    hourly_skilled: "skip",
    salaried_entry: "optional",
    salaried_professional: "optional",
    tech_startup: "optional",
    executive: "required",         // Often part of exec packages
    gig_contract: "skip",
  },

  // =========================================================================
  // ROLE CONTENT
  // =========================================================================
  "role_content.certifications_required": {
    hourly_service: "optional",    // Food handler, etc.
    hourly_skilled: "required",    // CDL, forklift, certifications critical
    salaried_entry: "optional",
    salaried_professional: "required",  // CPA, PMP, etc.
    tech_startup: "optional",      // Some certs (AWS, etc.)
    executive: "skip",
    gig_contract: "optional",
  },

  "role_content.languages_required": {
    hourly_service: "required",    // Customer-facing, bilingual needs
    hourly_skilled: "optional",
    salaried_entry: "optional",
    salaried_professional: "optional",
    tech_startup: "optional",
    executive: "optional",
    gig_contract: "optional",
  },

  "role_content.travel_percentage": {
    hourly_service: "skip",        // No travel
    hourly_skilled: "optional",    // Some delivery/driving
    salaried_entry: "optional",
    salaried_professional: "required",  // Sales, consulting travel
    tech_startup: "optional",
    executive: "required",         // Often heavy travel
    gig_contract: "optional",
  },

  "role_content.customer_interaction_level": {
    hourly_service: "required",    // Core to the job
    hourly_skilled: "optional",
    salaried_entry: "optional",
    salaried_professional: "required",  // Many client-facing roles
    tech_startup: "optional",
    executive: "required",
    gig_contract: "optional",
  },

  "role_content.target_start_date": {
    hourly_service: "required",    // Often need to start soon
    hourly_skilled: "required",
    salaried_entry: "optional",
    salaried_professional: "optional",
    tech_startup: "optional",
    executive: "optional",
    gig_contract: "required",      // Project timelines
  },

  // =========================================================================
  // FINANCIAL REALITY
  // =========================================================================
  "financial_reality.base_compensation": {
    hourly_service: "required",
    hourly_skilled: "required",
    salaried_entry: "required",
    salaried_professional: "required",
    tech_startup: "required",
    executive: "required",
    gig_contract: "required",
  },

  "financial_reality.variable_compensation.tips": {
    hourly_service: "required",    // Tips are common
    hourly_skilled: "skip",        // No tips
    salaried_entry: "skip",
    salaried_professional: "skip",
    tech_startup: "skip",
    executive: "skip",
    gig_contract: "skip",
  },

  "financial_reality.variable_compensation.commission": {
    hourly_service: "optional",    // Some retail has commission
    hourly_skilled: "skip",
    salaried_entry: "skip",
    salaried_professional: "optional",  // Sales roles
    tech_startup: "optional",
    executive: "optional",
    gig_contract: "skip",
  },

  "financial_reality.equity": {
    hourly_service: "skip",        // Never relevant
    hourly_skilled: "skip",        // Never relevant
    salaried_entry: "skip",        // Rarely relevant
    salaried_professional: "skip", // Rarely relevant
    tech_startup: "required",      // Core to the offer
    executive: "required",         // Core to the offer
    gig_contract: "skip",
  },

  "financial_reality.bonuses": {
    hourly_service: "optional",    // Holiday bonus maybe
    hourly_skilled: "optional",
    salaried_entry: "optional",
    salaried_professional: "required",
    tech_startup: "required",
    executive: "required",
    gig_contract: "skip",
  },

  "financial_reality.raises_and_reviews": {
    hourly_service: "optional",
    hourly_skilled: "optional",
    salaried_entry: "required",
    salaried_professional: "required",
    tech_startup: "required",
    executive: "optional",
    gig_contract: "skip",
  },

  "financial_reality.hidden_financial_value": {
    hourly_service: "required",    // Discounts, meals are valuable
    hourly_skilled: "optional",
    salaried_entry: "optional",
    salaried_professional: "optional",
    tech_startup: "required",      // Perks matter
    executive: "optional",
    gig_contract: "skip",
  },

  "financial_reality.payment_reliability": {
    hourly_service: "required",    // Critical for hourly workers
    hourly_skilled: "required",
    salaried_entry: "skip",        // Assumed reliable
    salaried_professional: "skip",
    tech_startup: "skip",
    executive: "skip",
    gig_contract: "required",      // Payment terms matter
  },

  // =========================================================================
  // TIME AND LIFE
  // =========================================================================
  "time_and_life.schedule_pattern": {
    hourly_service: "required",
    hourly_skilled: "required",
    salaried_entry: "required",
    salaried_professional: "optional",
    tech_startup: "optional",
    executive: "skip",             // Execs make own schedules
    gig_contract: "required",
  },

  "time_and_life.schedule_predictability": {
    hourly_service: "required",    // Critical for shift workers
    hourly_skilled: "required",
    salaried_entry: "optional",
    salaried_professional: "skip",
    tech_startup: "skip",
    executive: "skip",
    gig_contract: "optional",
  },

  "time_and_life.flexibility.remote_allowed": {
    hourly_service: "skip",        // On-site by nature
    hourly_skilled: "skip",        // On-site by nature
    salaried_entry: "optional",
    salaried_professional: "required",
    tech_startup: "required",      // Core differentiator
    executive: "required",
    gig_contract: "required",
  },

  "time_and_life.flexibility.async_friendly": {
    hourly_service: "skip",
    hourly_skilled: "skip",
    salaried_entry: "skip",
    salaried_professional: "optional",
    tech_startup: "required",
    executive: "optional",
    gig_contract: "optional",
  },

  "time_and_life.time_off": {
    hourly_service: "optional",    // Often limited
    hourly_skilled: "optional",
    salaried_entry: "required",
    salaried_professional: "required",
    tech_startup: "required",
    executive: "optional",         // Negotiated individually
    gig_contract: "skip",          // Not applicable
  },

  "time_and_life.commute_reality": {
    hourly_service: "required",    // Daily commute matters
    hourly_skilled: "required",
    salaried_entry: "required",
    salaried_professional: "optional",  // May be hybrid
    tech_startup: "optional",
    executive: "skip",
    gig_contract: "optional",
  },

  "time_and_life.break_reality": {
    hourly_service: "required",    // Break policies critical
    hourly_skilled: "required",
    salaried_entry: "skip",        // Flexible breaks assumed
    salaried_professional: "skip",
    tech_startup: "skip",
    executive: "skip",
    gig_contract: "skip",
  },

  "time_and_life.overtime_reality": {
    hourly_service: "required",    // Overtime pay matters
    hourly_skilled: "required",
    salaried_entry: "optional",
    salaried_professional: "optional",
    tech_startup: "optional",      // "Startup hours"
    executive: "skip",
    gig_contract: "skip",
  },

  // =========================================================================
  // ENVIRONMENT
  // =========================================================================
  "environment.physical_space": {
    hourly_service: "required",
    hourly_skilled: "required",
    salaried_entry: "required",
    salaried_professional: "optional",
    tech_startup: "optional",
    executive: "skip",
    gig_contract: "optional",
  },

  "environment.workspace_quality": {
    hourly_service: "optional",
    hourly_skilled: "required",    // Safety relevant
    salaried_entry: "optional",
    salaried_professional: "optional",
    tech_startup: "optional",
    executive: "skip",
    gig_contract: "skip",
  },

  "environment.amenities": {
    hourly_service: "optional",
    hourly_skilled: "optional",
    salaried_entry: "optional",
    salaried_professional: "optional",
    tech_startup: "required",      // Perks are selling points
    executive: "skip",
    gig_contract: "skip",
  },

  "environment.safety_and_comfort": {
    hourly_service: "required",    // Standing, dress code
    hourly_skilled: "required",    // Safety is critical
    salaried_entry: "optional",
    salaried_professional: "skip",
    tech_startup: "skip",
    executive: "skip",
    gig_contract: "optional",
  },

  "environment.neighborhood": {
    hourly_service: "optional",
    hourly_skilled: "optional",
    salaried_entry: "optional",
    salaried_professional: "skip",
    tech_startup: "skip",
    executive: "skip",
    gig_contract: "skip",
  },

  // =========================================================================
  // HUMANS AND CULTURE
  // =========================================================================
  "humans_and_culture.team_composition": {
    hourly_service: "optional",
    hourly_skilled: "optional",
    salaried_entry: "required",
    salaried_professional: "required",
    tech_startup: "required",
    executive: "required",
    gig_contract: "optional",
  },

  "humans_and_culture.management_style": {
    hourly_service: "optional",
    hourly_skilled: "optional",
    salaried_entry: "required",
    salaried_professional: "required",
    tech_startup: "required",
    executive: "optional",         // They ARE management
    gig_contract: "skip",
  },

  "humans_and_culture.social_dynamics": {
    hourly_service: "optional",
    hourly_skilled: "optional",
    salaried_entry: "optional",
    salaried_professional: "optional",
    tech_startup: "required",      // Culture is a selling point
    executive: "optional",
    gig_contract: "skip",
  },

  "humans_and_culture.communication_culture": {
    hourly_service: "skip",
    hourly_skilled: "skip",
    salaried_entry: "optional",
    salaried_professional: "required",
    tech_startup: "required",
    executive: "optional",
    gig_contract: "skip",
  },

  "humans_and_culture.turnover_context": {
    hourly_service: "optional",
    hourly_skilled: "optional",
    salaried_entry: "optional",
    salaried_professional: "optional",
    tech_startup: "optional",
    executive: "optional",
    gig_contract: "skip",
  },

  // =========================================================================
  // GROWTH TRAJECTORY
  // =========================================================================
  "growth_trajectory.learning_opportunities": {
    hourly_service: "skip",        // Limited growth
    hourly_skilled: "optional",    // Certifications maybe
    salaried_entry: "required",    // Big draw for entry level
    salaried_professional: "required",
    tech_startup: "required",
    executive: "skip",
    gig_contract: "skip",
  },

  "growth_trajectory.formal_development": {
    hourly_service: "skip",
    hourly_skilled: "optional",
    salaried_entry: "optional",
    salaried_professional: "required",
    tech_startup: "required",
    executive: "skip",
    gig_contract: "skip",
  },

  "growth_trajectory.career_path": {
    hourly_service: "skip",
    hourly_skilled: "optional",
    salaried_entry: "required",
    salaried_professional: "required",
    tech_startup: "required",
    executive: "skip",             // Already at the top
    gig_contract: "skip",
  },

  "growth_trajectory.skill_building": {
    hourly_service: "skip",
    hourly_skilled: "optional",
    salaried_entry: "optional",
    salaried_professional: "optional",
    tech_startup: "required",      // Tech stack matters
    executive: "skip",
    gig_contract: "optional",
  },

  // =========================================================================
  // STABILITY SIGNALS
  // =========================================================================
  "stability_signals.company_health": {
    hourly_service: "skip",
    hourly_skilled: "skip",
    salaried_entry: "optional",
    salaried_professional: "required",
    tech_startup: "required",      // Runway, funding status
    executive: "required",
    gig_contract: "skip",
  },

  "stability_signals.job_security": {
    hourly_service: "optional",
    hourly_skilled: "optional",
    salaried_entry: "required",
    salaried_professional: "required",
    tech_startup: "optional",      // Inherent risk accepted
    executive: "optional",
    gig_contract: "required",      // Contract terms matter
  },

  "stability_signals.job_security.background_check_required": {
    hourly_service: "optional",    // Some retail/cash handling
    hourly_skilled: "required",    // Warehouse, driving often require
    salaried_entry: "optional",
    salaried_professional: "optional",
    tech_startup: "optional",
    executive: "required",         // Almost always checked
    gig_contract: "optional",
  },

  "stability_signals.job_security.clearance_required": {
    hourly_service: "skip",
    hourly_skilled: "optional",    // Some government contractors
    salaried_entry: "optional",
    salaried_professional: "optional",
    tech_startup: "optional",
    executive: "optional",
    gig_contract: "optional",
  },

  "stability_signals.benefits_security": {
    hourly_service: "optional",    // Often limited/none
    hourly_skilled: "optional",
    salaried_entry: "required",
    salaried_professional: "required",
    tech_startup: "required",
    executive: "optional",         // Negotiated
    gig_contract: "skip",          // Not applicable
  },

  // =========================================================================
  // ROLE REALITY
  // =========================================================================
  "role_reality.day_to_day": {
    hourly_service: "required",
    hourly_skilled: "required",
    salaried_entry: "required",
    salaried_professional: "required",
    tech_startup: "required",
    executive: "required",
    gig_contract: "required",
  },

  "role_reality.autonomy": {
    hourly_service: "optional",
    hourly_skilled: "optional",
    salaried_entry: "optional",
    salaried_professional: "required",
    tech_startup: "required",
    executive: "required",
    gig_contract: "required",
  },

  "role_reality.workload": {
    hourly_service: "required",
    hourly_skilled: "required",
    salaried_entry: "required",
    salaried_professional: "required",
    tech_startup: "required",
    executive: "optional",
    gig_contract: "required",
  },

  "role_reality.success_metrics": {
    hourly_service: "optional",
    hourly_skilled: "optional",
    salaried_entry: "optional",
    salaried_professional: "required",
    tech_startup: "required",
    executive: "required",
    gig_contract: "optional",
  },

  "role_reality.pain_points_honesty": {
    hourly_service: "optional",
    hourly_skilled: "optional",
    salaried_entry: "optional",
    salaried_professional: "optional",
    tech_startup: "required",      // Transparency valued
    executive: "optional",
    gig_contract: "optional",
  },

  // =========================================================================
  // UNIQUE VALUE
  // =========================================================================
  "unique_value.hidden_perks": {
    hourly_service: "required",    // Discounts, free food
    hourly_skilled: "optional",
    salaried_entry: "optional",
    salaried_professional: "optional",
    tech_startup: "required",
    executive: "optional",
    gig_contract: "skip",
  },

  "unique_value.status_signals": {
    hourly_service: "skip",
    hourly_skilled: "skip",
    salaried_entry: "skip",
    salaried_professional: "optional",
    tech_startup: "optional",
    executive: "required",
    gig_contract: "skip",
  },

  "unique_value.personal_meaning": {
    hourly_service: "optional",
    hourly_skilled: "optional",
    salaried_entry: "optional",
    salaried_professional: "optional",
    tech_startup: "required",      // Mission-driven
    executive: "required",
    gig_contract: "skip",
  },

  "unique_value.rare_offerings": {
    hourly_service: "optional",
    hourly_skilled: "optional",
    salaried_entry: "optional",
    salaried_professional: "optional",
    tech_startup: "required",
    executive: "required",
    gig_contract: "optional",
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Detect the most likely archetype based on role title and context
 *
 * @param {object} options
 * @param {string} [options.roleTitle] - The job title
 * @param {string} [options.companyIndustry] - The company's industry
 * @param {string} [options.payFrequency] - "hourly" or "salary"
 * @param {boolean} [options.remoteAllowed] - Whether remote work is allowed
 * @param {boolean} [options.hasEquity] - Whether equity is offered
 * @returns {string} - The archetype ID
 */
export function detectRoleArchetype({
  roleTitle = "",
  companyIndustry = "",
  payFrequency = null,
  remoteAllowed = null,
  hasEquity = null,
} = {}) {
  const titleLower = roleTitle.toLowerCase();
  const industryLower = companyIndustry.toLowerCase();

  // Score each archetype based on keyword matches
  const scores = {};

  for (const [archetypeId, archetype] of Object.entries(ROLE_ARCHETYPES)) {
    let score = 0;

    // Check keyword matches in title
    for (const keyword of archetype.keywords) {
      if (titleLower.includes(keyword.toLowerCase())) {
        score += 2;  // Title match is strong signal
      }
      if (industryLower.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    // Boost based on pay type signals
    if (payFrequency === "hourly" && archetype.payType === "hourly") {
      score += 3;
    }
    if (payFrequency === "salary" && archetype.payType === "salary") {
      score += 1;
    }

    // Boost based on equity signal
    if (hasEquity === true && archetype.equityRelevant) {
      score += 3;
    }
    if (hasEquity === false && archetype.equityRelevant) {
      score -= 2;
    }

    // Boost based on remote signal
    if (remoteAllowed === true && archetype.remoteRelevant) {
      score += 1;
    }
    if (remoteAllowed === false && !archetype.remoteRelevant) {
      score += 1;
    }

    scores[archetypeId] = score;
  }

  // Find the highest scoring archetype
  let bestArchetype = "salaried_professional";  // Default fallback
  let bestScore = -1;

  for (const [archetypeId, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestArchetype = archetypeId;
    }
  }

  return bestArchetype;
}

/**
 * Get the relevance level for a specific field and archetype
 *
 * @param {string} fieldPath - Dot-notation path (e.g., "financial_reality.equity")
 * @param {string} archetype - The archetype ID
 * @returns {"required"|"optional"|"skip"} - The relevance level
 */
export function getFieldRelevance(fieldPath, archetype) {
  // Normalize field path to top-level section (e.g., "financial_reality.equity.offered" -> "financial_reality.equity")
  const parts = fieldPath.split(".");
  const normalizedPath = parts.slice(0, 2).join(".");

  const fieldConfig = FIELD_RELEVANCE_MAP[normalizedPath];

  if (!fieldConfig) {
    // Unknown field - default to optional
    return "optional";
  }

  return fieldConfig[archetype] || "optional";
}

/**
 * Filter a list of fields to only include relevant ones for an archetype
 *
 * @param {string[]} fields - Array of field paths
 * @param {string} archetype - The archetype ID
 * @param {boolean} includeOptional - Whether to include "optional" fields (default: true)
 * @returns {object} - { relevant: string[], skipped: string[] }
 */
export function filterFieldsByArchetype(fields, archetype, includeOptional = true) {
  const relevant = [];
  const skipped = [];

  for (const field of fields) {
    const relevance = getFieldRelevance(field, archetype);

    if (relevance === "skip") {
      skipped.push(field);
    } else if (relevance === "required" || (relevance === "optional" && includeOptional)) {
      relevant.push(field);
    }
  }

  // Sort relevant fields: required first, then optional
  relevant.sort((a, b) => {
    const relA = getFieldRelevance(a, archetype);
    const relB = getFieldRelevance(b, archetype);
    if (relA === "required" && relB !== "required") return -1;
    if (relA !== "required" && relB === "required") return 1;
    return 0;
  });

  return { relevant, skipped };
}

/**
 * Get human-readable skip reasons for fields
 *
 * @param {string[]} skippedFields - Array of field paths that were skipped
 * @param {string} archetype - The archetype ID
 * @returns {object[]} - Array of { field, reason } objects
 */
export function getSkipReasons(skippedFields, archetype) {
  const archetypeData = ROLE_ARCHETYPES[archetype];
  if (!archetypeData) return [];

  const reasons = [];

  for (const field of skippedFields) {
    let reason = "";

    // Generate context-appropriate skip reason
    if (field.includes("equity")) {
      if (!archetypeData.equityRelevant) {
        reason = "Equity is not typically offered for this role type";
      }
    } else if (field.includes("tips")) {
      if (!archetypeData.tipsRelevant) {
        reason = "Tips are not applicable for this role type";
      }
    } else if (field.includes("remote") || field.includes("async")) {
      if (!archetypeData.remoteRelevant) {
        reason = "This role is on-site by nature";
      }
    } else if (field.includes("break_reality")) {
      if (archetypeData.payType === "salary") {
        reason = "Break policies are typically flexible for salaried roles";
      }
    } else if (field.includes("career_path") || field.includes("learning")) {
      if (archetype === "gig_contract") {
        reason = "Not applicable for contract/gig work";
      } else if (archetype === "executive") {
        reason = "Executive roles have self-directed career paths";
      }
    } else if (field.includes("payment_reliability")) {
      if (archetypeData.payType === "salary") {
        reason = "Payment reliability is assumed for salaried positions";
      }
    } else {
      reason = `Not typically relevant for ${archetypeData.label} positions`;
    }

    reasons.push({ field, reason });
  }

  return reasons;
}

/**
 * Get the archetype label for display
 *
 * @param {string} archetypeId
 * @returns {string}
 */
export function getArchetypeLabel(archetypeId) {
  return ROLE_ARCHETYPES[archetypeId]?.label || "Unknown Role Type";
}

/**
 * Get all archetype IDs
 *
 * @returns {string[]}
 */
export function getAllArchetypeIds() {
  return Object.keys(ROLE_ARCHETYPES);
}
