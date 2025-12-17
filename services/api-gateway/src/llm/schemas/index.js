/**
 * LLM Output Schemas
 *
 * Zod schemas for structured outputs from all LLM tasks.
 * These schemas are used by providers (OpenAI/Gemini) to enforce response structure.
 */

import { z } from "zod";

// =============================================================================
// SUGGEST TASK
// =============================================================================

const AutofillCandidateSchema = z.object({
  fieldId: z.string().describe("Field ID matching jobSchema"),
  value: z.any().describe("String, array, or number value"),
  rationale: z.string().optional().describe("Why this value fits"),
  confidence: z.number().optional().describe("0.0 to 1.0"),
  source: z.string().optional().describe("Source identifier"),
});

export const SuggestOutputSchema = z.object({
  autofill_candidates: z.array(AutofillCandidateSchema).describe(
    "List of suggested field values"
  ),
});

// =============================================================================
// REFINE TASK
// =============================================================================

const RefinedJobSchema = z.object({
  roleTitle: z.string().optional(),
  companyName: z.string().optional(),
  location: z.string().optional(),
  zipCode: z.string().optional(),
  industry: z.string().optional(),
  seniorityLevel: z.string().optional(),
  employmentType: z.string().optional(),
  workModel: z.string().optional(),
  jobDescription: z.string().optional(),
  coreDuties: z.array(z.string()).optional(),
  mustHaves: z.array(z.string()).optional(),
  benefits: z.array(z.string()).optional(),
  currency: z.string().optional(),
  salary: z.string().optional(),
  salaryPeriod: z.string().optional(),
});

const AnalysisSchema = z.object({
  improvement_score: z.number().optional(),
  original_score: z.number().optional(),
  ctr_prediction: z.string().optional(),
  impact_summary: z.string().optional(),
  key_improvements: z.array(z.string()).optional(),
});

const ChangeDetailsSchema = z.object({
  titleChanges: z.array(z.string()).optional(),
  descriptionChanges: z.array(z.string()).optional(),
  requirementsChanges: z.array(z.string()).optional(),
  otherChanges: z.array(z.string()).optional(),
});

export const RefineOutputSchema = z.object({
  refined_job: RefinedJobSchema.describe("The refined job object"),
  analysis: AnalysisSchema.optional().describe("Improvement metrics"),
  changeDetails: ChangeDetailsSchema.optional().describe("What was changed"),
});

// =============================================================================
// CHANNELS TASK
// =============================================================================

const ChannelRecommendationSchema = z.object({
  channel: z.string().describe("Channel ID from supportedChannels"),
  reason: z.string().describe("Why this channel fits"),
  expectedCPA: z.number().optional().describe("USD cost per application"),
});

export const ChannelsOutputSchema = z.object({
  recommendations: z.array(ChannelRecommendationSchema).describe(
    "Recommended channels for the job"
  ),
});

// =============================================================================
// COPILOT AGENT TASK
// =============================================================================

const ActionSchema = z.object({
  type: z.string().optional(),
  label: z.string().optional(),
  payload: z.any().optional(),
});

export const CopilotAgentOutputSchema = z.object({
  type: z.enum(["tool_call", "final"]).describe("Response type"),
  tool: z.string().optional().describe("Tool name when type=tool_call"),
  input: z.record(z.any()).optional().describe("Tool input payload"),
  message: z.string().optional().describe("Reply when type=final"),
  actions: z.array(ActionSchema).optional().describe("Suggested UI actions"),
});

// =============================================================================
// ASSET TASKS
// =============================================================================

const ScriptBeatSchema = z.object({
  beat: z.string().optional(),
  dialogue: z.string().optional(),
  visual: z.string().optional(),
});

const AssetContentSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  body: z.string().optional(),
  script_beats: z.array(ScriptBeatSchema).optional(),
  bullets: z.array(z.string()).optional(),
  hashtags: z.array(z.string()).optional(),
  call_to_action: z.string().optional(),
  image_prompt: z.string().optional(),
  hook: z.string().optional(),
});

export const AssetMasterOutputSchema = z.object({
  plan_id: z.string().describe("Plan ID for this asset"),
  title: z.string().optional().describe("Working title or hook"),
  rationale: z.string().optional().describe("Why this approach fits"),
  content: AssetContentSchema.describe("Asset content"),
});

export const AssetChannelBatchOutputSchema = z.object({
  assets: z.array(
    z.object({
      plan_id: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      bullets: z.array(z.string()).optional(),
      hashtags: z.array(z.string()).optional(),
      rationale: z.string().optional(),
      call_to_action: z.string().optional(),
    })
  ).describe("Channel-ready assets"),
});

export const AssetAdaptOutputSchema = AssetMasterOutputSchema;

// =============================================================================
// VIDEO CONFIG TASK
// =============================================================================

export const VideoConfigOutputSchema = z.object({
  lengthPreset: z.enum(["short", "medium", "long"]).optional(),
  targetSeconds: z.number().optional(),
  primaryChannelFocus: z.string().optional(),
  tone: z.enum(["energetic", "professional", "friendly"]).optional(),
  hasVoiceOver: z.boolean().optional(),
  audioStyle: z.enum(["music_only", "voiceover_with_music", "silent"]).optional(),
  visualStyle: z.enum(["native_tiktok", "polished_corporate", "cinematic"]).optional(),
  notesForStoryboard: z.string().optional(),
});

