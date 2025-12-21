import { z } from "zod";
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

// Employment Type Enum (for role_overview)
export const EmploymentTypeEnum = z.enum([
  "full_time",
  "part_time",
  "contract",
  "freelance",
  "internship",
  "temporary",
  "seasonal",
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
  role_archetype: z.string().optional(),
});

// ============================================================================
// SUB-SCHEMAS: Role Overview (Basic Job Info)
// ============================================================================

export const RoleOverviewSchema = z.object({
  job_title: z.string().optional(),
  company_name: z.string().optional(),
  department: z.string().optional(),
  employment_type: EmploymentTypeEnum.optional(),
  location_city: z.string().optional(),
  location_state: z.string().optional(),
  location_country: z.string().optional(),
  location_type: z.enum(["on_site", "remote", "hybrid"]).optional(),
  reports_to: z.string().optional(),
  headcount: z.number().optional(),
  is_new_role: z.boolean().optional(),
  role_summary: z.string().optional(),
});

// ============================================================================
// SUB-SCHEMAS: User Context (Interview Personalization)
// ============================================================================

export const UserContextSchema = z.object({
  name: z.string().optional(),
  timezone: z.string().optional(),
  preferred_language: z.string().optional(),
});

// ============================================================================
// MAIN SCHEMA: Universal Golden Schema
// ============================================================================

