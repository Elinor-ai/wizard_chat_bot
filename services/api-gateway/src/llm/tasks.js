import { buildSuggestionInstructions } from "./prompts/suggest.js";
import { buildRefinementInstructions } from "./prompts/refine.js";
import { buildChannelRecommendationInstructions } from "./prompts/channels.js";
import { buildCopilotAgentPrompt } from "./prompts/copilot-agent.js";
import {
  buildAssetMasterPrompt,
  buildAssetChannelBatchPrompt,
  buildAssetAdaptPrompt
} from "./prompts/assets.js";
import { buildVideoConfigPrompt } from "./prompts/video-config.js";
import { buildVideoStoryboardPrompt } from "./prompts/video-storyboard.js";
import { buildVideoCaptionPrompt } from "./prompts/video-caption.js";
import { buildVideoCompliancePrompt } from "./prompts/video-compliance.js";
import { parseSuggestionResult } from "./parsers/suggest.js";
import { parseRefinementResult } from "./parsers/refine.js";
import { parseChannelResult } from "./parsers/channels.js";
import { parseCopilotAgentResult } from "./parsers/copilot-agent.js";
import {
  parseAssetMasterResult,
  parseAssetChannelBatchResult,
  parseAssetAdaptResult
} from "./parsers/assets.js";
import { parseVideoConfigResult } from "./parsers/video-config.js";
import { parseVideoStoryboardResult } from "./parsers/video-storyboard.js";
import { parseVideoCaptionResult } from "./parsers/video-caption.js";
import { parseVideoComplianceResult } from "./parsers/video-compliance.js";
import {
  buildImagePromptInstructions,
  buildImageGenerationPayload
} from "./prompts/image.js";
import { buildImageCaptionPrompt } from "./prompts/image-caption.js";
import { buildCompanyIntelPrompt } from "./prompts/company-intel.js";
import {
  parseImagePromptResult,
  parseImageGenerationResult
} from "./parsers/image.js";
import { parseImageCaptionResult } from "./parsers/image-caption.js";
import { parseCompanyIntelResult } from "./parsers/company-intel.js";
import {
  logChannelPreview,
  logAssetPreview,
  logRefinementPreview,
  logSuggestionPreview,
  logVideoPreview,
  logImagePromptPreview
} from "./logger.js";
import { LLM_TASK_CONFIG } from "../config/llm-config.js";
import {
  buildGoldenInterviewerTurnPrompt,
  buildGoldenInterviewerSystemPrompt,
} from "./prompts/golden-interviewer.js";
import { parseGoldenInterviewerResult } from "./parsers/golden-interviewer.js";
import {
  buildGoldenDbUpdatePrompt,
  buildGoldenDbUpdateSystemPrompt,
} from "./prompts/golden-db-update.js";
import { parseGoldenDbUpdateResult } from "./parsers/golden-db-update.js";
import {
  buildGoldenRefinePrompt,
  buildGoldenRefineSystemPrompt,
} from "./prompts/golden-refine.js";
import { parseGoldenRefineResult } from "./parsers/golden-refine.js";
import {
  SuggestOutputSchema,
  RefineOutputSchema,
  ChannelsOutputSchema,
  CopilotAgentOutputSchema,
  AssetMasterOutputSchema,
  AssetChannelBatchOutputSchema,
  AssetAdaptOutputSchema,
  VideoConfigOutputSchema,
  VideoStoryboardOutputSchema,
  VideoCaptionOutputSchema,
  VideoComplianceOutputSchema,
  ImagePromptOutputSchema,
  ImageCaptionOutputSchema,
  CompanyIntelOutputSchema,
  GoldenInterviewerOutputSchema,
  GoldenDbUpdateOutputSchema,
  GoldenRefineOutputSchema,
} from "./schemas/index.js";

