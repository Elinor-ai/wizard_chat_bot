/**
 * UI Templates System (A2UI-Inspired)
 *
 * This module provides:
 * 1. Pre-built UI templates for common interview questions
 * 2. Auto-binding configuration - maps UI tools to schema paths
 * 3. Smart defaults application - applies defaults server-side
 * 4. Component ID generation - enables tracking and incremental updates
 *
 * The LLM can reference templates by name instead of building props from scratch,
 * reducing token usage and errors.
 */

import { nanoid } from "nanoid";

// =============================================================================
// SMART DEFAULTS - Applied server-side to reduce LLM burden
// =============================================================================

export const SMART_DEFAULTS = {
  icon_grid: {
    columns: 3,
    multiple: false,
  },
  circular_gauge: {
    step: 1,
    prefix: "",
    unit: "",
  },
  stacked_bar: {
    total: 100,
    autoBalance: true,
  },
  segmented_rows: {
    segments: [
      { value: "never", label: "Never", color: "#22c55e" },
      { value: "rare", label: "Rare", color: "#84cc16" },
      { value: "sometimes", label: "Sometimes", color: "#eab308" },
      { value: "often", label: "Often", color: "#f97316" },
      { value: "always", label: "Always", color: "#ef4444" },
    ],
  },
  toggle_list: {
    variant: "default",
    singleSelect: false,
  },
  smart_textarea: {
    rows: 4,
  },
  counter_stack: {
    totalUnit: "days",
  },
  gradient_slider: {
    min: 0,
    max: 100,
  },
  bipolar_scale: {
    min: -50,
    max: 50,
  },
  radar_chart: {
    max: 100,
  },
  detailed_cards: {
    layout: "list",
    multiple: false,
  },
  gradient_cards: {
    columns: 2,
    multiple: false,
  },
};

// =============================================================================
// AUTO-BINDING CONFIGURATION
// Maps schema paths to recommended UI tools and default props
// =============================================================================