export const UniversalGoldenSchema = z.object({
  id: z.string().uuid().describe("Unique identifier for this Golden Record"),
  sessionId: z.string().optional().describe("Link to the interview session ID"),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),

  // Context sections
  companyId: z.string().optional().describe(
    "Reference to the company ID (company data fetched separately when needed)"
  ),
  user_context: UserContextSchema.optional().describe(
    "User information for interview personalization"
  ),

  // Core role information (THE BASICS)
  role_overview: RoleOverviewSchema.optional().describe(
    "Basic job information: title, location, employment type"
  ),

  // Detailed sections
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
// MANDATORY FIELDS: Required for Publishing ANY Job
// ============================================================================

/**
 * Fields that MUST be filled before a job can be published.
 * These are the absolute minimum required for ANY job type.
 *
 * Note: These are defined separately from Zod schema because:
 * 1. Schema fields remain optional() for progressive filling during interview
 * 2. Validation happens at publish time, not during interview
 */
export const MANDATORY_FIELDS = [
  "role_overview.job_title",
  "role_overview.company_name",
  "role_overview.employment_type",
  "role_overview.location_type",
];

/**
 * Helper function to get a nested value from an object using dot notation.
 * @param {object} obj - The object to traverse
 * @param {string} path - Dot-notation path (e.g., "role_overview.job_title")
 * @returns {*} The value at the path, or undefined if not found
 */
export function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;

  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Validates that all mandatory fields are filled in a golden schema.
 * Use this before publishing a job to ensure minimum required data is present.
 *
 * @param {object} schema - The golden schema object to validate
 * @returns {{isValid: boolean, missing: string[], filled: number, total: number}}
 */
export function validateMandatoryFields(schema) {
  const missing = [];

  for (const fieldPath of MANDATORY_FIELDS) {
    const value = getNestedValue(schema, fieldPath);
    if (value === null || value === undefined || value === "") {
      missing.push(fieldPath);
    }
  }

  return {
    isValid: missing.length === 0,
    missing,
    filled: MANDATORY_FIELDS.length - missing.length,
    total: MANDATORY_FIELDS.length,
  };
}

// ============================================================================
// FACTORY FUNCTION: Create Initial Golden Record
// ============================================================================

/**
 * Creates a new, hydrated Golden Record with all sub-schemas initialized.
 *
 * This factory function ensures:
 * 1. A unique UUID is generated for the record
 * 2. Company ID is stored (company data fetched separately when needed for prompts)
 * 3. User context is injected if provided (for personalization)
 * 4. ALL fields are initialized with null values (not empty objects)
 *    so the LLM can see the complete schema structure
 *
 * @param {string} sessionId - The interview session ID
 * @param {string|null} companyId - Optional company ID reference
 * @param {string|null} companyName - Optional company name for role_overview
 * @param {object|null} userData - Optional user data to hydrate user_context
 * @returns {UniversalGoldenData} A fully initialized Golden Record
 */
export function createInitialGoldenRecord(sessionId, companyId = null, companyName = null, userData = null) {
  const now = new Date().toISOString();

  return {
    id: uuidv4(),
    sessionId,
    createdAt: now,
    updatedAt: now,

    // Context sections
    companyId: companyId || null,
    user_context: {
      name: userData?.name || null,
      timezone: userData?.timezone || null,
      preferred_language: null,
    },

    // =========================================================================
    // ROLE OVERVIEW - The Basics (CRITICAL: must be filled first)
    // =========================================================================
    role_overview: {
      job_title: null,
      company_name: companyName || null,
      department: null,
      employment_type: null,
      location_city: null,
      location_state: null,
      location_country: null,
      location_type: null,
      reports_to: null,
      headcount: null,
      is_new_role: null,
      role_summary: null,
    },

    // =========================================================================
    // FINANCIAL REALITY
    // =========================================================================
    financial_reality: {
      base_compensation: {
        amount_or_range: null,
        pay_frequency: null,
        currency: null,
      },
      variable_compensation: {
        exists: null,
        type: null,
        structure: null,
        average_realized: null,
        frequency: null,
        guarantee_minimum: null,
        guarantee_details: null,
      },
      equity: {
        offered: null,
        type: null,
        vesting_schedule: null,
        cliff: null,
      },
      bonuses: {
        signing_bonus: null,
        retention_bonus: null,
        performance_bonus: null,
        referral_bonus: null,
        holiday_bonus: null,
      },
      raises_and_reviews: {
        review_frequency: null,
        typical_raise_percentage: null,
        promotion_raise_typical: null,
      },
      hidden_financial_value: {
        meals_provided: null,
        meals_details: null,
        discounts: null,
        equipment_provided: null,
        wellness_budget: null,
        commuter_benefits: null,
        phone_stipend: null,
        internet_stipend: null,
      },
      payment_reliability: {
        payment_method: null,
        payment_timing: null,
        overtime_policy: null,
        overtime_rate: null,
      },
    },

    // =========================================================================
    // TIME AND LIFE
    // =========================================================================
    time_and_life: {
      schedule_pattern: {
        type: null,
        typical_hours_per_week: null,
        days_per_week: null,
        shift_types: null,
        shift_length_typical: null,
        weekend_frequency: null,
        holiday_policy: null,
      },
      schedule_predictability: {
        advance_notice: null,
        shift_swapping_allowed: null,
        self_scheduling: null,
        schedule_stability: null,
      },
      flexibility: {
        remote_allowed: null,
        remote_frequency: null,
        remote_details: null,
        async_friendly: null,
        core_hours: null,
        location_flexibility: null,
      },
      time_off: {
        pto_days: null,
        pto_structure: null,
        sick_days: null,
        sick_days_separate: null,
        parental_leave: null,
        bereavement_policy: null,
        mental_health_days: null,
        sabbatical_available: null,
        sabbatical_details: null,
      },
      commute_reality: {
        address: null,
        neighborhood_description: null,
        public_transit_proximity: null,
        parking_situation: null,
        bike_friendly: null,
        bike_storage: null,
      },
      break_reality: {
        paid_breaks: null,
        break_duration: null,
        break_flexibility: null,
      },
      overtime_reality: {
        overtime_expected: null,
        overtime_voluntary: null,
        overtime_notice: null,
        crunch_periods: null,
      },
    },

    // =========================================================================
    // ENVIRONMENT
    // =========================================================================
    environment: {
      physical_space: {
        type: null,
        description: null,
        size_context: null,
      },
      workspace_quality: {
        dedicated_workspace: null,
        workspace_description: null,
        equipment_quality: null,
        natural_light: null,
        noise_level: null,
        temperature_control: null,
      },
      amenities: {
        kitchen: null,
        kitchen_quality: null,
        bathroom_quality: null,
        lounge_area: null,
        outdoor_space: null,
        gym: null,
        showers: null,
        nap_room: null,
        mother_room: null,
      },
      safety_and_comfort: {
        physical_demands: null,
        safety_measures: null,
        dress_code: null,
        uniform_provided: null,
        uniform_cost: null,
      },
      accessibility: {
        wheelchair_accessible: null,
        accessibility_details: null,
        accommodation_friendly: null,
      },
      neighborhood: {
        area_description: null,
        food_options_nearby: null,
        safety_perception: null,
        vibe: null,
      },
    },

    // =========================================================================
    // HUMANS AND CULTURE
    // =========================================================================
    humans_and_culture: {
      team_composition: {
        team_size: null,
        reporting_to: null,
        direct_reports: null,
        cross_functional_interaction: null,
      },
      team_demographics: {
        experience_distribution: null,
        tenure_distribution: null,
        age_range_vibe: null,
        diversity_description: null,
      },
      management_style: {
        manager_description: null,
        management_approach: null,
        feedback_frequency: null,
        one_on_ones: null,
        one_on_one_frequency: null,
      },
      social_dynamics: {
        team_bonding: null,
        social_pressure: null,
        after_work_culture: null,
        remote_social: null,
      },
      communication_culture: {
        primary_channels: null,
        meeting_load: null,
        meeting_description: null,
        async_vs_sync: null,
        documentation_culture: null,
      },
      conflict_and_feedback: {
        feedback_culture: null,
        conflict_resolution: null,
        psychological_safety: null,
      },
      values_in_practice: {
        stated_values: null,
        values_evidence: null,
        decision_making_style: null,
      },
      turnover_context: {
        average_tenure: null,
        why_people_stay: null,
        why_people_leave: null,
        recent_departures_context: null,
      },
    },

    // =========================================================================
    // GROWTH TRAJECTORY
    // =========================================================================
    growth_trajectory: {
      learning_opportunities: {
        mentorship_available: null,
        mentorship_structure: null,
        learning_from_whom: null,
        skill_development: null,
        exposure_to: null,
      },
      formal_development: {
        training_provided: null,
        training_description: null,
        certifications_supported: null,
        certifications_details: null,
        conferences: null,
        conference_budget: null,
        education_reimbursement: null,
        education_details: null,
      },
      career_path: {
        promotion_path: null,
        promotion_timeline_typical: null,
        promotion_criteria: null,
        internal_mobility: null,
      },
      growth_signals: {
        company_growth_rate: null,
        new_roles_being_created: null,
        expansion_plans: null,
      },
      skill_building: {
        technologies_used: null,
        tools_used: null,
        processes_learned: null,
        transferable_skills: null,
      },
      leadership_opportunities: {
        lead_projects: null,
        manage_others: null,
        client_facing: null,
        decision_authority: null,
      },
    },

    // =========================================================================
    // STABILITY SIGNALS
    // =========================================================================
    stability_signals: {
      company_health: {
        company_age: null,
        company_stage: null,
        funding_status: null,
        revenue_trend: null,
        recent_layoffs: null,
        layoff_context: null,
      },
      job_security: {
        position_type: null,
        contract_length: null,
        conversion_possibility: null,
        probation_period: null,
      },
      benefits_security: {
        health_insurance: null,
        health_insurance_details: null,
        health_insurance_start: null,
        dental: null,
        vision: null,
        life_insurance: null,
        disability: null,
        retirement_plan: null,
        retirement_match: null,
        retirement_vesting: null,
      },
      legal_protections: {
        employment_type: null,
        union: null,
        union_details: null,
        at_will: null,
        contract_terms: null,
      },
    },

    // =========================================================================
    // ROLE REALITY
    // =========================================================================
    role_reality: {
      day_to_day: {
        typical_day_description: null,
        variety_level: null,
        task_breakdown: null,
      },
      autonomy: {
        decision_authority: null,
        supervision_level: null,
        creativity_allowed: null,
        process_flexibility: null,
      },
      workload: {
        intensity: null,
        workload_predictability: null,
        staffing_level: null,
        support_available: null,
      },
      resources_and_tools: {
        tools_provided: null,
        tools_quality: null,
        budget_authority: null,
        resource_constraints: null,
      },
      success_metrics: {
        how_measured: null,
        performance_visibility: null,
        feedback_loop: null,
      },
      pain_points_honesty: {
        challenges: null,
        frustrations_common: null,
        what_changed_would_help: null,
      },
      impact_visibility: {
        who_benefits: null,
        impact_tangibility: null,
        recognition_culture: null,
      },
    },

    // =========================================================================
    // UNIQUE VALUE
    // =========================================================================
    unique_value: {
      hidden_perks: {
        list: null,
      },
      convenience_factors: {
        list: null,
      },
      lifestyle_enablers: {
        list: null,
      },
      status_signals: {
        brand_value: null,
        network_access: null,
        credential_value: null,
      },
      personal_meaning: {
        mission_connection: null,
        impact_story: null,
        pride_factor: null,
      },
      rare_offerings: {
        what_competitors_dont_have: null,
        what_makes_this_special: null,
      },
    },

    // =========================================================================
    // EXTRACTION METADATA
    // =========================================================================
    extraction_metadata: {
      source_text: null,
      extraction_confidence: null,
      fields_inferred: null,
      fields_missing: null,
      clarifying_questions: null,
      industry_detected: null,
      role_category_detected: null,
      seniority_detected: null,
      role_archetype: null,
    },
  };
}