export const TASK_REGISTRY = {
  suggest: {
    system: [
      "You are an expert recruitment assistant who writes grounded, realistic autofill suggestions.",
      "Always follow the work model, location, and industry signals; do NOT suggest remote for on-site roles or vice versa.",
      "Use provided company context to keep tone, benefits, and examples relevant (e.g., hospitality vs. tech).",
      "Honor existing user intent: preserve good content, only overwrite placeholders/garbage.",
      "Return strictly valid JSON that matches the requested contract—no extra text or keys."
    ].join(" "),
    builder: buildSuggestionInstructions,
    parser: parseSuggestionResult,
    mode: "json",
    temperature: 0.1,
    maxTokens: { default: 600, gemini: 8192 },
    retries: 2,
    strictOnRetry: true,
    previewLogger: logSuggestionPreview,
    outputSchema: SuggestOutputSchema,
    outputSchemaName: "suggest_response",
  },
  refine: {
    system:
      "You are a senior hiring editor. Respond ONLY with valid JSON that matches the requested structure.",
    builder: buildRefinementInstructions,
    parser: parseRefinementResult,
    mode: "json",
    temperature: 0.15,
    maxTokens: { default: 900, gemini: 8192 },
    retries: 2,
    strictOnRetry: true,
    previewLogger: logRefinementPreview,
    outputSchema: RefineOutputSchema,
    outputSchemaName: "refine_response",
  },
  channels: {
    system:
      "You are a recruitment marketing strategist. Respond ONLY with valid JSON that matches the requested structure.",
    builder: buildChannelRecommendationInstructions,
    parser: parseChannelResult,
    mode: "json",
    temperature: 0.2,
    maxTokens: { default: 600, gemini: 8192 },
    retries: 2,
    strictOnRetry: true,
    previewLogger: logChannelPreview,
    outputSchema: ChannelsOutputSchema,
    outputSchemaName: "channels_response",
  },
  copilot_agent: {
    system:
      "You are Wizard's recruiting copilot agent. Decide intelligently whether to call a tool or answer directly. Always return valid JSON.",
    builder: buildCopilotAgentPrompt,
    parser: parseCopilotAgentResult,
    mode: "json",
    temperature: 0.3,
    maxTokens: { default: 800, gemini: 2048 },
    retries: 1,
    strictOnRetry: true,
    outputSchema: CopilotAgentOutputSchema,
    outputSchemaName: "copilot_agent_response",
  },
  asset_master: {
    system:
      "You are a recruiting creative director producing hero scripts/prompts for paid media.",
    builder: buildAssetMasterPrompt,
    parser: parseAssetMasterResult,
    mode: "json",
    temperature: 0.35,
    maxTokens: { default: 1200, gemini: 8192 },
    retries: 2,
    strictOnRetry: true,
    previewLogger: logAssetPreview,
    outputSchema: AssetMasterOutputSchema,
    outputSchemaName: "asset_master_response",
  },
  asset_channel_batch: {
    system:
      "You write channel-ready copy blocks for recruiting ads/posts. Follow the provided plan exactly.",
    builder: buildAssetChannelBatchPrompt,
    parser: parseAssetChannelBatchResult,
    mode: "json",
    temperature: 0.25,
    maxTokens: { default: 1000, gemini: 8192 },
    retries: 2,
    strictOnRetry: true,
    previewLogger: logAssetPreview,
    outputSchema: AssetChannelBatchOutputSchema,
    outputSchemaName: "asset_channel_batch_response",
  },
  asset_adapt: {
    system:
      "You adapt a master recruiting script so it feels native to the specified platform.",
    builder: buildAssetAdaptPrompt,
    parser: parseAssetAdaptResult,
    mode: "json",
    temperature: 0.3,
    maxTokens: { default: 800, gemini: 8192 },
    retries: 2,
    strictOnRetry: true,
    previewLogger: logAssetPreview,
    outputSchema: AssetAdaptOutputSchema,
    outputSchemaName: "asset_adapt_response",
  },
  video_config: {
    system:
      "You are a video creative strategist for short-form recruiting videos. Decide on creative intent like tone, pacing, and style. Do NOT mention APIs or technical details. Respond with valid JSON only.",
    builder: buildVideoConfigPrompt,
    parser: parseVideoConfigResult,
    mode: "json",
    temperature: 0.3,
    maxTokens: { default: 600, gemini: 2048 },
    retries: 2,
    strictOnRetry: true,
    previewLogger: logVideoPreview,
    outputSchema: VideoConfigOutputSchema,
    outputSchemaName: "video_config_response",
  },
  video_storyboard: {
    system:
      "You craft structured storyboards for short-form recruiting videos. Respond with valid JSON only.",
    builder: buildVideoStoryboardPrompt,
    parser: parseVideoStoryboardResult,
    mode: "json",
    temperature: 0.25,
    maxTokens: { default: 900, gemini: 8192 },
    retries: 2,
    strictOnRetry: true,
    previewLogger: logVideoPreview,
    outputSchema: VideoStoryboardOutputSchema,
    outputSchemaName: "video_storyboard_response",
  },
  video_caption: {
    system:
      "You write concise, inclusive captions for short recruiting videos. Respond with JSON only.",
    builder: buildVideoCaptionPrompt,
    parser: parseVideoCaptionResult,
    mode: "json",
    temperature: 0.2,
    maxTokens: { default: 400, gemini: 2000 },
    retries: 2,
    strictOnRetry: true,
    previewLogger: logVideoPreview,
    outputSchema: VideoCaptionOutputSchema,
    outputSchemaName: "video_caption_response",
  },
  video_compliance: {
    system:
      "You are a compliance checker for employment ads. Respond with JSON flags only.",
    builder: buildVideoCompliancePrompt,
    parser: parseVideoComplianceResult,
    mode: "json",
    maxTokens: { default: 400, gemini: 2000 },
    temperature: 0,
    retries: 1,
    strictOnRetry: true,
    previewLogger: logVideoPreview,
    outputSchema: VideoComplianceOutputSchema,
    outputSchemaName: "video_compliance_response",
  },
  company_intel: {
    system:
      "You are Gemini's research and enrichment agent collective. Respond ONLY with JSON that matches the response contract.",
    builder: buildCompanyIntelPrompt,
    parser: parseCompanyIntelResult,
    mode: "json",
    temperature: 0.2,
    maxTokens: { default: 1000, gemini: 4096 },
    retries: 2,
    strictOnRetry: true,
    outputSchema: CompanyIntelOutputSchema,
    outputSchemaName: "company_intel_response",
  },
  image_prompt_generation: {
    system:
      "You turn structured job briefs into vivid prompts for image generation models. Respond only with JSON.",
    builder: buildImagePromptInstructions,
    parser: parseImagePromptResult,
    mode: "json",
    temperature: 0.2,
    maxTokens: { default: 600, gemini: 2048 },
    retries: 2,
    strictOnRetry: true,
    previewLogger: logImagePromptPreview,
    outputSchema: ImagePromptOutputSchema,
    outputSchemaName: "image_prompt_response",
  },
  image_generation: {
    // Note: image_generation is special - it directly generates images, not text
    // No outputSchema as the response is binary image data
    system:
      "You are a bridge that forwards prompts to an image model. Always respond with JSON describing the resulting image payload.",
    builder: buildImageGenerationPayload,
    parser: parseImageGenerationResult,
    mode: "json",
    temperature: 0,
    maxTokens: 50,
    retries: 1,
    strictOnRetry: true
  },
  image_caption: {
    system:
      "You craft short, compelling captions for AI images promoting open roles. Respond with JSON only.",
    builder: buildImageCaptionPrompt,
    parser: parseImageCaptionResult,
    mode: "json",
    temperature: 0.35,
    maxTokens: { default: 400, gemini: 800 },
    retries: 2,
    strictOnRetry: true,
    outputSchema: ImageCaptionOutputSchema,
    outputSchemaName: "image_caption_response",
  },
  golden_interviewer: {
    // System prompt is dynamic - built per request based on current schema
    // The systemBuilder function is called by the orchestrator when present
    systemBuilder: buildGoldenInterviewerSystemPrompt,
    system: [
      "You are the Golden Extraction Agent, an expert interviewer conducting an engaging, conversational interview to extract comprehensive job information.",
      "You select visually engaging UI components for each question and extract data into a structured Golden Schema.",
      "You are warm, professional, and genuinely curious. You ask follow-up questions naturally.",
      "You MUST respond with valid JSON matching the specified response format.",
    ].join(" "),
    builder: buildGoldenInterviewerTurnPrompt,
    parser: parseGoldenInterviewerResult,
    mode: "json",
    temperature: 0.7,
    maxTokens: { default: 4000, gemini: 8192 },
    retries: 2,
    strictOnRetry: true,
    // Native structured output schema - enforces response structure at API level
    outputSchema: GoldenInterviewerOutputSchema,
    outputSchemaName: "golden_interviewer_response",
  },
  golden_db_update: {
    // TODO: Implement full system prompt
    systemBuilder: buildGoldenDbUpdateSystemPrompt,
    system: "You are a data extraction assistant. Extract structured data from user responses.",
    builder: buildGoldenDbUpdatePrompt,
    parser: parseGoldenDbUpdateResult,
    mode: "json",
    temperature: 0.1,
    maxTokens: { default: 1000, gemini: 2048 },
    retries: 2,
    strictOnRetry: true,
    outputSchema: GoldenDbUpdateOutputSchema,
    outputSchemaName: "golden_db_update_response",
  },
  golden_refine: {
    // TODO: Implement full system prompt when requirements are finalized
    systemBuilder: buildGoldenRefineSystemPrompt,
    system: "You are a data refinement assistant. Analyze and suggest improvements to collected job data.",
    builder: buildGoldenRefinePrompt,
    parser: parseGoldenRefineResult,
    mode: "json",
    temperature: 0.3,
    maxTokens: { default: 2000, gemini: 4096 },
    retries: 2,
    strictOnRetry: true,
    outputSchema: GoldenRefineOutputSchema,
    outputSchemaName: "golden_refine_response",
  },
};

const missingTaskConfig = Object.keys(TASK_REGISTRY).filter(
  (task) => !LLM_TASK_CONFIG[task]
);
if (missingTaskConfig.length > 0) {
  throw new Error(
    `LLM task configuration missing for: ${missingTaskConfig.join(", ")}`
  );
}
