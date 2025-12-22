"use client";

// =============================================================================
// COMPONENT IMPORTS
// =============================================================================

// Visual Quantifiers & Sliders
import CircularGauge from "./inputs/CircularGauge";
import LinearSlider from "./inputs/LinearSlider";
import StackedBarInput from "./inputs/StackedBarInput";
import EquityBuilder from "./inputs/EquityBuilder";
import GradientSlider from "./inputs/GradientSlider";
import BipolarScaleList from "./inputs/BipolarScaleList";
import RadarChartInput from "./inputs/RadarChartInput";
import DialGroup from "./inputs/DialGroup";
import BrandValueMeter from "./inputs/BrandValueMeter";

// Grids, Cards & Selectors
import IconGridSelect from "./inputs/IconGridSelect";
import DetailedCardSelect from "./inputs/DetailedCardSelect";
import GradientCardGrid from "./inputs/GradientCardGrid";
import SuperpowerGrid from "./inputs/SuperpowerGrid";
import VisualNodeMap from "./inputs/VisualNodeMap";

// Lists & Toggles
import ToggleList from "./inputs/ToggleList";
import ChipCloud from "./inputs/ChipCloud";
import SegmentedRowList from "./inputs/SegmentedRowList";
import ExpandableInputList from "./inputs/ExpandableInputList";
import PerkRevealer from "./inputs/PerkRevealer";
import CounterStack from "./inputs/CounterStack";

// Interactive & Gamified
import TokenAllocator from "./inputs/TokenAllocator";
import SwipeDeck from "./inputs/SwipeDeck";
import ReactionScale from "./inputs/ReactionScale";
import ComparisonDuel from "./inputs/ComparisonDuel";
import HeatMapGrid from "./inputs/HeatMapGrid";
import WeekScheduler from "./inputs/WeekScheduler";

// Rich Input & Text
import SmartTextArea from "./inputs/SmartTextArea";
import TagInputTextArea from "./inputs/TagInputTextArea";
import ChatSimulator from "./inputs/ChatSimulator";
import TimelineBuilder from "./inputs/TimelineBuilder";
import ComparisonTableInput from "./inputs/ComparisonTableInput";
import QAInputList from "./inputs/QAInputList";
import MediaUploadPlaceholder from "./inputs/MediaUploadPlaceholder";

// =============================================================================
// COMPONENT CATALOG
// =============================================================================

/**
 * COMPONENT_CATALOG
 *
 * Central registry mapping component type keys to:
 * - component: The React component to render
 * - schema: JSON Schema-like definition for AI Agent consumption
 *
 * Schema structure follows JSON Schema conventions:
 * - type: The data type (string, number, boolean, array, object)
 * - description: Human-readable description for AI understanding
 * - required: Whether the prop is mandatory
 * - items: For arrays, describes the shape of each item
 * - enum: For strings with fixed options
 * - default: Default value if not provided
 */
