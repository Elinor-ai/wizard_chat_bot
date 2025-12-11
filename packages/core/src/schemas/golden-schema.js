import { z } from "zod";
import { CompanySchema } from "./company.js";
import { v4 as uuidv4 } from "uuid";
// ============================================================================
// ENUMS
// ============================================================================

// Financial Reality Enums
export const PayFrequencyEnum = z.enum([
  "hourly",
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "annual",
]);

export const VariableCompensationTypeEnum = z.enum([
  "tips",
  "commission",
  "bonus",
  "profit_sharing",
  "equity",
  "none",
]);

export const VariableCompensationFrequencyEnum = z.enum([
  "per_shift",
  "weekly",
  "monthly",
  "quarterly",
  "annual",
]);

export const EquityTypeEnum = z.enum([
  "options",
  "RSUs",
  "phantom",
  "profit_interest",
  "none",
]);

export const PaymentMethodEnum = z.enum([
  "direct_deposit",
  "check",
  "cash",
  "mixed",
]);

// Time and Life Enums
export const ScheduleTypeEnum = z.enum([
  "fixed",
  "rotating",
  "flexible",
  "project_based",
  "on_call",
  "mixed",
]);

export const RemoteFrequencyEnum = z.enum([
  "full",
  "hybrid",
  "occasional",
  "rare",
  "never",
]);

export const PtoStructureEnum = z.enum([
  "unlimited",
  "accrued",
  "fixed",
  "none",
]);

export const OvertimeExpectedEnum = z.enum([
  "never",
  "rare",
  "occasional",
  "frequent",
  "constant",
]);

// Environment Enums
export const PhysicalSpaceTypeEnum = z.enum([
  "office",
  "retail",
  "restaurant",
  "warehouse",
  "hospital",
  "outdoor",
  "home",
  "hybrid",
  "other",
]);

export const NoiseLevelEnum = z.enum(["quiet", "moderate", "loud", "varies"]);

// Humans and Culture Enums
export const ManagementApproachEnum = z.enum([
  "hands_off",
  "collaborative",
  "structured",
  "mentorship_heavy",
]);

export const SocialPressureEnum = z.enum(["none", "low", "moderate", "high"]);

export const MeetingLoadEnum = z.enum(["minimal", "moderate", "heavy"]);

// Stability Signals Enums
export const CompanyStageEnum = z.enum([
  "startup",
  "growth",
  "mature",
  "turnaround",
  "declining",
]);

export const RevenueTrendEnum = z.enum([
  "growing",
  "stable",
  "declining",
  "unknown",
]);

export const PositionTypeEnum = z.enum([
  "permanent",
  "contract",
  "temp",
  "seasonal",
  "project",
]);

export const EmploymentTypeGoldenEnum = z.enum(["W2", "1099", "corp_to_corp"]);

// Role Reality Enums
export const VarietyLevelEnum = z.enum([
  "repetitive",
  "some_variety",
  "high_variety",
]);

export const DecisionAuthorityEnum = z.enum([
  "none",
  "low",
  "moderate",
  "high",
  "full",
]);

export const SupervisionLevelEnum = z.enum([
  "constant",
  "regular",
  "occasional",
  "minimal",
  "none",
]);

export const WorkloadIntensityEnum = z.enum([
  "relaxed",
  "moderate",
  "demanding",
  "intense",
]);

export const WorkloadPredictabilityEnum = z.enum([
  "steady",
  "variable",
  "seasonal",
  "chaotic",
]);

// Extraction Metadata Enums
export const SeniorityDetectedEnum = z.enum([
  "entry",
  "junior",
  "mid",
  "senior",
  "lead",
  "executive",
]);

// ============================================================================
// SUB-SCHEMAS: Financial Reality
// ============================================================================

export const BaseCompensationSchema = z.object({
  amount_or_range: z.string().optional(),
  pay_frequency: PayFrequencyEnum.optional(),
  currency: z.string().optional(),
});

