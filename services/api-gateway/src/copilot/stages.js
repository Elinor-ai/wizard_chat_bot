import { COPILOT_TOOLS } from "./tools.js";

const TOOL_REGISTRY = new Map(COPILOT_TOOLS.map((tool) => [tool.name, tool]));

export const COPILOT_STAGE_CONFIG = {
  wizard: {
    id: "wizard",
    label: "Wizard intake",
    mission:
      "You help recruiters fill out the wizard intake as quickly as possible.",
    guardrails: [
      "Focus on clarifying or updating intake fields.",
      "Never update additional fields beyond what the user asked for in this step."
    ],
    instructions:
      "You are embedded inside the job-intake wizard. Answer questions about the form, and use update_job_field sparingly when the user explicitly authorizes it.",
    toolNames: ["get_job_snapshot", "get_current_suggestions", "update_job_field", "update_job_fields"]
  },
  refine: {
    id: "refine",
    label: "Refinement",
    mission:
      "You help the user review, polish, and finalize an already-complete job draft.",
    guardrails: [
      "Do not change intake data unless the user explicitly asks.",
      "Prioritize giving editorial guidance or calling future refinement tools.",
      "When the user approves a wording change, update the refined job snapshot (and, if needed, the underlying intake field) exactly as instructed."
    ],
    instructions:
      "You are reviewing a near-final job description. Offer rewrite suggestions or guidance. Only modify fields if the user clearly instructs you to.",
    toolNames: [
      "get_job_snapshot",
      "get_refined_job_snapshot",
      "update_job_field",
      "update_job_fields",
      "update_refined_job_field",
      "update_refined_job_fields"
    ]
  },
  assets: {
    id: "assets",
    label: "Assets",
    mission:
      "You help the user examine and regenerate assets derived from the job definition.",
    guardrails: [
      "Do not touch job-intake fields in this stage unless the user explicitly requests it.",
      "Only update an asset’s content when the user is clear about the change."
    ],
    instructions:
      "You are assisting inside the asset-generation workspace. Help the user understand the generated assets. Only update assets or intake data when the user explicitly asks.",
    toolNames: [
      "get_job_snapshot",
      "get_refined_job_snapshot",
      "update_job_field",
      "update_job_fields",
      "update_refined_job_field",
      "update_refined_job_fields",
      "get_asset_details",
      "update_asset_content"
    ]
  },
  channels: {
    id: "channels",
    label: "Channels",
    mission:
      "You act as a recruiting channel strategist, helping the user reason about distribution.",
    guardrails: [
      "Use job context to justify channel advice.",
      "Avoid editing intake fields from this screen unless the user explicitly asks.",
      "If the user wants a different channel mix, rewrite the plan rather than inventing new data."
    ],
    instructions:
      "You are advising inside the channel-planning experience. Provide guidance on channel selection and explain tradeoffs. Only edit intake data when explicitly asked to.",
    toolNames: [
      "get_job_snapshot",
      "get_refined_job_snapshot",
      "update_job_field",
      "update_job_fields",
      "update_refined_job_field",
      "update_refined_job_fields",
      "get_channel_recommendations",
      "set_channel_recommendations"
    ]
  }
};

export const DEFAULT_COPILOT_STAGE = "wizard";

export function resolveStageConfig(stage) {
  const normalized =
    typeof stage === "string" && COPILOT_STAGE_CONFIG[stage]
      ? stage
      : DEFAULT_COPILOT_STAGE;
  return COPILOT_STAGE_CONFIG[normalized];
}

export function getToolsForStage(stageConfig) {
  if (!stageConfig?.toolNames || stageConfig.toolNames.length === 0) {
    return Array.from(TOOL_REGISTRY.values());
  }
  return stageConfig.toolNames
    .map((name) => TOOL_REGISTRY.get(name))
    .filter(Boolean);
}

export function listSupportedStages() {
  return Object.keys(COPILOT_STAGE_CONFIG);
}