export const SCHEMA_BINDINGS = {
  // Financial Reality
  "financial_reality.base_compensation.amount_or_range": {
    recommendedTool: "circular_gauge",
    defaultProps: {
      label: "Base Compensation",
      min: 30000,
      max: 200000,
      step: 5000,
      prefix: "$",
      markers: [
        { value: 50000, label: "Entry" },
        { value: 100000, label: "Market" },
        { value: 150000, label: "Senior" },
      ],
    },
    variants: {
      hourly: {
        label: "Hourly Rate",
        min: 15,
        max: 100,
        step: 1,
        unit: "/hr",
        markers: [
          { value: 25, label: "Entry" },
          { value: 50, label: "Skilled" },
          { value: 75, label: "Expert" },
        ],
      },
    },
  },

  "financial_reality.variable_compensation.types": {
    recommendedTool: "icon_grid",
    defaultProps: {
      title: "Variable Compensation",
      multiple: true,
      options: [
        { id: "tips", label: "Tips", icon: "hand-coins" },
        { id: "commission", label: "Commission", icon: "percent" },
        { id: "bonus", label: "Performance Bonus", icon: "trophy" },
        { id: "spiffs", label: "Spiffs/Incentives", icon: "zap" },
      ],
    },
  },

  "financial_reality.equity.offered": {
    recommendedTool: "equity_builder",
    defaultProps: {
      title: "Equity Package",
    },
  },

  "stability_signals.benefits_security.health_insurance": {
    recommendedTool: "icon_grid",
    defaultProps: {
      title: "Benefits Package",
      multiple: true,
      columns: 3,
      options: [
        { id: "health", label: "Health Insurance", icon: "heart-pulse" },
        { id: "dental", label: "Dental", icon: "smile" },
        { id: "vision", label: "Vision", icon: "eye" },
        { id: "401k", label: "401k Match", icon: "piggy-bank" },
        { id: "pto", label: "PTO", icon: "palm-tree" },
        { id: "remote", label: "Remote Work", icon: "home" },
      ],
    },
  },

  // Time and Life
  "time_and_life.schedule_pattern.type": {
    recommendedTool: "detailed_cards",
    defaultProps: {
      title: "Schedule Type",
      multiple: false,
      options: [
        {
          id: "fixed",
          title: "Fixed Schedule",
          description: "Same hours every week",
          icon: "calendar",
        },
        {
          id: "rotating",
          title: "Rotating Shifts",
          description: "Shifts change week to week",
          icon: "refresh-cw",
        },
        {
          id: "flexible",
          title: "Flexible Hours",
          description: "Choose your own hours",
          icon: "clock",
        },
        {
          id: "on-call",
          title: "On-Call",
          description: "Available when needed",
          icon: "phone",
        },
      ],
    },
  },

  "time_and_life.flexibility.remote_frequency": {
    recommendedTool: "gradient_slider",
    defaultProps: {
      title: "Remote Work Flexibility",
      leftLabel: "Fully Remote",
      rightLabel: "Fully On-site",
    },
  },

  "time_and_life.time_off.pto_days": {
    recommendedTool: "counter_stack",
    defaultProps: {
      title: "Paid Time Off",
      items: [
        { id: "vacation", label: "Vacation Days", unit: "days", min: 0, max: 30 },
        { id: "sick", label: "Sick Days", unit: "days", min: 0, max: 15 },
        { id: "personal", label: "Personal Days", unit: "days", min: 0, max: 10 },
      ],
    },
  },

  "time_and_life.overtime_reality.overtime_expected": {
    recommendedTool: "segmented_rows",
    defaultProps: {
      title: "Overtime Expectations",
      rows: [
        { id: "overtime", label: "Overtime Required", icon: "clock" },
        { id: "weekend", label: "Weekend Work", icon: "calendar" },
        { id: "oncall", label: "On-Call Duties", icon: "phone" },
      ],
    },
  },

  // Environment
  "environment.physical_space.type": {
    recommendedTool: "gradient_cards",
    defaultProps: {
      title: "Work Environment",
      multiple: false,
      options: [
        { id: "office", label: "Office", icon: "building" },
        { id: "retail", label: "Retail/Store", icon: "shopping-bag" },
        { id: "warehouse", label: "Warehouse", icon: "warehouse" },
        { id: "outdoor", label: "Outdoor/Field", icon: "sun" },
        { id: "remote", label: "Remote/Home", icon: "home" },
      ],
    },
  },

  "environment.safety_and_comfort.physical_demands": {
    recommendedTool: "segmented_rows",
    defaultProps: {
      title: "Physical Requirements",
      rows: [
        { id: "standing", label: "Standing", icon: "person-standing" },
        { id: "lifting", label: "Heavy Lifting", icon: "weight" },
        { id: "walking", label: "Walking/Moving", icon: "footprints" },
        { id: "sitting", label: "Desk Work", icon: "armchair" },
      ],
    },
  },

  // Culture
  "humans_and_culture.team_composition.team_size": {
    recommendedTool: "circular_gauge",
    defaultProps: {
      label: "Team Size",
      min: 1,
      max: 50,
      step: 1,
      unit: " people",
      markers: [
        { value: 5, label: "Small" },
        { value: 15, label: "Medium" },
        { value: 30, label: "Large" },
      ],
    },
  },

  "humans_and_culture.management_style.management_approach": {
    recommendedTool: "bipolar_scale",
    defaultProps: {
      title: "Management Style",
      items: [
        { id: "autonomy", leftLabel: "Hands-off", rightLabel: "Hands-on", value: 0 },
        { id: "structure", leftLabel: "Flexible", rightLabel: "Structured", value: 0 },
        { id: "feedback", leftLabel: "Informal", rightLabel: "Formal", value: 0 },
      ],
    },
  },

  // Growth
  "growth_trajectory.skill_building.technologies_used": {
    recommendedTool: "chip_cloud",
    defaultProps: {
      title: "Tech Stack & Tools",
      groups: [
        {
          groupId: "frontend",
          groupLabel: "Frontend",
          items: [
            { id: "react", label: "React" },
            { id: "vue", label: "Vue" },
            { id: "angular", label: "Angular" },
          ],
        },
        {
          groupId: "backend",
          groupLabel: "Backend",
          items: [
            { id: "node", label: "Node.js" },
            { id: "python", label: "Python" },
            { id: "java", label: "Java" },
          ],
        },
      ],
    },
  },

  "growth_trajectory.career_path.promotion_path": {
    recommendedTool: "timeline_builder",
    defaultProps: {
      title: "Career Progression",
      points: [
        { id: "y1", label: "Year 1" },
        { id: "y2", label: "Year 2-3" },
        { id: "y5", label: "Year 5+" },
      ],
    },
  },

  // Role Reality
  "role_reality.day_to_day.typical_day_description": {
    recommendedTool: "smart_textarea",
    defaultProps: {
      title: "A Day in the Life",
      prompts: [
        "Walk me through a typical day...",
        "What does the first hour look like?",
        "How does the day usually wrap up?",
      ],
    },
  },

  "role_reality.autonomy.decision_authority": {
    recommendedTool: "radar_chart",
    defaultProps: {
      title: "Autonomy & Authority",
      dimensions: [
        { id: "decisions", label: "Decision Making", value: 50, icon: "check-circle" },
        { id: "schedule", label: "Schedule Control", value: 50, icon: "calendar" },
        { id: "methods", label: "Work Methods", value: 50, icon: "settings" },
        { id: "tools", label: "Tool Choice", value: 50, icon: "wrench" },
        { id: "priorities", label: "Set Priorities", value: 50, icon: "list-ordered" },
      ],
    },
  },

  // Unique Value
  "unique_value.rare_offerings.what_makes_this_special": {
    recommendedTool: "smart_textarea",
    defaultProps: {
      title: "What Makes This Role Special?",
      prompts: [
        "What would surprise candidates about this role?",
        "What do employees brag about to friends?",
        "What's the 'hidden gem' of working here?",
      ],
    },
  },
};

