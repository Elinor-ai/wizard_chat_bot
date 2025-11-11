import { buildSuggestionInstructions } from "./prompts/suggest.js";
import { buildRefinementInstructions } from "./prompts/refine.js";
import { buildChannelRecommendationInstructions } from "./prompts/channels.js";
import { buildChannelPickerInstructions } from "./prompts/channel-picker.js";
import { buildChatPayload } from "./prompts/chat.js";
import { buildCopilotAgentPrompt } from "./prompts/copilot-agent.js";
import {
  buildAssetMasterPrompt,
  buildAssetChannelBatchPrompt,
  buildAssetAdaptPrompt
} from "./prompts/assets.js";
import { buildVideoStoryboardPrompt } from "./prompts/video-storyboard.js";
import { buildVideoCaptionPrompt } from "./prompts/video-caption.js";
import { buildVideoCompliancePrompt } from "./prompts/video-compliance.js";
import { parseSuggestionResult } from "./parsers/suggest.js";
import { parseRefinementResult } from "./parsers/refine.js";
import { parseChannelResult } from "./parsers/channels.js";
import { parseChannelPickerResult } from "./parsers/channel-picker.js";
import { parseChatResult } from "./parsers/chat.js";
import { parseCopilotAgentResult } from "./parsers/copilot-agent.js";
import {
  parseAssetMasterResult,
  parseAssetChannelBatchResult,
  parseAssetAdaptResult
} from "./parsers/assets.js";
import { parseVideoStoryboardResult } from "./parsers/video-storyboard.js";
import { parseVideoCaptionResult } from "./parsers/video-caption.js";
import { parseVideoComplianceResult } from "./parsers/video-compliance.js";
import {
  logChannelPreview,
  logAssetPreview,
  logRefinementPreview,
  logSuggestionPreview,
  logVideoPreview,
} from "./logger.js";

export const TASK_REGISTRY = {
  suggest: {
    system:
      "You are an expert recruitment assistant. Respond ONLY with valid JSON that matches the requested structure.",
    builder: buildSuggestionInstructions,
    parser: parseSuggestionResult,
    mode: "json",
    temperature: 0.1,
    maxTokens: { default: 600, gemini: 8192 },
    retries: 2,
    strictOnRetry: true,
    previewLogger: logSuggestionPreview,
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
  },
  channel_picker: {
    system: "You are a channel picker for recruiting. Follow the provided instructions exactly and output only valid JSON.",
    builder: buildChannelPickerInstructions,
    parser: parseChannelPickerResult,
    mode: "json",
    temperature: 0.2,
    maxTokens: { default: 1000, gemini: 8192 },
    retries: 2,
    strictOnRetry: true,
    previewLogger: logChannelPreview,
  },
  chat: {
    system:
      "You are Wizard's recruiting copilot. Reply succinctly with actionable guidance.",
    builder: buildChatPayload,
    parser: parseChatResult,
    mode: "text",
    temperature: 0.4,
    maxTokens: 400,
    retries: 1,
    strictOnRetry: false,
  },
  copilot_agent: {
    system:
      "You are Wizard's recruiting copilot agent. Decide intelligently whether to call a tool or answer directly. Always return valid JSON.",
    builder: buildCopilotAgentPrompt,
    parser: parseCopilotAgentResult,
    mode: "text",
    temperature: 0.3,
    maxTokens: { default: 800, gemini: 2048 },
    retries: 1,
    strictOnRetry: true,
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
  },
};
