/**
 * UI Tools Schema for Golden Interviewer Agent
 *
 * This module defines all available UI components that the LLM can use
 * to create engaging interview questions. The schema is derived from
 * the frontend component registry.
 */

// =============================================================================
// UI TOOLS SCHEMA
// =============================================================================

export const UI_TOOLS_SCHEMA = {
  // ===========================================================================
  // VISUAL QUANTIFIERS & SLIDERS
  // ===========================================================================

  circular_gauge: {
    name: "circular_gauge",
    description:
      "A circular SVG slider for selecting numerical values within a range. Ideal for salary, budget, team size, or any numeric input where a visual dial metaphor works well.",
    category: "visual_quantifiers",
    valueType: "number",
    props: {
      label: {
        type: "string",
        description: "Title displayed in the center of the gauge above the value",
        required: false,
        example: "Annual Salary"
      },
      min: {
        type: "number",
        description: "Minimum value of the scale",
        required: false,
        default: 0,
        example: 30000
      },
      max: {
        type: "number",
        description: "Maximum value of the scale",
        required: false,
        default: 100,
        example: 200000
      },
      step: {
        type: "number",
        description: "Increment step for the value",
        required: false,
        default: 1,
        example: 5000
      },
      unit: {
        type: "string",
        description: "Suffix displayed after the value (e.g., '$', 'K', '%', 'people')",
        required: false,
        default: "",
        example: "K"
      },
      prefix: {
        type: "string",
        description: "Prefix displayed before the value (e.g., '$')",
        required: false,
        default: "",
        example: "$"
      }
    },
    useCases: [
      "Salary range selection",
      "Team size estimation",
      "Budget allocation",
      "Percentage selection"
    ],
    schemaMapping: [
      "financial_reality.base_compensation.amount_or_range",
      "humans_and_culture.team_composition.team_size",
      "humans_and_culture.team_composition.direct_reports"
    ]
  },

  stacked_bar: {
    name: "stacked_bar",
    description:
      "Multiple sliders that update a single stacked horizontal bar chart. Perfect for showing how different components sum to 100% (e.g., pay structure breakdown).",
    category: "visual_quantifiers",
    valueType: "array",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the stacked bar",
        required: false,
        example: "Pay Structure Breakdown"
      },
      segments: {
        type: "array",
        description: "Array of segment definitions for the stacked bar",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique identifier for segment" },
            label: { type: "string", description: "Display label for segment" },
            color: { type: "string", description: "CSS color for segment (hex or named)" },
            value: { type: "number", description: "Initial value (percentage)" }
          }
        },
        example: [
          { id: "base", label: "Base Salary", color: "#6366f1", value: 70 },
          { id: "bonus", label: "Bonus", color: "#8b5cf6", value: 20 },
          { id: "equity", label: "Equity", color: "#d946ef", value: 10 }
        ]
      },
      total: {
        type: "number",
        description: "Total value that segments should sum to",
        required: false,
        default: 100
      },
      autoBalance: {
        type: "boolean",
        description: "Automatically adjust other segments when one changes to maintain total",
        required: false,
        default: true
      }
    },
    useCases: [
      "Compensation breakdown (base/bonus/equity)",
      "Time allocation across tasks",
      "Budget distribution"
    ],
    schemaMapping: [
      "financial_reality.variable_compensation",
      "role_reality.day_to_day.task_breakdown"
    ]
  },

  equity_builder: {
    name: "equity_builder",
    description:
      "A two-step wizard for configuring equity compensation. Step 1: Select equity type. Step 2: Configure percentage, vesting, and cliff.",
    category: "visual_quantifiers",
    valueType: "object",
    props: {
      title: {
        type: "string",
        description: "Title displayed at the top",
        required: false,
        default: "Equity Package"
      },
      typeOptions: {
        type: "array",
        description: "Available equity type options",
        required: false,
        items: {
          type: "object",
          properties: {
            id: { type: "string", enum: ["options", "RSUs", "phantom", "profit_interest"] },
            label: { type: "string" },
            icon: { type: "string" },
            description: { type: "string" }
          }
        }
      },
      maxPercentage: {
        type: "number",
        description: "Maximum equity percentage allowed",
        required: false,
        default: 10
      }
    },
    useCases: [
      "Startup equity offers",
      "Executive compensation packages",
      "Partnership structures"
    ],
    schemaMapping: ["financial_reality.equity"]
  },

  gradient_slider: {
    name: "gradient_slider",
    description:
      "A slider with a gradient-colored track that reveals context-specific sub-options based on value ranges. Great for spectrum inputs like remote work flexibility.",
    category: "visual_quantifiers",
    valueType: "number",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the slider",
        required: false
      },
      leftLabel: {
        type: "string",
        description: "Label for left end of scale",
        required: false,
        example: "Fully Remote"
      },
      rightLabel: {
        type: "string",
        description: "Label for right end of scale",
        required: false,
        example: "Fully On-site"
      },
      ranges: {
        type: "array",
        description: "Value ranges with labels, colors, and optional sub-options",
        required: false,
        items: {
          type: "object",
          properties: {
            min: { type: "number" },
            max: { type: "number" },
            label: { type: "string" },
            color: { type: "string" },
            subOptions: { type: "array" }
          }
        }
      }
    },
    useCases: [
      "Work flexibility spectrum (remote to on-site)",
      "Intensity scales",
      "Risk tolerance levels"
    ],
    schemaMapping: [
      "time_and_life.flexibility.remote_frequency",
      "time_and_life.flexibility.remote_allowed"
    ]
  },

  bipolar_scale: {
    name: "bipolar_scale",
    description:
      "A list of sliders where each balances between two opposing text extremes. Perfect for culture fit or personality assessments.",
    category: "visual_quantifiers",
    valueType: "array",
    props: {
      title: {
        type: "string",
        description: "Title for the scale list",
        required: false
      },
      items: {
        type: "array",
        description: "Array of bipolar scales to display",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            leftLabel: { type: "string" },
            rightLabel: { type: "string" },
            value: { type: "number" }
          }
        },
        example: [
          { id: "pace", leftLabel: "Fast-paced", rightLabel: "Steady", value: 0 },
          { id: "structure", leftLabel: "Structured", rightLabel: "Flexible", value: 0 },
          { id: "collab", leftLabel: "Collaborative", rightLabel: "Independent", value: 0 }
        ]
      }
    },
    useCases: [
      "Culture fit assessment",
      "Work style preferences",
      "Management style spectrum"
    ],
    schemaMapping: [
      "humans_and_culture.management_style.management_approach",
      "humans_and_culture.communication_culture.async_vs_sync"
    ]
  },

  radar_chart: {
    name: "radar_chart",
    description:
      "An interactive SVG radar/spider chart where sliders control each axis, updating the polygon shape in real-time. Great for multi-dimensional assessments.",
    category: "visual_quantifiers",
    valueType: "array",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the chart",
        required: false
      },
      dimensions: {
        type: "array",
        description: "Array of dimensions/axes for the radar chart",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            value: { type: "number" },
            icon: { type: "string" }
          }
        },
        example: [
          { id: "learning", label: "Learning", value: 50, icon: "📚" },
          { id: "impact", label: "Impact", value: 50, icon: "🎯" },
          { id: "autonomy", label: "Autonomy", value: 50, icon: "🔓" },
          { id: "growth", label: "Growth", value: 50, icon: "📈" },
          { id: "balance", label: "Balance", value: 50, icon: "⚖️" }
        ]
      },
      max: {
        type: "number",
        description: "Maximum value for each dimension",
        required: false,
        default: 100
      }
    },
    useCases: [
      "Growth opportunity assessment",
      "Job satisfaction dimensions",
      "Skill level visualization"
    ],
    schemaMapping: ["growth_trajectory", "role_reality.autonomy"]
  },

  dial_group: {
    name: "dial_group",
    description:
      "A series of range inputs that calculate and display an average score with color-coded feedback. Good for grouped assessments.",
    category: "visual_quantifiers",
    valueType: "array",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the dials",
        required: false
      },
      dials: {
        type: "array",
        description: "Array of dial definitions",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            value: { type: "number" },
            icon: { type: "string" },
            description: { type: "string" }
          }
        }
      }
    },
    useCases: [
      "Autonomy level assessment",
      "Satisfaction scoring",
      "Skill proficiency rating"
    ],
    schemaMapping: ["role_reality.autonomy", "role_reality.workload"]
  },

  brand_meter: {
    name: "brand_meter",
    description:
      "Vertical bar charts controlled by sliders, with an overall star rating calculation. Ideal for brand/reputation value assessment.",
    category: "visual_quantifiers",
    valueType: "array",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the meter",
        required: false
      },
      metrics: {
        type: "array",
        description: "Array of metrics to rate",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            value: { type: "number" },
            icon: { type: "string" },
            weight: { type: "number" }
          }
        }
      },
      maxStars: {
        type: "number",
        description: "Maximum star rating",
        required: false,
        default: 5
      }
    },
    useCases: [
      "Employer brand assessment",
      "Career value rating",
      "Company reputation scoring"
    ],
    schemaMapping: ["unique_value.status_signals"]
  },

  // ===========================================================================
  // GRIDS, CARDS & SELECTORS
  // ===========================================================================

  icon_grid: {
    name: "icon_grid",
    description:
      "A grid of square cards with icons supporting single or multi-select. Perfect for benefits, amenities, or feature selection.",
    category: "grids_selectors",
    valueType: "string | array",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the grid",
        required: false
      },
      options: {
        type: "array",
        description: "Array of selectable options",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            icon: { type: "string" },
            description: { type: "string" }
          }
        },
        example: [
          { id: "health", label: "Health Insurance", icon: "🏥" },
          { id: "dental", label: "Dental", icon: "🦷" },
          { id: "vision", label: "Vision", icon: "👓" },
          { id: "401k", label: "401k Match", icon: "💰" },
          { id: "pto", label: "Unlimited PTO", icon: "🏖️" },
          { id: "remote", label: "Remote Work", icon: "🏠" }
        ]
      },
      multiple: {
        type: "boolean",
        description: "Allow multiple selections",
        required: false,
        default: false
      },
      columns: {
        type: "number",
        description: "Number of grid columns",
        required: false,
        default: 3,
        enum: [2, 3, 4, 5, 6]
      },
      maxSelections: {
        type: "number",
        description: "Maximum selections allowed (for multi-select)",
        required: false
      }
    },
    useCases: [
      "Benefits selection",
      "Amenities checklist",
      "Safety features",
      "Commute options"
    ],
    schemaMapping: [
      "stability_signals.benefits_security",
      "environment.amenities",
      "unique_value.hidden_perks"
    ]
  },

  detailed_cards: {
    name: "detailed_cards",
    description:
      "A list or grid of cards containing Icon + Title + Description. Ideal for detailed option selection like shift patterns or management styles.",
    category: "grids_selectors",
    valueType: "string | array",
    props: {
      title: {
        type: "string",
        description: "Section title",
        required: false
      },
      options: {
        type: "array",
        description: "Array of detailed card options",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            icon: { type: "string" },
            badge: { type: "string" }
          }
        }
      },
      multiple: {
        type: "boolean",
        description: "Allow multiple selections",
        required: false,
        default: false
      },
      layout: {
        type: "string",
        description: "Layout mode",
        required: false,
        default: "list",
        enum: ["list", "grid"]
      }
    },
    useCases: [
      "Shift pattern selection",
      "Management style preferences",
      "Role type selection"
    ],
    schemaMapping: [
      "time_and_life.schedule_pattern.type",
      "humans_and_culture.management_style.management_approach"
    ]
  },

  gradient_cards: {
    name: "gradient_cards",
    description:
      "Cards with distinct gradient backgrounds and icons. Creates a visually striking selection experience for mood or vibe-based choices.",
    category: "grids_selectors",
    valueType: "string | array",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the grid",
        required: false
      },
      options: {
        type: "array",
        description: "Array of gradient card options",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            icon: { type: "string" },
            gradient: { type: "string" },
            description: { type: "string" }
          }
        }
      },
      multiple: {
        type: "boolean",
        description: "Allow multiple selections",
        required: false,
        default: false
      },
      columns: {
        type: "number",
        description: "Number of grid columns",
        required: false,
        default: 2,
        enum: [2, 3, 4]
      }
    },
    useCases: [
      "Workspace mood selection",
      "Culture vibe preferences",
      "Environment type"
    ],
    schemaMapping: [
      "environment.physical_space.type",
      "environment.neighborhood.vibe"
    ]
  },

  superpower_grid: {
    name: "superpower_grid",
    description:
      "Grid of predefined traits with an additional custom text input area. Allows both selection and custom additions.",
    category: "grids_selectors",
    valueType: "object",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the grid",
        required: false
      },
      traits: {
        type: "array",
        description: "Array of predefined trait options",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            icon: { type: "string" }
          }
        }
      },
      maxSelections: {
        type: "number",
        description: "Maximum number of selections (predefined + custom)",
        required: false,
        default: 5
      },
      customPlaceholder: {
        type: "string",
        description: "Placeholder for custom input",
        required: false,
        default: "Add your own superpowers..."
      }
    },
    useCases: [
      "Team superpower identification",
      "Candidate strengths",
      "Role requirements"
    ],
    schemaMapping: [
      "growth_trajectory.skill_building.transferable_skills",
      "humans_and_culture.values_in_practice.stated_values"
    ]
  },

  node_map: {
    name: "node_map",
    description:
      "Central node with orbiting satellite nodes. Sliders control the count of nodes in each ring. Visualizes team structures or relationships.",
    category: "grids_selectors",
    valueType: "object",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the map",
        required: false
      },
      centerLabel: {
        type: "string",
        description: "Label for the central node",
        required: false,
        default: "You"
      },
      centerIcon: {
        type: "string",
        description: "Icon for the central node",
        required: false,
        default: "👤"
      },
      rings: {
        type: "array",
        description: "Array of ring/layer definitions",
        required: false,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            maxCount: { type: "number" },
            color: { type: "string" }
          }
        }
      }
    },
    useCases: [
      "Team structure visualization",
      "Reporting relationships",
      "Network size configuration"
    ],
    schemaMapping: [
      "humans_and_culture.team_composition.team_size",
      "humans_and_culture.team_composition.direct_reports",
      "humans_and_culture.team_composition.cross_functional_interaction"
    ]
  },

  // ===========================================================================
  // LISTS & TOGGLES
  // ===========================================================================

  toggle_list: {
    name: "toggle_list",
    description:
      "Simple vertical list of toggle buttons with checkmarks. Good for yes/no checklists like red flags or feature presence.",
    category: "lists_toggles",
    valueType: "array",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the list",
        required: false
      },
      items: {
        type: "array",
        description: "Array of toggleable items",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            icon: { type: "string" },
            description: { type: "string" }
          }
        }
      },
      singleSelect: {
        type: "boolean",
        description: "Only allow one selection at a time",
        required: false,
        default: false
      },
      variant: {
        type: "string",
        description: "Visual variant affecting colors",
        required: false,
        default: "default",
        enum: ["default", "danger", "success"]
      }
    },
    useCases: [
      "Red flag detection",
      "Worry/concern checklist",
      "Feature presence verification"
    ],
    schemaMapping: [
      "stability_signals.company_health.recent_layoffs",
      "environment.amenities"
    ]
  },

  chip_cloud: {
    name: "chip_cloud",
    description:
      "Grouped cloud of selectable text chips/tags. Ideal for tech stack, skills, or categorized tag selection.",
    category: "lists_toggles",
    valueType: "array",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the cloud",
        required: false
      },
      groups: {
        type: "array",
        description: "Array of chip groups with their items",
        required: true,
        items: {
          type: "object",
          properties: {
            groupId: { type: "string" },
            groupLabel: { type: "string" },
            items: { type: "array" }
          }
        }
      },
      maxSelections: {
        type: "number",
        description: "Maximum number of selections",
        required: false
      },
      showGroupLabels: {
        type: "boolean",
        description: "Show group header labels",
        required: false,
        default: true
      }
    },
    useCases: [
      "Tech stack selection",
      "Skills and competencies",
      "Tools and platforms"
    ],
    schemaMapping: [
      "growth_trajectory.skill_building.technologies_used",
      "growth_trajectory.skill_building.tools_used",
      "growth_trajectory.learning_opportunities.skill_development"
    ]
  },

  segmented_rows: {
    name: "segmented_rows",
    description:
      "List of rows where each row has a segmented control (e.g., [Never | Rare | Sometimes | Often]). Good for frequency or intensity ratings.",
    category: "lists_toggles",
    valueType: "object",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the list",
        required: false
      },
      rows: {
        type: "array",
        description: "Array of rows to display",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            icon: { type: "string" }
          }
        }
      },
      segments: {
        type: "array",
        description: "Segment options for each row",
        required: false,
        items: {
          type: "object",
          properties: {
            value: { type: "string" },
            label: { type: "string" },
            color: { type: "string" }
          }
        }
      }
    },
    useCases: [
      "Physical demands assessment",
      "Frequency ratings",
      "Task occurrence levels"
    ],
    schemaMapping: [
      "environment.safety_and_comfort.physical_demands",
      "time_and_life.overtime_reality.overtime_expected"
    ]
  },

  expandable_list: {
    name: "expandable_list",
    description:
      "List items that expand to reveal a text input when clicked. Allows selecting and providing evidence/details for each item.",
    category: "lists_toggles",
    valueType: "object",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the list",
        required: false
      },
      items: {
        type: "array",
        description: "Array of expandable items",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            icon: { type: "string" },
            placeholder: { type: "string" }
          }
        }
      },
      evidenceLabel: {
        type: "string",
        description: "Label for the evidence input",
        required: false,
        default: "Share an example or evidence..."
      }
    },
    useCases: [
      "Values assessment with evidence",
      "Criteria verification",
      "Feature confirmation with details"
    ],
    schemaMapping: [
      "humans_and_culture.values_in_practice.values_evidence",
      "humans_and_culture.conflict_and_feedback.psychological_safety"
    ]
  },

  perk_revealer: {
    name: "perk_revealer",
    description:
      "Category tabs at the top with toggleable perk items below. Good for categorized benefit selection.",
    category: "lists_toggles",
    valueType: "object",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the revealer",
        required: false
      },
      categories: {
        type: "array",
        description: "Array of perk categories with their items",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            icon: { type: "string" },
            items: { type: "array" }
          }
        }
      }
    },
    useCases: [
      "Hidden perks discovery",
      "Benefits by category",
      "Amenities selection"
    ],
    schemaMapping: [
      "unique_value.hidden_perks",
      "financial_reality.hidden_financial_value"
    ]
  },

  counter_stack: {
    name: "counter_stack",
    description:
      "List of items with +/- stepper buttons, updating a total. Perfect for PTO calculators or quantity inputs.",
    category: "lists_toggles",
    valueType: "object",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the stack",
        required: false
      },
      items: {
        type: "array",
        description: "Array of countable items",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            icon: { type: "string" },
            unit: { type: "string" },
            min: { type: "number" },
            max: { type: "number" },
            step: { type: "number" }
          }
        }
      },
      totalLabel: {
        type: "string",
        description: "Label for the total display",
        required: false,
        default: "Total"
      },
      totalUnit: {
        type: "string",
        description: "Unit for the total",
        required: false,
        default: "days"
      }
    },
    useCases: [
      "PTO calculator",
      "Resource allocation",
      "Quantity configuration"
    ],
    schemaMapping: [
      "time_and_life.time_off.pto_days",
      "time_and_life.time_off.sick_days"
    ]
  },

  // ===========================================================================
  // INTERACTIVE & GAMIFIED
  // ===========================================================================

  token_allocator: {
    name: "token_allocator",
    description:
      "Fixed pool of tokens (coins) distributed across categories using +/- buttons. Gamified priority/budget allocation.",
    category: "interactive_gamified",
    valueType: "object",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the allocator",
        required: false
      },
      totalTokens: {
        type: "number",
        description: "Total number of tokens available to allocate",
        required: false,
        default: 10
      },
      categories: {
        type: "array",
        description: "Array of categories to allocate tokens to",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            icon: { type: "string" },
            description: { type: "string" }
          }
        }
      },
      tokenIcon: {
        type: "string",
        description: "Emoji for tokens",
        required: false,
        default: "🪙"
      }
    },
    useCases: [
      "Priority budgeting",
      "Trade-off decisions",
      "Resource allocation"
    ],
    schemaMapping: ["extraction_metadata.clarifying_questions"]
  },

  swipe_deck: {
    name: "swipe_deck",
    description:
      "Stack of cards with swipe left/right animation and buttons. Tinder-style rapid sorting for yes/no decisions.",
    category: "interactive_gamified",
    valueType: "object",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the deck",
        required: false
      },
      cards: {
        type: "array",
        description: "Array of cards to swipe through",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            subtitle: { type: "string" },
            content: { type: "string" }
          }
        }
      },
      leftLabel: {
        type: "string",
        description: "Label for left swipe (reject)",
        required: false,
        default: "No"
      },
      rightLabel: {
        type: "string",
        description: "Label for right swipe (accept)",
        required: false,
        default: "Yes"
      }
    },
    useCases: [
      "Rapid-fire preferences",
      "Deal-breaker sorting",
      "Quick yes/no decisions"
    ],
    schemaMapping: [
      "unique_value.rare_offerings",
      "stability_signals.benefits_security"
    ]
  },

  reaction_scale: {
    name: "reaction_scale",
    description:
      "Large emoji buttons that trigger animation and selection. Quick emotional/sentiment response collection.",
    category: "interactive_gamified",
    valueType: "string",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the scale",
        required: false
      },
      prompt: {
        type: "string",
        description: "Question or statement to react to",
        required: false,
        example: "How do you feel about open office layouts?"
      },
      reactions: {
        type: "array",
        description: "Array of reaction options",
        required: false,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            emoji: { type: "string" },
            label: { type: "string" },
            color: { type: "string" }
          }
        }
      }
    },
    useCases: [
      "Sentiment capture",
      "Quick opinion poll",
      "Emotional response to scenarios"
    ],
    schemaMapping: [
      "environment.workspace_quality",
      "humans_and_culture.social_dynamics"
    ]
  },

  comparison_duel: {
    name: "comparison_duel",
    description:
      "Two large side-by-side cards for A vs B comparison. Forces a choice between two options.",
    category: "interactive_gamified",
    valueType: "string",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the duel",
        required: false
      },
      optionA: {
        type: "object",
        description: "Left option definition",
        required: true,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          icon: { type: "string" },
          color: { type: "string" }
        }
      },
      optionB: {
        type: "object",
        description: "Right option definition",
        required: true,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          icon: { type: "string" },
          color: { type: "string" }
        }
      },
      vsText: {
        type: "string",
        description: "Text shown between options",
        required: false,
        default: "VS"
      }
    },
    useCases: [
      "Trade-off decisions",
      "A/B preference capture",
      "Binary choice forcing"
    ],
    schemaMapping: [
      "stability_signals.company_health.company_stage",
      "humans_and_culture.management_style.management_approach"
    ]
  },

  heat_map: {
    name: "heat_map",
    description:
      "Grid of cells (rows × columns) that cycle through color states on click. Great for availability or intensity mapping.",
    category: "interactive_gamified",
    valueType: "object",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the heat map",
        required: false
      },
      rows: {
        type: "array",
        description: "Array of row labels",
        required: true,
        example: ["6AM", "9AM", "12PM", "3PM", "6PM", "9PM"]
      },
      columns: {
        type: "array",
        description: "Array of column labels",
        required: true,
        example: ["Mon", "Tue", "Wed", "Thu", "Fri"]
      },
      states: {
        type: "array",
        description: "Color states to cycle through",
        required: false,
        items: {
          type: "object",
          properties: {
            value: { type: "number" },
            label: { type: "string" },
            color: { type: "string" }
          }
        }
      }
    },
    useCases: [
      "Availability calendar",
      "Busy time mapping",
      "Intensity/frequency grid"
    ],
    schemaMapping: [
      "time_and_life.schedule_pattern",
      "time_and_life.overtime_reality"
    ]
  },

  week_scheduler: {
    name: "week_scheduler",
    description:
      "7-day grid with hour slots supporting drag-to-paint selection. Ideal for schedule or availability input.",
    category: "interactive_gamified",
    valueType: "object",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the scheduler",
        required: false
      },
      days: {
        type: "array",
        description: "Array of day labels",
        required: false,
        default: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      },
      startHour: {
        type: "number",
        description: "First hour to show (0-23)",
        required: false,
        default: 6
      },
      endHour: {
        type: "number",
        description: "Last hour to show (0-23)",
        required: false,
        default: 22
      },
      activeLabel: {
        type: "string",
        description: "Label for selected state",
        required: false,
        default: "Working"
      }
    },
    useCases: [
      "Work schedule input",
      "Availability mapping",
      "Preferred hours selection"
    ],
    schemaMapping: [
      "time_and_life.schedule_pattern.shift_types",
      "time_and_life.schedule_pattern.typical_hours_per_week"
    ]
  },

  // ===========================================================================
  // RICH INPUT & TEXT
  // ===========================================================================

  smart_textarea: {
    name: "smart_textarea",
    description:
      "Text area with rotating placeholder prompts and a 'Shuffle Prompt' feature. Great for open-ended questions with inspiration.",
    category: "text_media",
    valueType: "string",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the textarea",
        required: false
      },
      prompts: {
        type: "array",
        description: "Array of rotating prompt/placeholder strings",
        required: false,
        items: { type: "string" }
      },
      minLength: {
        type: "number",
        description: "Minimum character length",
        required: false
      },
      maxLength: {
        type: "number",
        description: "Maximum character length",
        required: false
      },
      rows: {
        type: "number",
        description: "Number of textarea rows",
        required: false,
        default: 4
      }
    },
    useCases: [
      "Secret sauce / unique value proposition",
      "Magic wand wish",
      "Open-ended feedback"
    ],
    schemaMapping: [
      "unique_value.rare_offerings.what_makes_this_special",
      "role_reality.pain_points_honesty.what_changed_would_help"
    ]
  },

  tag_input: {
    name: "tag_input",
    description:
      "Large centered text input with word counter and clickable suggestion tags. Good for focused short-form input.",
    category: "text_media",
    valueType: "string",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the input",
        required: false
      },
      suggestions: {
        type: "array",
        description: "Array of clickable suggestion tags",
        required: false,
        items: { type: "string" }
      },
      placeholder: {
        type: "string",
        description: "Input placeholder text",
        required: false,
        default: "Type your answer..."
      },
      maxWords: {
        type: "number",
        description: "Maximum word count",
        required: false
      },
      centered: {
        type: "boolean",
        description: "Center-align the text",
        required: false,
        default: true
      }
    },
    useCases: [
      "First impression capture",
      "Headline/summary input",
      "Keywords with suggestions"
    ],
    schemaMapping: [
      "extraction_metadata.industry_detected",
      "extraction_metadata.role_category_detected"
    ]
  },

  chat_simulator: {
    name: "chat_simulator",
    description:
      "Mini chat interface with quick reply buttons and auto-responses. Creates conversational data collection.",
    category: "text_media",
    valueType: "object",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the chat",
        required: false
      },
      flow: {
        type: "array",
        description: "Conversation flow definition",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            bot: { type: "string" },
            quickReplies: { type: "array" }
          }
        }
      },
      botName: {
        type: "string",
        description: "Display name for the bot",
        required: false,
        default: "Assistant"
      },
      botAvatar: {
        type: "string",
        description: "Emoji avatar for bot",
        required: false,
        default: "🤖"
      }
    },
    useCases: [
      "Quick conversational Q&A",
      "Guided interview flow",
      "Interactive FAQ"
    ],
    schemaMapping: [
      "humans_and_culture.conflict_and_feedback",
      "humans_and_culture.communication_culture"
    ]
  },

  timeline_builder: {
    name: "timeline_builder",
    description:
      "Vertical timeline with input boxes at each milestone point. Good for retrospectives or career history.",
    category: "text_media",
    valueType: "object",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the timeline",
        required: false
      },
      points: {
        type: "array",
        description: "Array of timeline point definitions",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            sublabel: { type: "string" }
          }
        }
      },
      placeholder: {
        type: "string",
        description: "Input placeholder text",
        required: false,
        default: "What happened here..."
      },
      reversed: {
        type: "boolean",
        description: "Reverse timeline direction",
        required: false,
        default: false
      }
    },
    useCases: [
      "Career retrospective",
      "Future goals mapping",
      "Project milestones"
    ],
    schemaMapping: [
      "growth_trajectory.career_path.promotion_path",
      "growth_trajectory.career_path.promotion_timeline_typical"
    ]
  },

  comparison_table: {
    name: "comparison_table",
    description:
      "Two-column input list for side-by-side comparisons like Expectation vs Reality.",
    category: "text_media",
    valueType: "object",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the table",
        required: false
      },
      leftHeader: {
        type: "string",
        description: "Header for left column",
        required: false,
        default: "Expectation"
      },
      rightHeader: {
        type: "string",
        description: "Header for right column",
        required: false,
        default: "Reality"
      },
      rows: {
        type: "array",
        description: "Array of row definitions",
        required: true,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" }
          }
        }
      },
      allowAddRows: {
        type: "boolean",
        description: "Allow users to add custom rows",
        required: false,
        default: false
      }
    },
    useCases: [
      "Expectation vs reality",
      "Before/after comparison",
      "Pros vs cons"
    ],
    schemaMapping: [
      "role_reality.pain_points_honesty",
      "humans_and_culture.turnover_context"
    ]
  },

  qa_list: {
    name: "qa_list",
    description:
      "List of expandable Question/Answer input pairs. Users can add and fill multiple Q&A items.",
    category: "text_media",
    valueType: "object",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the list",
        required: false
      },
      maxPairs: {
        type: "number",
        description: "Maximum number of Q&A pairs",
        required: false,
        default: 10
      },
      questionPlaceholder: {
        type: "string",
        description: "Placeholder for question input",
        required: false,
        default: "What would you like to know?"
      },
      answerPlaceholder: {
        type: "string",
        description: "Placeholder for answer input",
        required: false,
        default: "The answer..."
      },
      suggestedQuestions: {
        type: "array",
        description: "Array of suggested questions to add",
        required: false,
        items: { type: "string" }
      }
    },
    useCases: [
      "Candidate FAQ builder",
      "Interview questions",
      "Knowledge base building"
    ],
    schemaMapping: ["extraction_metadata.clarifying_questions"]
  },

  media_upload: {
    name: "media_upload",
    description:
      "Visual placeholder for media recording or upload. Supports audio, photo, video with mock functionality.",
    category: "text_media",
    valueType: "object",
    props: {
      title: {
        type: "string",
        description: "Title displayed above the uploader",
        required: false
      },
      mediaType: {
        type: "string",
        description: "Type of media to collect",
        required: false,
        default: "audio",
        enum: ["audio", "photo", "video", "file"]
      },
      prompt: {
        type: "string",
        description: "Instruction/prompt text",
        required: false
      },
      allowRecord: {
        type: "boolean",
        description: "Allow recording (for audio/video)",
        required: false,
        default: true
      },
      allowUpload: {
        type: "boolean",
        description: "Allow file upload",
        required: false,
        default: true
      }
    },
    useCases: [
      "Voice note recording",
      "Photo documentation",
      "Video testimonial"
    ],
    schemaMapping: []
  }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get all available UI tool names
 * @returns {string[]}
 */
