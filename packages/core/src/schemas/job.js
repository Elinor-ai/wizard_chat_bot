import { z } from "zod";
import { TimestampSchema } from "../common/zod.js";

export const JobStatusEnum = z.enum(["draft", "intake_in_progress", "awaiting_confirmation", "approved", "archived"]);

export const JobCreationStateEnum = z.enum([
  "DRAFT",
  "REQUIRED_IN_PROGRESS",
  "REQUIRED_COMPLETE",
  "OPTIONAL_IN_PROGRESS",
  "OPTIONAL_COMPLETE",
  "USER_REVIEW",
  "APPROVED"
]);

export const JOB_CREATION_STATES = JobCreationStateEnum.options;

export const JobStateToStatusMap = {
  DRAFT: "draft",
  REQUIRED_IN_PROGRESS: "intake_in_progress",
  REQUIRED_COMPLETE: "awaiting_confirmation",
  OPTIONAL_IN_PROGRESS: "awaiting_confirmation",
  OPTIONAL_COMPLETE: "awaiting_confirmation",
  USER_REVIEW: "awaiting_confirmation",
  APPROVED: "approved"
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
  machine.registerTransition("REQUIRED_COMPLETE", "OPTIONAL_IN_PROGRESS");
  machine.registerTransition("OPTIONAL_IN_PROGRESS", "OPTIONAL_COMPLETE");
  machine.registerTransition("OPTIONAL_COMPLETE", "USER_REVIEW");
  machine.registerTransition("USER_REVIEW", "APPROVED");
  return machine;
}

export const WorkModelEnum = z.enum(["on_site", "hybrid", "remote"]);

export const EmploymentTypeEnum = z.enum(["full_time", "part_time", "contract", "temporary", "seasonal", "intern"]);

export const ExperienceLevelEnum = z.enum(["entry", "mid", "senior", "lead", "executive"]);

export const ConfirmedJobDetailsSchema = z
  .object({
    roleTitle: z.string().optional(),
    companyName: z.string().optional(),
    location: z.string().optional(),
    zipCode: z.string().optional(),
    industry: z.string().optional(),
    seniorityLevel: ExperienceLevelEnum.optional(),
    employmentType: EmploymentTypeEnum.optional(),
    workModel: WorkModelEnum.optional(),
    jobDescription: z.string().optional(),
    coreDuties: z.array(z.string()).optional(),
    mustHaves: z.array(z.string()).optional(),
    benefits: z.array(z.string()).optional(),
    salary: z.string().optional(),
    salaryPeriod: z.string().optional(),
    currency: z.string().optional()
  })
  .default({});

const StateMachineSchema = z.object({
  currentState: JobCreationStateEnum,
  previousState: JobCreationStateEnum.nullable().optional(),
  history: z
    .array(
      z.object({
        from: JobCreationStateEnum,
        to: JobCreationStateEnum,
        at: TimestampSchema,
        reason: z.string().optional()
      })
    )
    .default([]),
  requiredComplete: z.boolean().default(false),
  optionalComplete: z.boolean().default(false),
  lastTransitionAt: TimestampSchema.nullable().optional(),
  lockedByRequestId: z.string().nullable().optional()
});

export const JobSchema = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  orgId: z.string().nullable().optional(),
  status: JobStatusEnum.default("draft"),
  stateMachine: StateMachineSchema,
  roleTitle: z.string().default(""),
  companyName: z.string().default(""),
  location: z.string().default(""),
  zipCode: z.string().optional(),
  industry: z.string().optional(),
  seniorityLevel: ExperienceLevelEnum.optional(),
  employmentType: EmploymentTypeEnum.optional(),
  workModel: WorkModelEnum.optional(),
  jobDescription: z.string().default(""),
  coreDuties: z.array(z.string()).default([]),
  mustHaves: z.array(z.string()).default([]),
  benefits: z.array(z.string()).default([]),
  salary: z.string().optional(),
  salaryPeriod: z.string().optional(),
  currency: z.string().optional(),
  confirmed: ConfirmedJobDetailsSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  archivedAt: TimestampSchema.nullable().optional()
});
