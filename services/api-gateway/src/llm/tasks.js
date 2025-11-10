import { buildSuggestionInstructions } from "./prompts/suggest.js";
import { buildRefinementInstructions } from "./prompts/refine.js";
import { buildChannelRecommendationInstructions } from "./prompts/channels.js";
import { buildChannelPickerInstructions } from "./prompts/channel-picker.js";
import { buildChatPayload } from "./prompts/chat.js";
import {
  buildAssetMasterPrompt,
  buildAssetChannelBatchPrompt,
  buildAssetAdaptPrompt
} from "./prompts/assets.js";
import { parseSuggestionResult } from "./parsers/suggest.js";
import { parseRefinementResult } from "./parsers/refine.js";
import { parseChannelResult } from "./parsers/channels.js";
import { parseChannelPickerResult } from "./parsers/channel-picker.js";
import { parseChatResult } from "./parsers/chat.js";
import {
  parseAssetMasterResult,
  parseAssetChannelBatchResult,
  parseAssetAdaptResult
} from "./parsers/assets.js";
import {
  logChannelPreview,
  logAssetPreview,
  logRefinementPreview,
  logSuggestionPreview,
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
};