export function getUIToolNames() {
  return Object.keys(UI_TOOLS_SCHEMA);
}

/**
 * Get UI tool schema by name
 * @param {string} toolName
 * @returns {object|null}
 */
export function getUIToolSchema(toolName) {
  return UI_TOOLS_SCHEMA[toolName] ?? null;
}

/**
 * Get tools by category
 * @param {string} category
 * @returns {object}
 */
export function getToolsByCategory(category) {
  return Object.fromEntries(
    Object.entries(UI_TOOLS_SCHEMA).filter(
      ([, tool]) => tool.category === category
    )
  );
}

/**
 * Get all categories
 * @returns {string[]}
 */
export function getToolCategories() {
  const categories = new Set(
    Object.values(UI_TOOLS_SCHEMA).map((tool) => tool.category)
  );
  return Array.from(categories);
}

/**
 * Get tools that map to a specific schema path
 * @param {string} schemaPath - dot-notation path in GoldenSchema
 * @returns {string[]} - array of tool names
 */
export function getToolsForSchemaPath(schemaPath) {
  return Object.entries(UI_TOOLS_SCHEMA)
    .filter(([, tool]) =>
      tool.schemaMapping?.some(
        (mapping) =>
          mapping === schemaPath || mapping.startsWith(schemaPath + ".")
      )
    )
    .map(([name]) => name);
}