export const VariableCompensationSchema = z.object({
  exists: z.boolean().optional(),
  type: VariableCompensationTypeEnum.optional(),
  structure: z.string().optional(),
  average_realized: z.string().optional(),
  frequency: VariableCompensationFrequencyEnum.optional(),
  guarantee_minimum: z.boolean().optional(),
  guarantee_details: z.string().optional(),
});

export const EquitySchema = z.object({
  offered: z.boolean().optional(),
  type: EquityTypeEnum.optional(),
  vesting_schedule: z.string().optional(),
  cliff: z.string().optional(),
});

export const BonusesSchema = z.object({
  signing_bonus: z.string().optional(),
  retention_bonus: z.string().optional(),
  performance_bonus: z.string().optional(),
  referral_bonus: z.string().optional(),
  holiday_bonus: z.string().optional(),
});

export const RaisesAndReviewsSchema = z.object({
  review_frequency: z.string().optional(),
  typical_raise_percentage: z.string().optional(),
  promotion_raise_typical: z.string().optional(),
});

export const HiddenFinancialValueSchema = z.object({
  meals_provided: z.boolean().optional(),
  meals_details: z.string().optional(),
  discounts: z.string().optional(),
  equipment_provided: z.string().optional(),
  wellness_budget: z.string().optional(),
  commuter_benefits: z.string().optional(),
  phone_stipend: z.string().optional(),
  internet_stipend: z.string().optional(),
});

export const PaymentReliabilitySchema = z.object({
  payment_method: PaymentMethodEnum.optional(),
  payment_timing: z.string().optional(),
  overtime_policy: z.string().optional(),
  overtime_rate: z.string().optional(),
});

export const FinancialRealitySchema = z.object({
  base_compensation: BaseCompensationSchema.optional(),
  variable_compensation: VariableCompensationSchema.optional(),
  equity: EquitySchema.optional(),
  bonuses: BonusesSchema.optional(),
  raises_and_reviews: RaisesAndReviewsSchema.optional(),
  hidden_financial_value: HiddenFinancialValueSchema.optional(),
  payment_reliability: PaymentReliabilitySchema.optional(),
});

// ============================================================================
// SUB-SCHEMAS: Time and Life
// ============================================================================

export const SchedulePatternSchema = z.object({
  type: ScheduleTypeEnum.optional(),
  typical_hours_per_week: z.number().optional(),
  days_per_week: z.number().optional(),
  shift_types: z.array(z.string()).optional(),
  shift_length_typical: z.string().optional(),
  weekend_frequency: z.string().optional(),
  holiday_policy: z.string().optional(),
});

export const SchedulePredictabilitySchema = z.object({
  advance_notice: z.string().optional(),
  shift_swapping_allowed: z.boolean().optional(),
  self_scheduling: z.boolean().optional(),
  schedule_stability: z.string().optional(),
});

export const FlexibilitySchema = z.object({
  remote_allowed: z.boolean().optional(),
  remote_frequency: RemoteFrequencyEnum.optional(),
  remote_details: z.string().optional(),
  async_friendly: z.boolean().optional(),
  core_hours: z.string().optional(),
  location_flexibility: z.string().optional(),
});

export const TimeOffSchema = z.object({
  pto_days: z.number().optional(),
  pto_structure: PtoStructureEnum.optional(),
  sick_days: z.number().optional(),
  sick_days_separate: z.boolean().optional(),
  parental_leave: z.string().optional(),
  bereavement_policy: z.string().optional(),
  mental_health_days: z.boolean().optional(),
  sabbatical_available: z.boolean().optional(),
  sabbatical_details: z.string().optional(),
});

export const CommuteRealitySchema = z.object({
  address: z.string().optional(),
  neighborhood_description: z.string().optional(),
  public_transit_proximity: z.string().optional(),
  parking_situation: z.string().optional(),
  bike_friendly: z.boolean().optional(),
  bike_storage: z.boolean().optional(),
});

export const BreakRealitySchema = z.object({
  paid_breaks: z.boolean().optional(),
  break_duration: z.string().optional(),
  break_flexibility: z.string().optional(),
});