// =============================================================================
// VIDEO STORYBOARD TASK
// =============================================================================

const ShotSchema = z.object({
  phase: z.enum(["HOOK", "PROOF", "OFFER", "ACTION"]),
  duration_seconds: z.number().optional(),
  visual: z.string().optional(),
  on_screen_text: z.string().optional(),
  voice_over: z.string().optional(),
  b_roll: z.string().optional(),
});

const ThumbnailSchema = z.object({
  description: z.string().optional(),
  overlay_text: z.string().optional(),
});

export const VideoStoryboardOutputSchema = z.object({
  shots: z.array(ShotSchema).describe("4-6 shots for the video"),
  thumbnail: ThumbnailSchema.optional().describe("Thumbnail recommendation"),
});

// =============================================================================
// VIDEO CAPTION TASK
// =============================================================================

export const VideoCaptionOutputSchema = z.object({
  caption_text: z.string().describe("20-30 word caption"),
  hashtags: z.array(z.string()).optional().describe("Relevant hashtags"),
  cta: z.string().optional().describe("Call to action"),
});

// =============================================================================
// VIDEO COMPLIANCE TASK
// =============================================================================

const ComplianceFlagSchema = z.object({
  id: z.string(),
  label: z.string(),
  severity: z.enum(["info", "warning", "blocking"]),
  details: z.string().optional(),
});

export const VideoComplianceOutputSchema = z.object({
  flags: z.array(ComplianceFlagSchema).describe("Compliance flags"),
});

// =============================================================================
// IMAGE PROMPT GENERATION TASK
// =============================================================================

export const ImagePromptOutputSchema = z.object({
  prompt: z.string().describe("Descriptive prompt for image model"),
  negative_prompt: z.string().optional().describe("What to avoid"),
  style: z.string().optional().describe("Style descriptor"),
});

// =============================================================================
// IMAGE CAPTION TASK
// =============================================================================

export const ImageCaptionOutputSchema = z.object({
  caption: z.string().describe("Caption under 180 characters"),
  hashtags: z.array(z.string()).optional().describe("2-4 relevant hashtags"),
});

// =============================================================================
// COMPANY INTEL TASK
// =============================================================================

const ProfileSchema = z.object({
  officialName: z.string().optional(),
  website: z.string().optional(),
  companyType: z.string().optional(),
  industry: z.string().optional(),
  employeeCountBucket: z.string().optional(),
  hqCountry: z.string().optional(),
  hqCity: z.string().optional(),
  tagline: z.string().optional(),
  summary: z.string().optional(),
  toneOfVoice: z.string().optional(),
});

const BrandingSchema = z.object({
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  fontFamilyPrimary: z.string().optional(),
  additionalBrandNotes: z.string().optional(),
});

const SocialsSchema = z.object({
  linkedin: z.string().optional(),
  facebook: z.string().optional(),
  instagram: z.string().optional(),
  tiktok: z.string().optional(),
  twitter: z.string().optional(),
  youtube: z.string().optional(),
});

const JobSchema = z.object({
  title: z.string(),
  url: z.string(),
  source: z.string().optional(),
  location: z.string().optional(),
  industry: z.string().optional(),
  seniorityLevel: z.string().optional(),
  employmentType: z.string().optional(),
  workModel: z.string().optional(),
  description: z.string().optional(),
  coreDuties: z.array(z.string()).optional(),
  mustHaves: z.array(z.string()).optional(),
  benefits: z.array(z.string()).optional(),
  salary: z.string().optional(),
  salaryPeriod: z.string().optional(),
  currency: z.string().optional(),
  postedAt: z.string().optional(),
  discoveredAt: z.string().optional(),
  confidence: z.number().optional(),
  fieldConfidence: z.record(z.number()).optional(),
  sourceEvidence: z.array(z.string()).optional(),
});

const EvidenceEntrySchema = z.object({
  value: z.any().optional(),
  sources: z.array(z.string()).optional(),
});

const EvidenceSchema = z.object({
  profile: z.record(EvidenceEntrySchema).optional(),
  branding: z.record(EvidenceEntrySchema).optional(),
  socials: z.record(EvidenceEntrySchema).optional(),
  jobs: z.array(z.object({
    title: z.string().optional(),
    url: z.string().optional(),
    sources: z.array(z.string()).optional(),
  })).optional(),
});

export const CompanyIntelOutputSchema = z.object({
  profile: ProfileSchema.optional(),
  branding: BrandingSchema.optional(),
  socials: SocialsSchema.optional(),
  jobs: z.array(JobSchema).optional(),
  evidence: EvidenceSchema.optional(),
});

// =============================================================================
// GOLDEN INTERVIEWER TASK (re-exported from separate file)
// =============================================================================

export { GoldenInterviewerOutputSchema } from "./golden-interviewer.js";

// =============================================================================
// GOLDEN DB UPDATE TASK (Saver Agent)
// =============================================================================

export const GoldenDbUpdateOutputSchema = z.object({
  updates: z.record(z.any()).describe("Key-value pairs to update in the Golden Schema. Keys use dot notation (e.g., 'financial_reality.base_compensation.amount_or_range')"),
  reasoning: z.string().optional().describe("Brief explanation of what was extracted and why"),
});