export const COMPONENT_CATALOG = {
  // ===========================================================================
  // VISUAL QUANTIFIERS & SLIDERS
  // ===========================================================================

  circular_gauge: {
    component: CircularGauge,
    schema: {
      name: "circular_gauge",
      description:
        "A circular SVG slider for selecting numerical values or ranges within a scale. Features a modern gradient arc with tick marks. Supports both single values and range objects ({min, max}). Ideal for salary, budget, team size, or any numeric input where a visual dial metaphor works well.",
      category: "visual_quantifiers",
      valueType: "number | object",
      props: {
        label: {
          type: "string",
          description:
            "Title displayed in the center of the gauge above the value",
          required: false,
          example: "Annual Salary",
        },
        min: {
          type: "number",
          description: "Minimum value of the scale",
          required: false,
          default: 0,
          example: 30000,
        },
        max: {
          type: "number",
          description: "Maximum value of the scale",
          required: false,
          default: 100,
          example: 200000,
        },
        step: {
          type: "number",
          description: "Increment step for the value",
          required: false,
          default: 1,
          example: 5000,
        },
        unit: {
          type: "string",
          description:
            "Suffix displayed after the value (e.g., '$', 'K', '%', 'people')",
          required: false,
          default: "",
          example: "K",
        },
        prefix: {
          type: "string",
          description: "Prefix displayed before the value (e.g., '$')",
          required: false,
          default: "",
          example: "$",
        },
        size: {
          type: "number",
          description: "SVG size in pixels",
          required: false,
          default: 300,
        },
      },
      useCases: [
        "Salary range selection",
        "Team size estimation",
        "Budget allocation",
        "Percentage selection",
      ],
    },
  },

  linear_slider: {
    component: LinearSlider,
    schema: {
      name: "linear_slider",
      description:
        "A horizontal linear slider bar for selecting a value or a range (min/max). Supports both single values and range objects with min/max properties.",
      category: "visual_quantifiers",
      valueType: "number | object",
      props: {
        label: {
          type: "string",
          description: "Label for the slider (passed by LLM for context)",
          required: false,
        },
        min: {
          type: "number",
          description: "Minimum value of the scale",
          required: false,
          default: 0,
          example: 0,
        },
        max: {
          type: "number",
          description: "Maximum value of the scale",
          required: false,
          default: 100,
          example: 100,
        },
        step: {
          type: "number",
          description: "Step increment for the value",
          required: false,
          default: 1,
          example: 1,
        },
        unit: {
          type: "string",
          description: "Unit suffix (e.g., '%', 'K')",
          required: false,
          default: "",
          example: "%",
        },
        prefix: {
          type: "string",
          description: "Prefix displayed before the value (e.g., '$')",
          required: false,
          default: "",
          example: "$",
        },
      },
      useCases: [
        "Budget or price range selection",
        "Percentage allocation",
        "Numeric range inputs",
        "Simple value selection",
      ],
    },
  },

  stacked_bar: {
    component: StackedBarInput,
    schema: {
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
          example: "Pay Structure Breakdown",
        },
        segments: {
          type: "array",
          description:
            "MUST be an array of segment OBJECTS (not strings). Each segment object MUST have id, label, value, and color properties. The color property is MANDATORY for rendering.",
          required: true,
          items: {
            type: "object",
            required: ["id", "label", "value", "color"],
            properties: {
              id: {
                type: "string",
                description: "Unique identifier for segment (required)",
              },
              label: {
                type: "string",
                description: "Display label for segment (required)",
              },
              color: {
                type: "string",
                description:
                  "MANDATORY hex color string for segment visual (e.g., '#6366f1')",
              },
              value: {
                type: "number",
                description: "Initial percentage value (required, 0-100)",
              },
            },
          },
          example: [
            { id: "base", label: "Base Salary", color: "#6366f1", value: 70 },
            { id: "bonus", label: "Bonus", color: "#8b5cf6", value: 20 },
            { id: "equity", label: "Equity", color: "#d946ef", value: 10 },
          ],
        },
        total: {
          type: "number",
          description: "Total value that segments should sum to",
          required: false,
          default: 100,
        },
        autoBalance: {
          type: "boolean",
          description:
            "Automatically adjust other segments when one changes to maintain total",
          required: false,
          default: true,
        },
      },
      useCases: [
        "Compensation breakdown (base/bonus/equity)",
        "Time allocation across tasks",
        "Budget distribution",
        "Skill proficiency levels",
      ],
    },
  },

  equity_builder: {
    component: EquityBuilder,
    schema: {
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
          default: "Equity Package",
        },
        typeOptions: {
          type: "array",
          description: "Available equity type options",
          required: false,
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier",
                enum: ["options", "RSUs", "phantom", "profit_interest"],
              },
              label: { type: "string", description: "Display label" },
              icon: {
                type: "string",
                description: "Lucide icon name (e.g., 'trending-up', 'gift')",
              },
            },
          },
          default: [
            {
              id: "options",
              label: "Stock Options",
              icon: "trending-up",
              description: "Right to buy shares at fixed price",
            },
            {
              id: "RSUs",
              label: "RSUs",
              icon: "gift",
              description: "Shares granted over time",
            },
            {
              id: "phantom",
              label: "Phantom Equity",
              icon: "ghost",
              description: "Cash equivalent to equity value",
            },
            {
              id: "profit_interest",
              label: "Profit Interest",
              icon: "coins",
              description: "Share of future profits",
            },
          ],
        },
        maxPercentage: {
          type: "number",
          description: "Maximum equity percentage allowed",
          required: false,
          default: 10,
        },
      },
      valueShape: {
        type: { type: "string", description: "Selected equity type" },
        percentage: { type: "number", description: "Equity percentage" },
        vestingYears: {
          type: "number",
          description: "Vesting period in years",
        },
        cliff: { type: "boolean", description: "Whether 1-year cliff applies" },
      },
      useCases: [
        "Startup equity offers",
        "Executive compensation packages",
        "Partnership structures",
      ],
    },
  },

  gradient_slider: {
    component: GradientSlider,
    schema: {
      name: "gradient_slider",
      description:
        "A slider with a gradient-colored track that reveals context-specific sub-options based on value ranges. Great for spectrum inputs like remote work flexibility.",
      category: "visual_quantifiers",
      valueType: "number",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the slider",
          required: false,
        },
        leftLabel: {
          type: "string",
          description: "Label for left end of scale",
          required: false,
          default: "Remote",
          example: "Never",
        },
        rightLabel: {
          type: "string",
          description: "Label for right end of scale",
          required: false,
          default: "On-site",
          example: "Always",
        },
        ranges: {
          type: "array",
          description:
            "Value ranges with labels, colors, and optional sub-options",
          required: false,
          items: {
            type: "object",
            properties: {
              min: { type: "number", description: "Range minimum value" },
              max: { type: "number", description: "Range maximum value" },
              label: { type: "string", description: "Label for this range" },
              color: { type: "string", description: "CSS color for range" },
              subOptions: {
                type: "array",
                description: "Sub-options revealed when in this range",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    label: { type: "string" },
                    type: { type: "string", enum: ["number", "select"] },
                    max: { type: "number" },
                  },
                },
              },
            },
          },
          example: [
            {
              min: 0,
              max: 20,
              label: "Fully Remote",
              color: "#22c55e",
              subOptions: [],
            },
            {
              min: 20,
              max: 40,
              label: "Mostly Remote",
              color: "#84cc16",
              subOptions: [
                {
                  id: "daysInOffice",
                  label: "Days in office/month",
                  type: "number",
                  max: 4,
                },
              ],
            },
            {
              min: 40,
              max: 60,
              label: "Hybrid",
              color: "#eab308",
              subOptions: [
                {
                  id: "daysInOffice",
                  label: "Days in office/week",
                  type: "number",
                  max: 3,
                },
              ],
            },
          ],
        },
        min: {
          type: "number",
          description: "Minimum value",
          required: false,
          default: 0,
        },
        max: {
          type: "number",
          description: "Maximum value",
          required: false,
          default: 100,
        },
      },
      useCases: [
        "Work flexibility spectrum (remote to on-site)",
        "Intensity scales",
        "Risk tolerance levels",
      ],
    },
  },

  bipolar_scale: {
    component: BipolarScaleList,
    schema: {
      name: "bipolar_scale",
      description:
        "A list of sliders where each balances between two opposing text extremes. Perfect for culture fit or personality assessments.",
      category: "visual_quantifiers",
      valueType: "array",
      props: {
        title: {
          type: "string",
          description: "Title for the scale list",
          required: false,
        },
        items: {
          type: "array",
          description: "Array of bipolar scales to display",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              leftLabel: { type: "string", description: "Left extreme label" },
              rightLabel: {
                type: "string",
                description: "Right extreme label",
              },
              value: {
                type: "number",
                description: "Initial value (-50 to 50)",
              },
            },
          },
          example: [
            {
              id: "pace",
              leftLabel: "Fast-paced",
              rightLabel: "Steady",
              value: 0,
            },
            {
              id: "structure",
              leftLabel: "Structured",
              rightLabel: "Flexible",
              value: 0,
            },
            {
              id: "collab",
              leftLabel: "Collaborative",
              rightLabel: "Independent",
              value: 0,
            },
          ],
        },
        min: {
          type: "number",
          description: "Minimum value (left extreme)",
          required: false,
          default: -50,
        },
        max: {
          type: "number",
          description: "Maximum value (right extreme)",
          required: false,
          default: 50,
        },
        leftColor: {
          type: "string",
          description: "Color for left-leaning values",
          required: false,
          default: "#3b82f6",
        },
        rightColor: {
          type: "string",
          description: "Color for right-leaning values",
          required: false,
          default: "#ef4444",
        },
      },
      useCases: [
        "Culture fit assessment",
        "Work style preferences",
        "Management style spectrum",
      ],
    },
  },

  radar_chart: {
    component: RadarChartInput,
    schema: {
      name: "radar_chart",
      description:
        "An interactive SVG radar/spider chart where sliders control each axis, updating the polygon shape in real-time. Great for multi-dimensional assessments.",
      category: "visual_quantifiers",
      valueType: "array",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the chart",
          required: false,
        },
        dimensions: {
          type: "array",
          description: "Array of dimensions/axes for the radar chart",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              label: { type: "string", description: "Axis label" },
              value: { type: "number", description: "Initial value (0-100)" },
              icon: { type: "string", description: "Optional emoji icon" },
            },
          },
          example: [
            { id: "learning", label: "Learning", value: 50, icon: "📚" },
            { id: "impact", label: "Impact", value: 50, icon: "🎯" },
            { id: "autonomy", label: "Autonomy", value: 50, icon: "🔓" },
            { id: "growth", label: "Growth", value: 50, icon: "📈" },
            { id: "balance", label: "Balance", value: 50, icon: "⚖️" },
          ],
        },
        max: {
          type: "number",
          description: "Maximum value for each dimension",
          required: false,
          default: 100,
        },
        size: {
          type: "number",
          description: "SVG size in pixels",
          required: false,
          default: 300,
        },
      },
      useCases: [
        "Growth opportunity assessment",
        "Job satisfaction dimensions",
        "Skill level visualization",
        "Role fit analysis",
      ],
    },
  },

  dial_group: {
    component: DialGroup,
    schema: {
      name: "dial_group",
      description:
        "A series of range inputs that calculate and display an average score with color-coded feedback. Good for grouped assessments.",
      category: "visual_quantifiers",
      valueType: "array",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the dials",
          required: false,
        },
        dials: {
          type: "array",
          description: "Array of dial definitions",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              label: { type: "string", description: "Dial label" },
              value: { type: "number", description: "Initial value" },
              icon: { type: "string", description: "Optional emoji icon" },
              description: {
                type: "string",
                description: "Optional helper text",
              },
            },
          },
          example: [
            { id: "decision", label: "Decision Making", value: 50, icon: "🎯" },
            {
              id: "schedule",
              label: "Schedule Control",
              value: 50,
              icon: "📅",
            },
            { id: "method", label: "Method Freedom", value: 50, icon: "🛠️" },
          ],
        },
        min: {
          type: "number",
          description: "Minimum value",
          required: false,
          default: 0,
        },
        max: {
          type: "number",
          description: "Maximum value",
          required: false,
          default: 100,
        },
        scoreRanges: {
          type: "array",
          description: "Score interpretation ranges",
          required: false,
          items: {
            type: "object",
            properties: {
              min: { type: "number" },
              max: { type: "number" },
              label: { type: "string" },
              color: { type: "string" },
            },
          },
        },
      },
      useCases: [
        "Autonomy level assessment",
        "Satisfaction scoring",
        "Skill proficiency rating",
      ],
    },
  },

  brand_meter: {
    component: BrandValueMeter,
    schema: {
      name: "brand_meter",
      description:
        "Vertical bar charts controlled by sliders, with an overall star rating calculation. Ideal for brand/reputation value assessment.",
      category: "visual_quantifiers",
      valueType: "array",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the meter",
          required: false,
        },
        metrics: {
          type: "array",
          description: "Array of metrics to rate",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              label: { type: "string", description: "Metric label" },
              value: { type: "number", description: "Initial value" },
              icon: {
                type: "string",
                description: "Lucide icon name (e.g., 'crown', 'users')",
              },
              weight: {
                type: "number",
                description: "Weight for average calculation",
              },
            },
          },
          example: [
            {
              id: "prestige",
              label: "Prestige",
              value: 50,
              icon: "crown",
              weight: 1,
            },
            {
              id: "network",
              label: "Network",
              value: 50,
              icon: "users",
              weight: 1,
            },
            {
              id: "resume",
              label: "Resume Value",
              value: 50,
              icon: "file-text",
              weight: 2,
            },
          ],
        },
        max: {
          type: "number",
          description: "Maximum value for each metric",
          required: false,
          default: 100,
        },
        maxStars: {
          type: "number",
          description: "Maximum star rating",
          required: false,
          default: 5,
        },
      },
      useCases: [
        "Employer brand assessment",
        "Career value rating",
        "Company reputation scoring",
      ],
    },
  },

  // ===========================================================================
  // GRIDS, CARDS & SELECTORS
  // ===========================================================================

  icon_grid: {
    component: IconGridSelect,
    schema: {
      name: "icon_grid",
      description:
        "A grid of square cards with icons supporting single or multi-select. Perfect for benefits, amenities, or feature selection.",
      category: "grids_selectors",
      valueType: "string | array",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the grid",
          required: false,
        },
        options: {
          type: "array",
          description: "Array of selectable options",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              label: { type: "string", description: "Display label" },
              icon: {
                type: "string",
                description:
                  "Lucide icon name in kebab-case (e.g., 'coffee', 'bus')",
              },
              description: {
                type: "string",
                description: "Optional tooltip text",
              },
            },
          },
          example: [
            { id: "health", label: "Health Insurance", icon: "heart-pulse" },
            { id: "dental", label: "Dental", icon: "smile" },
            { id: "vision", label: "Vision", icon: "eye" },
            { id: "401k", label: "401k Match", icon: "piggy-bank" },
            { id: "pto", label: "Unlimited PTO", icon: "palmtree" },
            { id: "remote", label: "Remote Work", icon: "home" },
          ],
        },
        multiple: {
          type: "boolean",
          description: "Allow multiple selections",
          required: false,
          default: false,
        },
        columns: {
          type: "number",
          description: "Number of grid columns",
          required: false,
          default: 3,
          enum: [2, 3, 4, 5, 6],
        },
        maxSelections: {
          type: "number",
          description: "Maximum selections allowed (for multi-select)",
          required: false,
        },
      },
      useCases: [
        "Benefits selection",
        "Amenities checklist",
        "Safety features",
        "Commute options",
      ],
    },
  },

  detailed_cards: {
    component: DetailedCardSelect,
    schema: {
      name: "detailed_cards",
      description:
        "A list or grid of cards containing Icon + Title + Description. Ideal for detailed option selection like shift patterns or management styles.",
      category: "grids_selectors",
      valueType: "string | array",
      props: {
        title: {
          type: "string",
          description: "Section title",
          required: false,
        },
        options: {
          type: "array",
          description: "Array of detailed card options",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              title: { type: "string", description: "Card title" },
              description: { type: "string", description: "Card description" },
              icon: {
                type: "string",
                description: "Lucide icon name (e.g., 'calendar', 'clock')",
              },
              badge: { type: "string", description: "Optional badge text" },
            },
          },
          example: [
            {
              id: "fixed",
              title: "Fixed Schedule",
              description: "Same hours every week",
              icon: "calendar",
              badge: "Popular",
            },
            {
              id: "rotating",
              title: "Rotating Shifts",
              description: "Schedule changes periodically",
              icon: "refresh-cw",
            },
            {
              id: "flexible",
              title: "Flexible Hours",
              description: "You choose your hours",
              icon: "clock",
            },
          ],
        },
        multiple: {
          type: "boolean",
          description: "Allow multiple selections",
          required: false,
          default: false,
        },
        layout: {
          type: "string",
          description: "Layout mode",
          required: false,
          default: "list",
          enum: ["list", "grid"],
        },
      },
      useCases: [
        "Shift pattern selection",
        "Management style preferences",
        "Role type selection",
      ],
    },
  },

  gradient_cards: {
    component: GradientCardGrid,
    schema: {
      name: "gradient_cards",
      description:
        "Cards with distinct gradient backgrounds and icons. Creates a visually striking selection experience for mood or vibe-based choices.",
      category: "grids_selectors",
      valueType: "string | array",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the grid",
          required: false,
        },
        options: {
          type: "array",
          description: "Array of gradient card options",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              label: { type: "string", description: "Card label" },
              icon: {
                type: "string",
                description: "Lucide icon name (e.g., 'zap', 'palette')",
              },
              gradient: {
                type: "string",
                description:
                  "Tailwind gradient class (e.g., 'from-violet-600 to-indigo-600')",
              },
              description: {
                type: "string",
                description: "Optional description",
              },
            },
          },
          example: [
            {
              id: "energetic",
              label: "Energetic",
              icon: "zap",
              gradient: "from-yellow-600 to-orange-600",
            },
            {
              id: "calm",
              label: "Calm",
              icon: "flower-2",
              gradient: "from-cyan-600 to-blue-600",
            },
            {
              id: "creative",
              label: "Creative",
              icon: "palette",
              gradient: "from-pink-600 to-purple-600",
            },
          ],
        },
        multiple: {
          type: "boolean",
          description: "Allow multiple selections",
          required: false,
          default: false,
        },
        columns: {
          type: "number",
          description: "Number of grid columns",
          required: false,
          default: 2,
          enum: [2, 3, 4],
        },
      },
      useCases: [
        "Workspace mood selection",
        "Culture vibe preferences",
        "Environment type",
      ],
    },
  },

  superpower_grid: {
    component: SuperpowerGrid,
    schema: {
      name: "superpower_grid",
      description:
        "Grid of predefined traits with an additional custom text input area. Allows both selection and custom additions.",
      category: "grids_selectors",
      valueType: "object",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the grid",
          required: false,
        },
        traits: {
          type: "array",
          description: "Array of predefined trait options",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              label: { type: "string", description: "Trait label" },
              icon: { type: "string", description: "Optional emoji icon" },
            },
          },
          example: [
            { id: "analytical", label: "Analytical", icon: "search" },
            { id: "creative", label: "Creative", icon: "palette" },
            { id: "leader", label: "Leadership", icon: "crown" },
            { id: "empathy", label: "Empathy", icon: "heart" },
          ],
        },
        maxSelections: {
          type: "number",
          description: "Maximum number of selections (predefined + custom)",
          required: false,
          default: 5,
        },
        customPlaceholder: {
          type: "string",
          description: "Placeholder for custom input",
          required: false,
          default: "Add your own superpowers...",
        },
      },
      valueShape: {
        selected: {
          type: "array",
          description: "Selected predefined trait IDs",
        },
        custom: {
          type: "string",
          description: "Comma-separated custom traits",
        },
      },
      useCases: [
        "Team superpower identification",
        "Candidate strengths",
        "Role requirements",
      ],
    },
  },

  node_map: {
    component: VisualNodeMap,
    schema: {
      name: "node_map",
      description:
        "Central node with orbiting satellite nodes. Sliders control the count of nodes in each ring. Visualizes team structures or relationships.",
      category: "grids_selectors",
      valueType: "object",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the map",
          required: false,
        },
        centerLabel: {
          type: "string",
          description: "Label for the central node",
          required: false,
          default: "You",
        },
        centerIcon: {
          type: "string",
          description: "Lucide icon name",
          required: false,
          default: "user",
        },
        rings: {
          type: "array",
          description: "Array of ring/layer definitions",
          required: false,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              label: { type: "string", description: "Ring label" },
              maxCount: {
                type: "number",
                description: "Maximum nodes in ring",
              },
              color: { type: "string", description: "Ring color" },
            },
          },
          default: [
            {
              id: "direct",
              label: "Direct Reports",
              maxCount: 10,
              color: "#8b5cf6",
            },
            {
              id: "team",
              label: "Team Members",
              maxCount: 15,
              color: "#6366f1",
            },
            {
              id: "cross",
              label: "Cross-functional",
              maxCount: 20,
              color: "#3b82f6",
            },
          ],
        },
        size: {
          type: "number",
          description: "SVG size in pixels",
          required: false,
          default: 300,
        },
      },
      useCases: [
        "Team structure visualization",
        "Reporting relationships",
        "Network size configuration",
      ],
    },
  },

  // ===========================================================================
  // LISTS & TOGGLES
  // ===========================================================================

  toggle_list: {
    component: ToggleList,
    schema: {
      name: "toggle_list",
      description:
        "Simple vertical list of toggle buttons with checkmarks. Good for yes/no checklists like red flags or feature presence.",
      category: "lists_toggles",
      valueType: "array",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the list",
          required: false,
        },
        items: {
          type: "array",
          description: "Array of toggleable items",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              label: { type: "string", description: "Item label" },
              icon: { type: "string", description: "Optional emoji icon" },
              description: {
                type: "string",
                description: "Optional helper text",
              },
            },
          },
          example: [
            {
              id: "unclear_role",
              label: "Unclear job responsibilities",
              icon: "help-circle",
            },
            {
              id: "high_turnover",
              label: "High turnover mentioned",
              icon: "door-open",
            },
            {
              id: "no_growth",
              label: "No clear growth path",
              icon: "trending-down",
            },
          ],
        },
        singleSelect: {
          type: "boolean",
          description: "Only allow one selection at a time",
          required: false,
          default: false,
        },
        variant: {
          type: "string",
          description: "Visual variant affecting colors",
          required: false,
          default: "default",
          enum: ["default", "danger", "success"],
        },
      },
      useCases: [
        "Red flag detection",
        "Worry/concern checklist",
        "Feature presence verification",
      ],
    },
  },

  chip_cloud: {
    component: ChipCloud,
    schema: {
      name: "chip_cloud",
      description:
        "Grouped cloud of selectable text chips/tags. Ideal for tech stack, skills, or categorized tag selection.",
      category: "lists_toggles",
      valueType: "array",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the cloud",
          required: false,
        },
        groups: {
          type: "array",
          description: "Array of chip groups with their items",
          required: true,
          items: {
            type: "object",
            properties: {
              groupId: { type: "string", description: "Group identifier" },
              groupLabel: { type: "string", description: "Group label/header" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    label: { type: "string" },
                  },
                },
              },
            },
          },
          example: [
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
              ],
            },
          ],
        },
        maxSelections: {
          type: "number",
          description: "Maximum number of selections",
          required: false,
        },
        showGroupLabels: {
          type: "boolean",
          description: "Show group header labels",
          required: false,
          default: true,
        },
      },
      useCases: [
        "Tech stack selection",
        "Skills and competencies",
        "Tools and platforms",
        "Mentorship sources",
      ],
    },
  },

  segmented_rows: {
    component: SegmentedRowList,
    schema: {
      name: "segmented_rows",
      description:
        "List of rows where each row has a segmented control (e.g., [Never | Rare | Sometimes | Often]). Good for frequency or intensity ratings.",
      category: "lists_toggles",
      valueType: "object",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the list",
          required: false,
        },
        rows: {
          type: "array",
          description: "Array of rows to display",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              label: { type: "string", description: "Row label" },
              icon: { type: "string", description: "Optional emoji icon" },
            },
          },
          example: [
            { id: "standing", label: "Standing", icon: "person-standing" },
            { id: "lifting", label: "Heavy Lifting", icon: "weight" },
            { id: "walking", label: "Walking/Moving", icon: "footprints" },
          ],
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
              color: { type: "string" },
            },
          },
          default: [
            { value: "never", label: "Never", color: "#22c55e" },
            { value: "rare", label: "Rare", color: "#84cc16" },
            { value: "sometimes", label: "Sometimes", color: "#eab308" },
            { value: "often", label: "Often", color: "#f97316" },
            { value: "always", label: "Always", color: "#ef4444" },
          ],
        },
      },
      useCases: [
        "Physical demands assessment",
        "Frequency ratings",
        "Task occurrence levels",
      ],
    },
  },

  expandable_list: {
    component: ExpandableInputList,
    schema: {
      name: "expandable_list",
      description:
        "List items that expand to reveal a text input when clicked. Allows selecting and providing evidence/details for each item.",
      category: "lists_toggles",
      valueType: "object",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the list",
          required: false,
        },
        items: {
          type: "array",
          description: "Array of expandable items",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              label: { type: "string", description: "Item label" },
              icon: { type: "string", description: "Optional emoji icon" },
              placeholder: {
                type: "string",
                description: "Input placeholder text",
              },
            },
          },
          example: [
            {
              id: "integrity",
              label: "Integrity",
              icon: "target",
              placeholder: "How is this demonstrated?",
            },
            {
              id: "innovation",
              label: "Innovation",
              icon: "lightbulb",
              placeholder: "Give an example...",
            },
            {
              id: "teamwork",
              label: "Teamwork",
              icon: "users",
              placeholder: "Describe the culture...",
            },
          ],
        },
        evidenceLabel: {
          type: "string",
          description: "Label for the evidence input",
          required: false,
          default: "Share an example or evidence...",
        },
      },
      valueShape: {
        "[itemId]": {
          selected: { type: "boolean" },
          evidence: { type: "string" },
        },
      },
      useCases: [
        "Values assessment with evidence",
        "Criteria verification",
        "Feature confirmation with details",
      ],
    },
  },

  perk_revealer: {
    component: PerkRevealer,
    schema: {
      name: "perk_revealer",
      description:
        "Category tabs at the top with toggleable perk items below. Good for categorized benefit selection.",
      category: "lists_toggles",
      valueType: "object",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the revealer",
          required: false,
        },
        categories: {
          type: "array",
          description: "Array of perk categories with their items",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Category identifier" },
              label: { type: "string", description: "Category tab label" },
              icon: { type: "string", description: "Lucide icon name" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    label: { type: "string" },
                    icon: { type: "string" },
                  },
                },
              },
            },
          },
          example: [
            {
              id: "food",
              label: "Food & Drinks",
              icon: "pizza",
              items: [
                { id: "free_lunch", label: "Free Lunch", icon: "utensils" },
                { id: "snacks", label: "Snacks", icon: "popcorn" },
                { id: "coffee", label: "Coffee/Tea", icon: "coffee" },
              ],
            },
            {
              id: "wellness",
              label: "Wellness",
              icon: "dumbbell",
              items: [
                { id: "gym", label: "Gym Access", icon: "biceps-flexed" },
                { id: "mental", label: "Mental Health", icon: "brain" },
              ],
            },
          ],
        },
      },
      useCases: [
        "Hidden perks discovery",
        "Benefits by category",
        "Amenities selection",
      ],
    },
  },

  counter_stack: {
    component: CounterStack,
    schema: {
      name: "counter_stack",
      description:
        "List of items with +/- stepper buttons, updating a total. Perfect for PTO calculators or quantity inputs.",
      category: "lists_toggles",
      valueType: "object",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the stack",
          required: false,
        },
        items: {
          type: "array",
          description: "Array of countable items",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              label: { type: "string", description: "Item label" },
              icon: { type: "string", description: "Lucide icon name" },
              unit: {
                type: "string",
                description: "Unit label (e.g., 'days')",
              },
              min: { type: "number", description: "Minimum value" },
              max: { type: "number", description: "Maximum value" },
              step: { type: "number", description: "Increment step" },
            },
          },
          example: [
            {
              id: "vacation",
              label: "Vacation Days",
              icon: "palmtree",
              unit: "days",
              min: 0,
              max: 30,
            },
            {
              id: "sick",
              label: "Sick Days",
              icon: "thermometer",
              unit: "days",
              min: 0,
              max: 15,
            },
            {
              id: "personal",
              label: "Personal Days",
              icon: "home",
              unit: "days",
              min: 0,
              max: 10,
            },
          ],
        },
        totalLabel: {
          type: "string",
          description: "Label for the total display",
          required: false,
          default: "Total",
        },
        totalUnit: {
          type: "string",
          description: "Unit for the total",
          required: false,
          default: "days",
        },
      },
      useCases: [
        "PTO calculator",
        "Resource allocation",
        "Quantity configuration",
      ],
    },
  },

  // ===========================================================================
  // INTERACTIVE & GAMIFIED
  // ===========================================================================

  token_allocator: {
    component: TokenAllocator,
    schema: {
      name: "token_allocator",
      description:
        "Fixed pool of tokens (coins) distributed across categories using +/- buttons. Gamified priority/budget allocation.",
      category: "interactive_gamified",
      valueType: "object",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the allocator",
          required: false,
        },
        totalTokens: {
          type: "number",
          description: "Total number of tokens available to allocate",
          required: false,
          default: 10,
        },
        categories: {
          type: "array",
          description: "Array of categories to allocate tokens to",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              label: { type: "string", description: "Category label" },
              icon: { type: "string", description: "Lucide icon name" },
              description: {
                type: "string",
                description: "Optional description",
              },
            },
          },
          example: [
            {
              id: "salary",
              label: "Salary",
              icon: "wallet",
              description: "Base compensation",
            },
            {
              id: "growth",
              label: "Growth",
              icon: "trending-up",
              description: "Career development",
            },
            {
              id: "balance",
              label: "Work-Life Balance",
              icon: "scale",
              description: "Flexibility",
            },
            {
              id: "culture",
              label: "Culture",
              icon: "drama",
              description: "Team environment",
            },
          ],
        },
        tokenIcon: {
          type: "string",
          description: "Lucide icon name for tokens",
          required: false,
          default: "coins",
        },
      },
      useCases: [
        "Priority budgeting",
        "Trade-off decisions",
        "Resource allocation",
      ],
    },
  },

  swipe_deck: {
    component: SwipeDeck,
    schema: {
      name: "swipe_deck",
      description:
        "Stack of cards with swipe left/right animation and buttons. Tinder-style rapid sorting for yes/no decisions.",
      category: "interactive_gamified",
      valueType: "object",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the deck",
          required: false,
        },
        cards: {
          type: "array",
          description: "Array of cards to swipe through",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              title: { type: "string", description: "Card title" },
              subtitle: { type: "string", description: "Optional subtitle" },
              content: {
                type: "string",
                description: "Card content (text or React node)",
              },
            },
          },
          example: [
            {
              id: "remote",
              title: "Remote Work",
              subtitle: "Flexibility",
              content: "Would you accept a fully remote position?",
            },
            {
              id: "travel",
              title: "Travel Required",
              subtitle: "25% time",
              content: "Are you open to regular travel?",
            },
          ],
        },
        leftLabel: {
          type: "string",
          description: "Label for left swipe (reject)",
          required: false,
          default: "No",
        },
        rightLabel: {
          type: "string",
          description: "Label for right swipe (accept)",
          required: false,
          default: "Yes",
        },
      },
      valueShape: {
        left: { type: "array", description: "IDs swiped left (rejected)" },
        right: { type: "array", description: "IDs swiped right (accepted)" },
      },
      useCases: [
        "Rapid-fire preferences",
        "Deal-breaker sorting",
        "Quick yes/no decisions",
      ],
    },
  },

  reaction_scale: {
    component: ReactionScale,
    schema: {
      name: "reaction_scale",
      description:
        "Large emoji buttons that trigger animation and selection. Quick emotional/sentiment response collection.",
      category: "interactive_gamified",
      valueType: "string",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the scale",
          required: false,
        },
        prompt: {
          type: "string",
          description: "Question or statement to react to",
          required: false,
          example: "How do you feel about open office layouts?",
        },
        reactions: {
          type: "array",
          description: "Array of reaction options",
          required: false,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              emoji: { type: "string", description: "Emoji to display" },
              label: { type: "string", description: "Reaction label" },
              color: { type: "string", description: "Accent color" },
            },
          },
          default: [
            { id: "love", emoji: "😍", label: "Love it!", color: "#ef4444" },
            { id: "like", emoji: "🙂", label: "Like it", color: "#f97316" },
            { id: "neutral", emoji: "😐", label: "Neutral", color: "#eab308" },
            {
              id: "dislike",
              emoji: "😕",
              label: "Not great",
              color: "#84cc16",
            },
            { id: "hate", emoji: "😤", label: "Hate it", color: "#22c55e" },
          ],
        },
      },
      useCases: [
        "Sentiment capture",
        "Quick opinion poll",
        "Emotional response to scenarios",
      ],
    },
  },

  comparison_duel: {
    component: ComparisonDuel,
    schema: {
      name: "comparison_duel",
      description:
        "Two large side-by-side cards for A vs B comparison. Forces a choice between two options.",
      category: "interactive_gamified",
      valueType: "string",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the duel",
          required: false,
        },
        optionA: {
          type: "object",
          description: "Left option definition",
          required: true,
          properties: {
            id: { type: "string", description: "Unique identifier" },
            title: { type: "string", description: "Option title" },
            description: { type: "string", description: "Option description" },
            icon: { type: "string", description: "Lucide icon name" },
            color: { type: "string", description: "Accent color" },
          },
          example: {
            id: "startup",
            title: "Startup",
            description: "High risk, high reward",
            icon: "rocket",
            color: "#6366f1",
          },
        },
        optionB: {
          type: "object",
          description: "Right option definition",
          required: true,
          properties: {
            id: { type: "string", description: "Unique identifier" },
            title: { type: "string", description: "Option title" },
            description: { type: "string", description: "Option description" },
            icon: { type: "string", description: "Lucide icon name" },
          },
          example: {
            id: "corporate",
            title: "Corporate",
            description: "Stable and structured",
            icon: "building",
            color: "#ec4899",
          },
        },
        vsText: {
          type: "string",
          description: "Text shown between options",
          required: false,
          default: "VS",
        },
      },
      useCases: [
        "Trade-off decisions",
        "A/B preference capture",
        "Binary choice forcing",
      ],
    },
  },

  heat_map: {
    component: HeatMapGrid,
    schema: {
      name: "heat_map",
      description:
        "Grid of cells (rows × columns) that cycle through color states on click. Great for availability or intensity mapping.",
      category: "interactive_gamified",
      valueType: "object",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the heat map",
          required: false,
        },
        rows: {
          type: "array",
          description: "Array of row labels",
          required: true,
          example: ["6AM", "9AM", "12PM", "3PM", "6PM", "9PM"],
        },
        columns: {
          type: "array",
          description: "Array of column labels",
          required: true,
          example: ["Mon", "Tue", "Wed", "Thu", "Fri"],
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
              color: { type: "string" },
            },
          },
          default: [
            { value: 0, label: "None", color: "rgba(255,255,255,0.05)" },
            { value: 1, label: "Low", color: "#22c55e" },
            { value: 2, label: "Medium", color: "#eab308" },
            { value: 3, label: "High", color: "#ef4444" },
          ],
        },
        rowLabel: {
          type: "string",
          description: "Label for rows axis",
          required: false,
        },
        columnLabel: {
          type: "string",
          description: "Label for columns axis",
          required: false,
        },
      },
      useCases: [
        "Availability calendar",
        "Busy time mapping",
        "Intensity/frequency grid",
      ],
    },
  },

  week_scheduler: {
    component: WeekScheduler,
    schema: {
      name: "week_scheduler",
      description:
        "7-day grid with hour slots supporting drag-to-paint selection. Ideal for schedule or availability input.",
      category: "interactive_gamified",
      valueType: "object",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the scheduler",
          required: false,
        },
        days: {
          type: "array",
          description: "Array of day labels",
          required: false,
          default: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        },
        startHour: {
          type: "number",
          description: "First hour to show (0-23)",
          required: false,
          default: 6,
        },
        endHour: {
          type: "number",
          description: "Last hour to show (0-23)",
          required: false,
          default: 22,
        },
        activeLabel: {
          type: "string",
          description: "Label for selected state",
          required: false,
          default: "Working",
        },
        inactiveLabel: {
          type: "string",
          description: "Label for unselected state",
          required: false,
          default: "Off",
        },
      },
      useCases: [
        "Work schedule input",
        "Availability mapping",
        "Preferred hours selection",
      ],
    },
  },

  // ===========================================================================
  // RICH INPUT & TEXT
  // ===========================================================================

  smart_textarea: {
    component: SmartTextArea,
    schema: {
      name: "smart_textarea",
      description:
        "Text area with rotating placeholder prompts and a 'Shuffle Prompt' feature. Great for open-ended questions with inspiration.",
      category: "text_media",
      valueType: "string",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the textarea",
          required: false,
        },
        prompts: {
          type: "array",
          description: "Array of rotating prompt/placeholder strings",
          required: false,
          items: { type: "string" },
          example: [
            "What makes this role special?",
            "Describe the perfect candidate...",
            "What would you tell a friend about this job?",
          ],
        },
        rotationInterval: {
          type: "number",
          description: "Milliseconds between prompt rotations",
          required: false,
          default: 5000,
        },
        minLength: {
          type: "number",
          description: "Minimum character length",
          required: false,
        },
        maxLength: {
          type: "number",
          description: "Maximum character length",
          required: false,
        },
        rows: {
          type: "number",
          description: "Number of textarea rows",
          required: false,
          default: 4,
        },
      },
      useCases: [
        "Secret sauce / unique value proposition",
        "Magic wand wish",
        "One thing to change",
        "Open-ended feedback",
      ],
    },
  },

  tag_input: {
    component: TagInputTextArea,
    schema: {
      name: "tag_input",
      description:
        "Large centered text input with word counter and clickable suggestion tags. Good for focused short-form input.",
      category: "text_media",
      valueType: "string",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the input",
          required: false,
        },
        suggestions: {
          type: "array",
          description: "Array of clickable suggestion tags",
          required: false,
          items: { type: "string" },
          example: [
            "innovative",
            "collaborative",
            "fast-paced",
            "supportive",
            "challenging",
          ],
        },
        placeholder: {
          type: "string",
          description: "Input placeholder text",
          required: false,
          default: "Type your answer...",
        },
        maxWords: {
          type: "number",
          description: "Maximum word count",
          required: false,
        },
        minWords: {
          type: "number",
          description: "Minimum word count",
          required: false,
        },
        centered: {
          type: "boolean",
          description: "Center-align the text",
          required: false,
          default: true,
        },
      },
      useCases: [
        "First impression capture",
        "Headline/summary input",
        "Keywords with suggestions",
      ],
    },
  },

  chat_simulator: {
    component: ChatSimulator,
    schema: {
      name: "chat_simulator",
      description:
        "Mini chat interface with quick reply buttons and auto-responses. Creates conversational data collection.",
      category: "text_media",
      valueType: "object",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the chat",
          required: false,
        },
        flow: {
          type: "array",
          description: "Conversation flow definition",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Step identifier" },
              bot: { type: "string", description: "Bot message text" },
              quickReplies: {
                type: "array",
                items: { type: "string" },
                description: "Quick reply options",
              },
            },
          },
          example: [
            {
              id: "q1",
              bot: "What's the most exciting part of this role?",
              quickReplies: [
                "The team",
                "The tech",
                "The mission",
                "The growth",
              ],
            },
            {
              id: "q2",
              bot: "What's your biggest concern?",
              quickReplies: [
                "Workload",
                "Culture fit",
                "Compensation",
                "Location",
              ],
            },
          ],
        },
        botName: {
          type: "string",
          description: "Display name for the bot",
          required: false,
          default: "Assistant",
        },
        botAvatar: {
          type: "string",
          description: "Lucide icon name for bot",
          required: false,
          default: "bot",
        },
        userAvatar: {
          type: "string",
          description: "Lucide icon name for user",
          required: false,
          default: "user",
        },
      },
      valueShape: {
        messages: { type: "array", description: "Chat message history" },
        currentStep: { type: "number", description: "Current step index" },
        responses: { type: "object", description: "User responses by step" },
      },
      useCases: [
        "Quick conversational Q&A",
        "Guided interview flow",
        "Interactive FAQ",
      ],
    },
  },

  timeline_builder: {
    component: TimelineBuilder,
    schema: {
      name: "timeline_builder",
      description:
        "Vertical timeline with input boxes at each milestone point. Good for retrospectives or career history.",
      category: "text_media",
      valueType: "object",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the timeline",
          required: false,
        },
        points: {
          type: "array",
          description: "Array of timeline point definitions",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              label: {
                type: "string",
                description: "Point label (e.g., '1 Year Ago')",
              },
              sublabel: {
                type: "string",
                description: "Optional secondary label",
              },
            },
          },
          example: [
            { id: "now", label: "Now", sublabel: "Present day" },
            { id: "6mo", label: "6 Months", sublabel: "Half year from now" },
            { id: "1yr", label: "1 Year", sublabel: "One year from now" },
            { id: "3yr", label: "3 Years", sublabel: "Three years from now" },
          ],
        },
        placeholder: {
          type: "string",
          description: "Input placeholder text",
          required: false,
          default: "What happened here...",
        },
        reversed: {
          type: "boolean",
          description: "Reverse timeline direction",
          required: false,
          default: false,
        },
      },
      useCases: [
        "Career retrospective",
        "Future goals mapping",
        "Project milestones",
      ],
    },
  },

  comparison_table: {
    component: ComparisonTableInput,
    schema: {
      name: "comparison_table",
      description:
        "Two-column input list for side-by-side comparisons like Expectation vs Reality.",
      category: "text_media",
      valueType: "object",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the table",
          required: false,
        },
        leftHeader: {
          type: "string",
          description: "Header for left column",
          required: false,
          default: "Expectation",
        },
        rightHeader: {
          type: "string",
          description: "Header for right column",
          required: false,
          default: "Reality",
        },
        rows: {
          type: "array",
          description: "Array of row definitions",
          required: true,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique identifier" },
              label: { type: "string", description: "Optional row label" },
            },
          },
          example: [
            { id: "role", label: "Role" },
            { id: "team", label: "Team" },
            { id: "growth", label: "Growth" },
          ],
        },
        leftPlaceholder: {
          type: "string",
          description: "Placeholder for left column inputs",
          required: false,
          default: "What you expected...",
        },
        rightPlaceholder: {
          type: "string",
          description: "Placeholder for right column inputs",
          required: false,
          default: "What actually happened...",
        },
        allowAddRows: {
          type: "boolean",
          description: "Allow users to add custom rows",
          required: false,
          default: false,
        },
      },
      useCases: [
        "Expectation vs reality",
        "Before/after comparison",
        "Pros vs cons",
      ],
    },
  },

  qa_list: {
    component: QAInputList,
    schema: {
      name: "qa_list",
      description:
        "List of expandable Question/Answer input pairs. Users can add and fill multiple Q&A items.",
      category: "text_media",
      valueType: "object",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the list",
          required: false,
        },
        maxPairs: {
          type: "number",
          description: "Maximum number of Q&A pairs",
          required: false,
          default: 10,
        },
        questionPlaceholder: {
          type: "string",
          description: "Placeholder for question input",
          required: false,
          default: "What would you like to know?",
        },
        answerPlaceholder: {
          type: "string",
          description: "Placeholder for answer input",
          required: false,
          default: "The answer...",
        },
        suggestedQuestions: {
          type: "array",
          description: "Array of suggested questions to add",
          required: false,
          items: { type: "string" },
          example: [
            "What's the team structure?",
            "How are decisions made?",
            "What does success look like?",
          ],
        },
      },
      valueShape: {
        pairs: {
          type: "array",
          items: {
            question: { type: "string" },
            answer: { type: "string" },
          },
        },
      },
      useCases: [
        "Candidate FAQ builder",
        "Interview questions",
        "Knowledge base building",
      ],
    },
  },

  media_upload: {
    component: MediaUploadPlaceholder,
    schema: {
      name: "media_upload",
      description:
        "Visual placeholder for media recording or upload. Supports audio, photo, video with mock functionality.",
      category: "text_media",
      valueType: "object",
      props: {
        title: {
          type: "string",
          description: "Title displayed above the uploader",
          required: false,
        },
        mediaType: {
          type: "string",
          description: "Type of media to collect",
          required: false,
          default: "audio",
          enum: ["audio", "photo", "video", "file"],
        },
        prompt: {
          type: "string",
          description: "Instruction/prompt text",
          required: false,
          example: "Record a voice note about the team culture",
        },
        allowRecord: {
          type: "boolean",
          description: "Allow recording (for audio/video)",
          required: false,
          default: true,
        },
        allowUpload: {
          type: "boolean",
          description: "Allow file upload",
          required: false,
          default: true,
        },
      },
      valueShape: {
        type: { type: "string", description: "Media type" },
        data: { type: "string", description: "Base64 data or URL" },
        filename: { type: "string", description: "File name" },
        duration: {
          type: "number",
          description: "Duration in seconds (for audio/video)",
        },
      },
      useCases: [
        "Voice note recording",
        "Photo documentation",
        "Video testimonial",
      ],
    },
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get a component by its catalog key
 * @param {string} type - The component type key (e.g., 'circular_gauge')
 * @returns {React.Component|null} The React component or null if not found
 */
export function getComponent(type) {
  return COMPONENT_CATALOG[type]?.component || null;
}

/**
 * Get the schema definition for a component
 * @param {string} type - The component type key
 * @returns {Object|null} The schema object or null if not found
 */
export function getComponentSchema(type) {
  return COMPONENT_CATALOG[type]?.schema || null;
}

/**
 * Check if a component exists in the catalog
 * @param {string} type - The component type key
 * @returns {boolean}
 */
export function hasComponent(type) {
  return type in COMPONENT_CATALOG;
}

/**
 * Get all component type keys
 * @returns {string[]}
 */
export function getComponentTypes() {
  return Object.keys(COMPONENT_CATALOG);
}

/**
 * Get components filtered by category
 * @param {string} category - Category name
 * @returns {Object} Filtered catalog entries
 */
export function getComponentsByCategory(category) {
  return Object.fromEntries(
    Object.entries(COMPONENT_CATALOG).filter(
      ([, entry]) => entry.schema.category === category
    )
  );
}

/**
 * Get all available categories
 * @returns {string[]}
 */
export function getCategories() {
  const categories = new Set(
    Object.values(COMPONENT_CATALOG).map((entry) => entry.schema.category)
  );
  return Array.from(categories);
}

/**
 * Get a summary of all components for AI Agent consumption
 * @returns {Object[]} Array of component summaries
 */
export function getCatalogSummary() {
  return Object.entries(COMPONENT_CATALOG).map(([type, entry]) => ({
    type,
    name: entry.schema.name,
    description: entry.schema.description,
    category: entry.schema.category,
    valueType: entry.schema.valueType,
    useCases: entry.schema.useCases || [],
  }));
}

/**
 * Get the full schema for AI Agent tool definition
 * Returns only the schema definitions without React components
 * @returns {Object}
 */
export function getAgentToolDefinitions() {
  return Object.fromEntries(
    Object.entries(COMPONENT_CATALOG).map(([type, entry]) => [
      type,
      entry.schema,
    ])
  );
}

/**
 * Validate props against a component's schema
 * @param {string} type - Component type
 * @param {Object} props - Props to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateComponentProps(type, props) {
  const schema = getComponentSchema(type);
  if (!schema) {
    return { valid: false, errors: [`Unknown component type: ${type}`] };
  }

  const errors = [];
  const schemaProps = schema.props || {};

  // Check required props
  Object.entries(schemaProps).forEach(([propName, propDef]) => {
    if (propDef.required && !(propName in props)) {
      errors.push(`Missing required prop: ${propName}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// CATEGORY CONSTANTS
// =============================================================================

export const COMPONENT_CATEGORIES = {
  VISUAL_QUANTIFIERS: "visual_quantifiers",
  GRIDS_SELECTORS: "grids_selectors",
  LISTS_TOGGLES: "lists_toggles",
  INTERACTIVE_GAMIFIED: "interactive_gamified",
  TEXT_MEDIA: "text_media",
};

export const CATEGORY_LABELS = {
  visual_quantifiers: "Visual Quantifiers & Sliders",
  grids_selectors: "Grids, Cards & Selectors",
  lists_toggles: "Lists & Toggles",
  interactive_gamified: "Interactive & Gamified",
  text_media: "Rich Input & Text",
};

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default COMPONENT_CATALOG;