export const OvertimeRealitySchema = z.object({
  overtime_expected: OvertimeExpectedEnum.optional(),
  overtime_voluntary: z.boolean().optional(),
  overtime_notice: z.string().optional(),
  crunch_periods: z.string().optional(),
});

export const TimeAndLifeSchema = z.object({
  schedule_pattern: SchedulePatternSchema.optional(),
  schedule_predictability: SchedulePredictabilitySchema.optional(),
  flexibility: FlexibilitySchema.optional(),
  time_off: TimeOffSchema.optional(),
  commute_reality: CommuteRealitySchema.optional(),
  break_reality: BreakRealitySchema.optional(),
  overtime_reality: OvertimeRealitySchema.optional(),
});

// ============================================================================
// SUB-SCHEMAS: Environment
// ============================================================================

export const PhysicalSpaceSchema = z.object({
  type: PhysicalSpaceTypeEnum.optional(),
  description: z.string().optional(),
  size_context: z.string().optional(),
});

export const WorkspaceQualitySchema = z.object({
  dedicated_workspace: z.boolean().optional(),
  workspace_description: z.string().optional(),
  equipment_quality: z.string().optional(),
  natural_light: z.boolean().optional(),
  noise_level: NoiseLevelEnum.optional(),
  temperature_control: z.string().optional(),
});

export const AmenitiesSchema = z.object({
  kitchen: z.boolean().optional(),
  kitchen_quality: z.string().optional(),
  bathroom_quality: z.string().optional(),
  lounge_area: z.boolean().optional(),
  outdoor_space: z.boolean().optional(),
  gym: z.boolean().optional(),
  showers: z.boolean().optional(),
  nap_room: z.boolean().optional(),
  mother_room: z.boolean().optional(),
});

export const SafetyAndComfortSchema = z.object({
  physical_demands: z.string().optional(),
  safety_measures: z.string().optional(),
  dress_code: z.string().optional(),
  uniform_provided: z.boolean().optional(),
  uniform_cost: z.string().optional(),
});

export const AccessibilitySchema = z.object({
  wheelchair_accessible: z.boolean().optional(),
  accessibility_details: z.string().optional(),
  accommodation_friendly: z.boolean().optional(),
});

export const NeighborhoodSchema = z.object({
  area_description: z.string().optional(),
  food_options_nearby: z.string().optional(),
  safety_perception: z.string().optional(),
  vibe: z.string().optional(),
});

export const EnvironmentSchema = z.object({
  physical_space: PhysicalSpaceSchema.optional(),
  workspace_quality: WorkspaceQualitySchema.optional(),
  amenities: AmenitiesSchema.optional(),
  safety_and_comfort: SafetyAndComfortSchema.optional(),
  accessibility: AccessibilitySchema.optional(),
  neighborhood: NeighborhoodSchema.optional(),
});

// ============================================================================
// SUB-SCHEMAS: Humans and Culture
// ============================================================================

export const TeamCompositionSchema = z.object({
  team_size: z.number().optional(),
  reporting_to: z.string().optional(),
  direct_reports: z.number().optional(),
  cross_functional_interaction: z.string().optional(),
});

export const TeamDemographicsSchema = z.object({
  experience_distribution: z.string().optional(),
  tenure_distribution: z.string().optional(),
  age_range_vibe: z.string().optional(),
  diversity_description: z.string().optional(),
});

export const ManagementStyleSchema = z.object({
  manager_description: z.string().optional(),
  management_approach: ManagementApproachEnum.optional(),
  feedback_frequency: z.string().optional(),
  one_on_ones: z.boolean().optional(),
  one_on_one_frequency: z.string().optional(),
});

export const SocialDynamicsSchema = z.object({
  team_bonding: z.string().optional(),
  social_pressure: SocialPressureEnum.optional(),
  after_work_culture: z.string().optional(),
  remote_social: z.string().optional(),
});

export const CommunicationCultureSchema = z.object({
  primary_channels: z.array(z.string()).optional(),
  meeting_load: MeetingLoadEnum.optional(),
  meeting_description: z.string().optional(),
  async_vs_sync: z.string().optional(),
  documentation_culture: z.string().optional(),
});

