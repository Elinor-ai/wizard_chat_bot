import { z } from "zod";

export const JobCreationStateEnum = z.enum([
  "DRAFT",
  "REQUIRED_IN_PROGRESS",
  "REQUIRED_COMPLETE",
  "ENRICHING_REQUIRED",
  "OPTIONAL_IN_PROGRESS",
  "LLM_ENRICHING",
  "OPTIONAL_COMPLETE",
  "ENRICHING_OPTIONAL",
  "USER_REVIEW",
  "APPROVED",
  "DISTRIBUTION_RECOMMENDATION_LLM",
  "ASSET_SELECTION_READY"
]);

export const JOB_CREATION_STATES = JobCreationStateEnum.options;

export const JobStateToStatusMap = {
  DRAFT: "draft",
  REQUIRED_IN_PROGRESS: "intake_in_progress",
  REQUIRED_COMPLETE: "awaiting_confirmation",
  ENRICHING_REQUIRED: "awaiting_confirmation",
  OPTIONAL_IN_PROGRESS: "awaiting_confirmation",
  LLM_ENRICHING: "assets_generating",
  OPTIONAL_COMPLETE: "awaiting_confirmation",
  ENRICHING_OPTIONAL: "assets_generating",
  USER_REVIEW: "awaiting_confirmation",
  APPROVED: "approved",
  DISTRIBUTION_RECOMMENDATION_LLM: "campaigns_planned",
  ASSET_SELECTION_READY: "assets_generating"
};

export function deriveJobStatusFromState(state) {
  return JobStateToStatusMap[state] ?? "draft";
}

export class DeterministicStateMachine {
  constructor(name) {
    this.name = name;
    this.transitions = new Map();
  }

  registerTransition(from, to) {
    const current = this.transitions.get(from) ?? new Set();
    current.add(to);
    this.transitions.set(from, current);
  }

  canTransition(current, next) {
    const allowed = this.transitions.get(current);
    return allowed ? allowed.has(next) : false;
  }

  assertTransition(current, next) {
    if (!this.canTransition(current, next)) {
      throw new Error(`Invalid transition for ${this.name}: ${current} → ${next}`);
    }
  }
}

export function createJobCreationStateMachine() {
  const machine = new DeterministicStateMachine("job-creation");
  machine.registerTransition("DRAFT", "REQUIRED_IN_PROGRESS");
  machine.registerTransition("REQUIRED_IN_PROGRESS", "REQUIRED_COMPLETE");
  machine.registerTransition("REQUIRED_COMPLETE", "ENRICHING_REQUIRED");
  machine.registerTransition("ENRICHING_REQUIRED", "USER_REVIEW");
  machine.registerTransition("REQUIRED_COMPLETE", "OPTIONAL_IN_PROGRESS");
  machine.registerTransition("OPTIONAL_IN_PROGRESS", "LLM_ENRICHING");
  machine.registerTransition("LLM_ENRICHING", "OPTIONAL_COMPLETE");
  machine.registerTransition("OPTIONAL_COMPLETE", "ENRICHING_OPTIONAL");
  machine.registerTransition("ENRICHING_OPTIONAL", "USER_REVIEW");
  machine.registerTransition("USER_REVIEW", "APPROVED");
  machine.registerTransition("APPROVED", "DISTRIBUTION_RECOMMENDATION_LLM");
  machine.registerTransition("DISTRIBUTION_RECOMMENDATION_LLM", "ASSET_SELECTION_READY");
  machine.registerTransition("ASSET_SELECTION_READY", "ASSET_SELECTION_READY");
  return machine;
}
