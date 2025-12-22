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
    options: [
      { id: "option1", label: "Option 1", icon: "circle" },
      { id: "option2", label: "Option 2", icon: "circle" },
      { id: "option3", label: "Option 3", icon: "circle" },
    ],
  },
  circular_gauge: {
    step: 1,
    prefix: "",
    unit: "",
  },
  linear_slider: {
    min: 0,
    max: 100,
    step: 1,
    label: "Value",
    unit: "",
    prefix: "",
  },
  stacked_bar: {
    total: 100,
    autoBalance: true,
    segments: [
      { id: "segment1", label: "Segment 1", color: "#6366f1", value: 33 },
      { id: "segment2", label: "Segment 2", color: "#8b5cf6", value: 33 },
      { id: "segment3", label: "Segment 3", color: "#a855f7", value: 34 },
    ],
  },
  segmented_rows: {
    segments: [
      { value: "never", label: "Never", color: "#22c55e" },
      { value: "rare", label: "Rare", color: "#84cc16" },
      { value: "sometimes", label: "Sometimes", color: "#eab308" },
      { value: "often", label: "Often", color: "#f97316" },
      { value: "always", label: "Always", color: "#ef4444" },
    ],
    rows: [
      { id: "row1", label: "Item 1" },
      { id: "row2", label: "Item 2" },
      { id: "row3", label: "Item 3" },
    ],
  },
  toggle_list: {
    variant: "default",
    singleSelect: false,
    items: [
      { id: "item1", label: "Item 1", icon: "circle" },
      { id: "item2", label: "Item 2", icon: "circle" },
      { id: "item3", label: "Item 3", icon: "circle" },
    ],
  },
  smart_textarea: {
    rows: 4,
  },
  counter_stack: {
    totalUnit: "days",
    items: [
      { id: "item1", label: "Item 1", unit: "days", min: 0, max: 30 },
      { id: "item2", label: "Item 2", unit: "days", min: 0, max: 30 },
      { id: "item3", label: "Item 3", unit: "days", min: 0, max: 30 },
    ],
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
    dimensions: [
      { id: "dim1", label: "Dimension 1", value: 50, icon: "circle" },
      { id: "dim2", label: "Dimension 2", value: 50, icon: "circle" },
      { id: "dim3", label: "Dimension 3", value: 50, icon: "circle" },
      { id: "dim4", label: "Dimension 4", value: 50, icon: "circle" },
      { id: "dim5", label: "Dimension 5", value: 50, icon: "circle" },
    ],
  },
  detailed_cards: {
    layout: "list",
    multiple: false,
    options: [
      { id: "option1", title: "Option 1", description: "Description 1", icon: "circle" },
      { id: "option2", title: "Option 2", description: "Description 2", icon: "circle" },
      { id: "option3", title: "Option 3", description: "Description 3", icon: "circle" },
    ],
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
      size: 300,
    },
    variants: {
      hourly: {
        label: "Hourly Rate",
        min: 15,
        max: 100,
        step: 1,
        unit: "/hr",
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

  "time_and_life.schedule_pattern.typical_hours_per_week": {
    recommendedTool: "linear_slider",
    defaultProps: {
      label: "Hours Per Week",
      min: 20,
      max: 60,
      step: 1,
      unit: " hrs",
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
      size: 300,
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
// PHASE 3: TEMPLATE SHORTCUTS (LLM-Friendly Names)
// =============================================================================
// Short, memorable names that map to schema paths - reduces LLM tokens further

export const TEMPLATE_SHORTCUTS = {
  // Financial
  salary: "financial_reality.base_compensation.amount_or_range",
  hourly_rate: "financial_reality.base_compensation.amount_or_range", // variant: hourly
  variable_comp: "financial_reality.variable_compensation.types",
  equity: "financial_reality.equity.offered",
  benefits: "stability_signals.benefits_security.health_insurance",

  // Time
  schedule_type: "time_and_life.schedule_pattern.type",
  remote_flex: "time_and_life.flexibility.remote_frequency",
  hours_per_week: "time_and_life.schedule_pattern.typical_hours_per_week",
  pto: "time_and_life.time_off.pto_days",
  overtime: "time_and_life.overtime_reality.overtime_expected",

  // Environment
  workspace: "environment.physical_space.type",
  physical_demands: "environment.safety_and_comfort.physical_demands",

  // Culture
  team_size: "humans_and_culture.team_composition.team_size",
  management: "humans_and_culture.management_style.management_approach",

  // Growth
  tech_stack: "growth_trajectory.skill_building.technologies_used",
  career_path: "growth_trajectory.career_path.promotion_path",

  // Role
  day_in_life: "role_reality.day_to_day.typical_day_description",
  autonomy: "role_reality.autonomy.decision_authority",

  // Unique
  special: "unique_value.rare_offerings.what_makes_this_special",
};

/**
 * Resolve a template shortcut to its full schema path
 * @param {string} shortcut - Short name or full path
 * @returns {string} - Full schema path
 */
export function resolveTemplateShortcut(shortcut) {
  return TEMPLATE_SHORTCUTS[shortcut] || shortcut;
}

/**
 * Get a template by shortcut name
 * @param {string} shortcut - Short name (e.g., "salary", "benefits")
 * @param {object} options - Options including variant and overrides
 * @returns {object|null} - UI tool configuration
 */
export function getTemplateByShortcut(shortcut, options = {}) {
  const schemaPath = resolveTemplateShortcut(shortcut);

  // Special handling for variants
  if (shortcut === "hourly_rate") {
    return getTemplateForSchemaPath(schemaPath, { ...options, variant: "hourly" });
  }

  return getTemplateForSchemaPath(schemaPath, options);
}

// =============================================================================
// PHASE 3: LLM TEMPLATE CATALOG (Condensed for Prompt Injection)
// =============================================================================

/**
 * Generate a condensed template catalog for the LLM prompt
 * This reduces tokens while giving LLM awareness of available templates
 * @returns {string} - Markdown-formatted template catalog
 */
export function generateTemplateCatalog() {
  const catalog = `## AVAILABLE TEMPLATES (Use \`template_ref\` to auto-load)

Instead of building full props, you can reference a pre-built template:

| Shortcut | Tool | Description |
|----------|------|-------------|
| salary | circular_gauge | Salary input with gradient dial |
| hourly_rate | circular_gauge | Hourly rate variant ($15-100/hr) |
| variable_comp | icon_grid | Tips, commission, bonuses selector |
| equity | equity_builder | Stock options & vesting wizard |
| benefits | icon_grid | Health, dental, 401k, PTO selector |
| schedule_type | detailed_cards | Fixed/rotating/flexible cards |
| remote_flex | gradient_slider | Remote ↔ On-site spectrum |
| hours_per_week | linear_slider | Weekly hours (20-60 hrs) |
| pto | counter_stack | Vacation/sick/personal day counters |
| overtime | segmented_rows | Overtime/weekend/on-call frequency |
| workspace | gradient_cards | Office/retail/warehouse/remote |
| physical_demands | segmented_rows | Standing/lifting/walking frequency |
| team_size | circular_gauge | 1-50 team members dial |
| management | bipolar_scale | Hands-off↔on, Flexible↔Structured |
| tech_stack | chip_cloud | Frontend/backend tech groups |
| career_path | timeline_builder | Year 1 / Year 2-3 / Year 5+ |
| day_in_life | smart_textarea | Rotating prompts for typical day |
| autonomy | radar_chart | 5-axis decision authority chart |
| special | smart_textarea | "What makes this special?" prompts |

### How to Use Templates

**Option 1: Reference by shortcut (PREFERRED - saves tokens)**
\`\`\`json
{
  "ui_tool": {
    "template_ref": "benefits",
    "overrides": { "title": "What perks come with this role?" }
  }
}
\`\`\`

**Option 2: Build custom (when template doesn't fit)**
\`\`\`json
{
  "ui_tool": {
    "type": "icon_grid",
    "props": { ... full props ... }
  }
}
\`\`\`

Templates auto-apply smart defaults. Only specify \`overrides\` for custom values.
`;

  return catalog;
}

// =============================================================================
// PHASE 3: A2UI EXPORT FORMAT
// =============================================================================
// Convert our format to Google A2UI-compatible format for interoperability

/**
 * Convert our UI tool format to A2UI-compatible format
 * A2UI separates surface (UI) from data model updates
 *
 * @param {object} response - Our response format
 * @returns {object} - A2UI-compatible format
 */
export function convertToA2UIFormat(response) {
  const { message, ui_tool, extraction, currently_asking_field } = response;

  // A2UI format structure
  const a2uiResponse = {
    // Surface update - the UI components
    surfaceUpdate: {
      components: [],
    },
    // Data model update - extracted data
    dataModelUpdate: {
      updates: extraction?.updates || {},
    },
    // Agent message
    agentMessage: message,
    // Metadata
    metadata: {
      targetField: currently_asking_field,
      timestamp: new Date().toISOString(),
    },
  };

  // Convert ui_tool to A2UI component format
  if (ui_tool) {
    a2uiResponse.surfaceUpdate.components.push({
      componentId: ui_tool.componentId || generateComponentId(ui_tool.type, currently_asking_field),
      componentType: mapToolTypeToA2UI(ui_tool.type),
      props: ui_tool.props,
      binding: ui_tool._binding || {
        schemaPath: currently_asking_field,
      },
    });
  }

  return a2uiResponse;
}

/**
 * Map our tool types to A2UI component type conventions
 * @param {string} toolType - Our tool type
 * @returns {string} - A2UI component type
 */
function mapToolTypeToA2UI(toolType) {
  // A2UI uses PascalCase for component types
  const mapping = {
    circular_gauge: "CircularGauge",
    stacked_bar: "StackedBar",
    gradient_slider: "GradientSlider",
    bipolar_scale: "BipolarScale",
    radar_chart: "RadarChart",
    icon_grid: "IconGrid",
    detailed_cards: "DetailedCards",
    gradient_cards: "GradientCards",
    toggle_list: "ToggleList",
    chip_cloud: "ChipCloud",
    segmented_rows: "SegmentedRows",
    counter_stack: "CounterStack",
    smart_textarea: "SmartTextarea",
    equity_builder: "EquityBuilder",
    timeline_builder: "TimelineBuilder",
    // Add more as needed
  };

  return mapping[toolType] || toolType.split("_").map(
    word => word.charAt(0).toUpperCase() + word.slice(1)
  ).join("");
}

/**
 * Process a template reference from LLM response
 * If ui_tool contains template_ref, expand it to full tool config
 *
 * @param {object} uiTool - UI tool that may contain template_ref
 * @returns {object} - Expanded UI tool
 */
export function expandTemplateRef(uiTool) {
  if (!uiTool) return uiTool;

  // If it's a template reference, expand it
  if (uiTool.template_ref) {
    const template = getTemplateByShortcut(uiTool.template_ref, {
      overrides: uiTool.overrides || {},
    });

    if (template) {
      return template;
    }

    // Fallback: template not found, return as-is (will need full props)
    console.warn(`Template not found: ${uiTool.template_ref}`);
    return uiTool;
  }

  // Not a template reference, return as-is
  return uiTool;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Phase 2
  SMART_DEFAULTS,
  SCHEMA_BINDINGS,
  generateComponentId,
  applySmartDefaults,
  getTemplateForSchemaPath,
  getRecommendedToolForPath,
  hasTemplateForPath,
  enhanceUITool,
  // Phase 3
  TEMPLATE_SHORTCUTS,
  resolveTemplateShortcut,
  getTemplateByShortcut,
  generateTemplateCatalog,
  convertToA2UIFormat,
  expandTemplateRef,
};