export const ConflictAndFeedbackSchema = z.object({
  feedback_culture: z.string().optional(),
  conflict_resolution: z.string().optional(),
  psychological_safety: z.string().optional(),
});

export const ValuesInPracticeSchema = z.object({
  stated_values: z.array(z.string()).optional(),
  values_evidence: z.string().optional(),
  decision_making_style: z.string().optional(),
});

export const TurnoverContextSchema = z.object({
  average_tenure: z.string().optional(),
  why_people_stay: z.string().optional(),
  why_people_leave: z.string().optional(),
  recent_departures_context: z.string().optional(),
});

export const HumansAndCultureSchema = z.object({
  team_composition: TeamCompositionSchema.optional(),
  team_demographics: TeamDemographicsSchema.optional(),
  management_style: ManagementStyleSchema.optional(),
  social_dynamics: SocialDynamicsSchema.optional(),
  communication_culture: CommunicationCultureSchema.optional(),
  conflict_and_feedback: ConflictAndFeedbackSchema.optional(),
  values_in_practice: ValuesInPracticeSchema.optional(),
  turnover_context: TurnoverContextSchema.optional(),
});

// ============================================================================
// SUB-SCHEMAS: Growth Trajectory
// ============================================================================

export const LearningOpportunitiesSchema = z.object({
  mentorship_available: z.boolean().optional(),
  mentorship_structure: z.string().optional(),
  learning_from_whom: z.string().optional(),
  skill_development: z.array(z.string()).optional(),
  exposure_to: z.array(z.string()).optional(),
});

export const FormalDevelopmentSchema = z.object({
  training_provided: z.boolean().optional(),
  training_description: z.string().optional(),
  certifications_supported: z.boolean().optional(),
  certifications_details: z.string().optional(),
  conferences: z.boolean().optional(),
  conference_budget: z.string().optional(),
  education_reimbursement: z.boolean().optional(),
  education_details: z.string().optional(),
});

export const CareerPathSchema = z.object({
  promotion_path: z.string().optional(),
  promotion_timeline_typical: z.string().optional(),
  promotion_criteria: z.string().optional(),
  internal_mobility: z.boolean().optional(),
});

export const GrowthSignalsSchema = z.object({
  company_growth_rate: z.string().optional(),
  new_roles_being_created: z.boolean().optional(),
  expansion_plans: z.string().optional(),
});

export const SkillBuildingSchema = z.object({
  technologies_used: z.array(z.string()).optional(),
  tools_used: z.array(z.string()).optional(),
  processes_learned: z.string().optional(),
  transferable_skills: z.array(z.string()).optional(),
});

export const LeadershipOpportunitiesSchema = z.object({
  lead_projects: z.boolean().optional(),
  manage_others: z.boolean().optional(),
  client_facing: z.boolean().optional(),
  decision_authority: z.string().optional(),
});

export const GrowthTrajectorySchema = z.object({
  learning_opportunities: LearningOpportunitiesSchema.optional(),
  formal_development: FormalDevelopmentSchema.optional(),
  career_path: CareerPathSchema.optional(),
  growth_signals: GrowthSignalsSchema.optional(),
  skill_building: SkillBuildingSchema.optional(),
  leadership_opportunities: LeadershipOpportunitiesSchema.optional(),
});

// ============================================================================
// SUB-SCHEMAS: Stability Signals
// ============================================================================

export const CompanyHealthSchema = z.object({
  company_age: z.string().optional(),
  company_stage: CompanyStageEnum.optional(),
  funding_status: z.string().optional(),
  revenue_trend: RevenueTrendEnum.optional(),
  recent_layoffs: z.boolean().optional(),
  layoff_context: z.string().optional(),
});

export const JobSecuritySchema = z.object({
  position_type: PositionTypeEnum.optional(),
  contract_length: z.string().optional(),
  conversion_possibility: z.boolean().optional(),
  probation_period: z.string().optional(),
});