// =============================================================================
// COMPONENT ID GENERATION
// =============================================================================

/**
 * Generate a unique component ID for tracking
 * @param {string} toolType - The UI tool type
 * @param {string} schemaPath - The schema path being targeted
 * @returns {string} - Unique component ID
 */
export function generateComponentId(toolType, schemaPath) {
  const pathSlug = schemaPath ? schemaPath.replace(/\./g, "_") : "generic";
  return `${toolType}_${pathSlug}_${nanoid(6)}`;
}

// =============================================================================
// SMART DEFAULTS APPLICATION
// =============================================================================

/**
 * Apply smart defaults to a UI tool configuration
 * @param {object} uiTool - The UI tool from LLM response
 * @returns {object} - UI tool with defaults applied
 */
export function applySmartDefaults(uiTool) {
  if (!uiTool || !uiTool.type) {
    return uiTool;
  }

  const defaults = SMART_DEFAULTS[uiTool.type];
  if (!defaults) {
    return uiTool;
  }

  // Merge defaults with provided props (provided props take precedence)
  return {
    ...uiTool,
    props: {
      ...defaults,
      ...uiTool.props,
    },
  };
}

// =============================================================================
// TEMPLATE RETRIEVAL
// =============================================================================

/**
 * Get a pre-built template for a schema path
 * @param {string} schemaPath - The Golden Schema path
 * @param {object} options - Optional overrides
 * @param {string} [options.variant] - Template variant (e.g., 'hourly' for compensation)
 * @param {object} [options.overrides] - Props to override
 * @returns {object|null} - UI tool configuration or null if no template exists
 */
export function getTemplateForSchemaPath(schemaPath, options = {}) {
  const binding = SCHEMA_BINDINGS[schemaPath];
  if (!binding) {
    return null;
  }

  const { variant, overrides = {} } = options;

  // Get base props, optionally using a variant
  let baseProps = binding.defaultProps;
  if (variant && binding.variants && binding.variants[variant]) {
    baseProps = { ...baseProps, ...binding.variants[variant] };
  }

  // Apply smart defaults
  const toolWithDefaults = applySmartDefaults({
    type: binding.recommendedTool,
    props: baseProps,
  });

  // Apply any overrides
  const finalTool = {
    ...toolWithDefaults,
    props: {
      ...toolWithDefaults.props,
      ...overrides,
    },
    // Add component ID for tracking
    componentId: generateComponentId(binding.recommendedTool, schemaPath),
    // Add binding metadata
    _binding: {
      schemaPath,
      variant: variant || null,
    },
  };

  return finalTool;
}

/**
 * Get the recommended tool type for a schema path
 * @param {string} schemaPath - The Golden Schema path
 * @returns {string|null} - Recommended tool type or null
 */
export function getRecommendedToolForPath(schemaPath) {
  const binding = SCHEMA_BINDINGS[schemaPath];
  return binding ? binding.recommendedTool : null;
}

/**
 * Check if a schema path has a pre-built template
 * @param {string} schemaPath - The Golden Schema path
 * @returns {boolean}
 */
export function hasTemplateForPath(schemaPath) {
  return schemaPath in SCHEMA_BINDINGS;
}

// =============================================================================
// ENHANCED NORMALIZATION (Extends existing normalizeUIToolProps)
// =============================================================================

/**
 * Enhanced normalization that applies smart defaults and generates component IDs
 * @param {object} uiTool - Raw UI tool from LLM
 * @param {string} schemaPath - The schema path being targeted (if known)
 * @returns {object} - Normalized and enhanced UI tool
 */
export function enhanceUITool(uiTool, schemaPath = null) {
  if (!uiTool || !uiTool.type) {
    return uiTool;
  }

  // Apply smart defaults
  let enhanced = applySmartDefaults(uiTool);

  // Generate component ID if not present
  if (!enhanced.componentId) {
    enhanced.componentId = generateComponentId(enhanced.type, schemaPath);
  }

  // Add binding metadata if schema path is known
  if (schemaPath) {
    enhanced._binding = {
      schemaPath,
      autoGenerated: false,
    };
  }

  return enhanced;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  SMART_DEFAULTS,
  SCHEMA_BINDINGS,
  generateComponentId,
  applySmartDefaults,
  getTemplateForSchemaPath,
  getRecommendedToolForPath,
  hasTemplateForPath,
  enhanceUITool,
};