/**
 * Generate a simplified tools summary for LLM consumption
 * @returns {object[]}
 */
export function getToolsSummaryForLLM() {
  return Object.entries(UI_TOOLS_SCHEMA).map(([name, tool]) => ({
    name,
    description: tool.description,
    category: tool.category,
    valueType: tool.valueType,
    useCases: tool.useCases,
    requiredProps: Object.entries(tool.props || {})
      .filter(([, prop]) => prop.required)
      .map(([propName]) => propName),
    schemaMapping: tool.schemaMapping || []
  }));
}

/**
 * Validate UI tool props against schema
 * @param {string} toolName
 * @param {object} props
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateUIToolProps(toolName, props) {
  const tool = UI_TOOLS_SCHEMA[toolName];
  if (!tool) {
    return { valid: false, errors: [`Unknown UI tool: ${toolName}`] };
  }

  const errors = [];
  const toolProps = tool.props || {};

  Object.entries(toolProps).forEach(([propName, propDef]) => {
    if (propDef.required && !(propName in props)) {
      errors.push(`Missing required prop: ${propName}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

// =============================================================================
// CATEGORY CONSTANTS
// =============================================================================

export const TOOL_CATEGORIES = {
  VISUAL_QUANTIFIERS: "visual_quantifiers",
  GRIDS_SELECTORS: "grids_selectors",
  LISTS_TOGGLES: "lists_toggles",
  INTERACTIVE_GAMIFIED: "interactive_gamified",
  TEXT_MEDIA: "text_media"
};

export const CATEGORY_LABELS = {
  visual_quantifiers: "Visual Quantifiers & Sliders",
  grids_selectors: "Grids, Cards & Selectors",
  lists_toggles: "Lists & Toggles",
  interactive_gamified: "Interactive & Gamified",
  text_media: "Rich Input & Text"
};