export const BenefitsSecuritySchema = z.object({
  health_insurance: z.boolean().optional(),
  health_insurance_details: z.string().optional(),
  health_insurance_start: z.string().optional(),
  dental: z.boolean().optional(),
  vision: z.boolean().optional(),
  life_insurance: z.boolean().optional(),
  disability: z.boolean().optional(),
  retirement_plan: z.boolean().optional(),
  retirement_match: z.string().optional(),
  retirement_vesting: z.string().optional(),
});

export const LegalProtectionsSchema = z.object({
  employment_type: EmploymentTypeGoldenEnum.optional(),
  union: z.boolean().optional(),
  union_details: z.string().optional(),
  at_will: z.boolean().optional(),
  contract_terms: z.string().optional(),
});

export const StabilitySignalsSchema = z.object({
  company_health: CompanyHealthSchema.optional(),
  job_security: JobSecuritySchema.optional(),
  benefits_security: BenefitsSecuritySchema.optional(),
  legal_protections: LegalProtectionsSchema.optional(),
});

// ============================================================================
// SUB-SCHEMAS: Role Reality
// ============================================================================

export const DayToDaySchema = z.object({
  typical_day_description: z.string().optional(),
  variety_level: VarietyLevelEnum.optional(),
  task_breakdown: z.string().optional(),
});

export const AutonomySchema = z.object({
  decision_authority: DecisionAuthorityEnum.optional(),
  supervision_level: SupervisionLevelEnum.optional(),
  creativity_allowed: z.boolean().optional(),
  process_flexibility: z.string().optional(),
});

export const WorkloadSchema = z.object({
  intensity: WorkloadIntensityEnum.optional(),
  workload_predictability: WorkloadPredictabilityEnum.optional(),
  staffing_level: z.string().optional(),
  support_available: z.string().optional(),
});

export const ResourcesAndToolsSchema = z.object({
  tools_provided: z.array(z.string()).optional(),
  tools_quality: z.string().optional(),
  budget_authority: z.string().optional(),
  resource_constraints: z.string().optional(),
});

export const SuccessMetricsSchema = z.object({
  how_measured: z.string().optional(),
  performance_visibility: z.string().optional(),
  feedback_loop: z.string().optional(),
});

export const PainPointsHonestySchema = z.object({
  challenges: z.string().optional(),
  frustrations_common: z.string().optional(),
  what_changed_would_help: z.string().optional(),
});

export const ImpactVisibilitySchema = z.object({
  who_benefits: z.string().optional(),
  impact_tangibility: z.string().optional(),
  recognition_culture: z.string().optional(),
});

export const RoleRealitySchema = z.object({
  day_to_day: DayToDaySchema.optional(),
  autonomy: AutonomySchema.optional(),
  workload: WorkloadSchema.optional(),
  resources_and_tools: ResourcesAndToolsSchema.optional(),
  success_metrics: SuccessMetricsSchema.optional(),
  pain_points_honesty: PainPointsHonestySchema.optional(),
  impact_visibility: ImpactVisibilitySchema.optional(),
});

// ============================================================================
// SUB-SCHEMAS: Unique Value
// ============================================================================

export const HiddenPerksSchema = z.object({
  list: z.array(z.string()).optional(),
});

export const ConvenienceFactorsSchema = z.object({
  list: z.array(z.string()).optional(),
});

export const LifestyleEnablersSchema = z.object({
  list: z.array(z.string()).optional(),
});

export const StatusSignalsSchema = z.object({
  brand_value: z.string().optional(),
  network_access: z.string().optional(),
  credential_value: z.string().optional(),
});

export const PersonalMeaningSchema = z.object({
  mission_connection: z.string().optional(),
  impact_story: z.string().optional(),
  pride_factor: z.string().optional(),
});

export const RareOfferingsSchema = z.object({
  what_competitors_dont_have: z.string().optional(),
  what_makes_this_special: z.string().optional(),
});

export const UniqueValueSchema = z.object({
  hidden_perks: HiddenPerksSchema.optional(),
  convenience_factors: ConvenienceFactorsSchema.optional(),
  lifestyle_enablers: LifestyleEnablersSchema.optional(),
  status_signals: StatusSignalsSchema.optional(),
  personal_meaning: PersonalMeaningSchema.optional(),
  rare_offerings: RareOfferingsSchema.optional(),
});

// ============================================================================
// SUB-SCHEMAS: Extraction Metadata
// ============================================================================

export const ExtractionMetadataSchema = z.object({
  source_text: z.string().optional(),
  extraction_confidence: z.record(z.number().min(0).max(1)).optional(),
  fields_inferred: z.array(z.string()).optional(),
  fields_missing: z.array(z.string()).optional(),
  clarifying_questions: z.array(z.string()).optional(),
  industry_detected: z.string().optional(),
  role_category_detected: z.string().optional(),
  seniority_detected: SeniorityDetectedEnum.optional(),
});

// ============================================================================
// MAIN SCHEMA: Universal Golden Schema
// ============================================================================

export const UniversalGoldenSchema = z.object({
  id: z.string().uuid().describe("Unique identifier for this Golden Record"),
  sessionId: z.string().optional().describe("Link to the interview session ID"),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),

  company_context: CompanySchema.optional().describe(
    "Snapshot of the company data linked to this role"
  ),

  financial_reality: FinancialRealitySchema.optional(),
  time_and_life: TimeAndLifeSchema.optional(),
  environment: EnvironmentSchema.optional(),
  humans_and_culture: HumansAndCultureSchema.optional(),
  growth_trajectory: GrowthTrajectorySchema.optional(),
  stability_signals: StabilitySignalsSchema.optional(),
  role_reality: RoleRealitySchema.optional(),
  unique_value: UniqueValueSchema.optional(),
  extraction_metadata: ExtractionMetadataSchema.optional(),
});

// ============================================================================
// TYPE EXPORTS (for JSDoc usage)
// ============================================================================

/** @typedef {z.infer<typeof UniversalGoldenSchema>} UniversalGoldenData */
/** @typedef {z.infer<typeof FinancialRealitySchema>} FinancialRealityData */
/** @typedef {z.infer<typeof TimeAndLifeSchema>} TimeAndLifeData */
/** @typedef {z.infer<typeof EnvironmentSchema>} EnvironmentData */
/** @typedef {z.infer<typeof HumansAndCultureSchema>} HumansAndCultureData */
/** @typedef {z.infer<typeof GrowthTrajectorySchema>} GrowthTrajectoryData */
/** @typedef {z.infer<typeof StabilitySignalsSchema>} StabilitySignalsData */
/** @typedef {z.infer<typeof RoleRealitySchema>} RoleRealityData */
/** @typedef {z.infer<typeof UniqueValueSchema>} UniqueValueData */
/** @typedef {z.infer<typeof ExtractionMetadataSchema>} ExtractionMetadataData */

// ============================================================================
// FACTORY FUNCTION: Create Initial Golden Record
// ============================================================================

/**
 * Creates a new, hydrated Golden Record with all sub-schemas initialized.
 *
 * This factory function ensures:
 * 1. A unique UUID is generated for the record
 * 2. Company context is injected if provided
 * 3. User context is injected if provided (for personalization)
 * 4. All sub-schemas are initialized as empty objects to prevent undefined crashes
 *
 * @param {string} sessionId - The interview session ID
 * @param {object|null} companyData - Optional company data to hydrate company_context
 * @param {object|null} userData - Optional user data to hydrate user_context
 * @returns {UniversalGoldenData} A fully initialized Golden Record
 */
export function createInitialGoldenRecord(sessionId, companyData = null, userData = null) {
  const now = new Date().toISOString();

  return {
    id: uuidv4(),
    sessionId,
    createdAt: now,
    updatedAt: now,

    // Hydrate company context if provided
    company_context: companyData || {},

    // Hydrate user context if provided (for personalization)
    user_context: {
      name: userData?.name || null,
      timezone: userData?.timezone || null,
    },

    // Initialize all sub-schemas as empty objects to prevent undefined access
    financial_reality: {},
    time_and_life: {},
    environment: {},
    humans_and_culture: {},
    growth_trajectory: {},
    stability_signals: {},
    role_reality: {},
    unique_value: {},
    extraction_metadata: {},
  };
}
