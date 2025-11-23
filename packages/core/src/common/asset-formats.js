import { z } from "zod";
import { ChannelIdEnum } from "./channels.js";

export const AssetArtifactTypeEnum = z.enum(["text", "script", "video_script", "image_prompt", "prompt"]);

export const AssetFormatEnum = z.enum([
  "GENERIC_JOB_POSTING",
  "LINKEDIN_JOB_POSTING",
  "LINKEDIN_FEED_POST",
  "SOCIAL_IMAGE_POST",
  "SOCIAL_STORY_SCRIPT",
  "SHORT_VIDEO_MASTER",
  "SHORT_VIDEO_TIKTOK",
  "SHORT_VIDEO_INSTAGRAM",
  "SHORT_VIDEO_YOUTUBE"
]);

export const ASSET_BLUEPRINT_VERSION = "2024.12-a";

const DEFAULT_BLUEPRINT = {
  channelId: "DEFAULT",
  version: ASSET_BLUEPRINT_VERSION,
  description: "Universal job board listing focused on clarity and conversion.",
  formats: [
    {
      formatId: "GENERIC_JOB_POSTING",
      artifactType: "text",
      title: "Job posting",
      description: "Rich job ad with summary, responsibilities, must-haves, and benefits.",
      tone: "professional, direct, inclusive",
      length: {
        headline: 120,
        body: 600
      },
      structure: ["hook", "company context", "impact bullets", "requirements", "benefits", "CTA"],
      callToAction: "Invite candidates to apply via the included link or company career site.",
      batchKey: "universal"
    }
  ]
};

const LINKEDIN_BLUEPRINT = {
  channelId: "LINKEDIN_JOBS",
  version: ASSET_BLUEPRINT_VERSION,
  description: "LinkedIn job listing plus companion feed content.",
  formats: [
    {
      formatId: "LINKEDIN_JOB_POSTING",
      artifactType: "text",
      title: "LinkedIn job post",
      description: "Formal job post optimized for LinkedIn job listings.",
      tone: "authoritative yet friendly",
      length: {
        headline: 100,
        body: 700
      },
      structure: ["headline", "about company", "responsibilities", "must-haves", "nice-to-haves", "benefits", "CTA"],
      callToAction: "Encourage candidates to apply on LinkedIn or your ATS link.",
      batchKey: "linkedin_jobs"
    },
    {
      formatId: "LINKEDIN_FEED_POST",
      artifactType: "text",
      title: "LinkedIn feed promo",
      description: "Short-form copy for sharing the role via personal/company feed.",
      tone: "conversational, first-person plural",
      length: {
        body: 260
      },
      structure: ["hook", "impact statement", "call to act"],
      callToAction: "Drive to apply link or DM.",
      batchKey: "linkedin_feed"
    }
  ]
};

const META_BLUEPRINT = {
  channelId: "META_FB_IG_LEAD",
  version: ASSET_BLUEPRINT_VERSION,
  description: "Meta placements require a visual concept, short copy, and optional story script.",
  formats: [
    {
      formatId: "SHORT_VIDEO_MASTER",
      artifactType: "video_script",
      title: "Short-form hero script",
      description: "Narrative beats for a 25-35s hero video referencing the role.",
      tone: "energetic, people-first",
      requiresMaster: true,
      batchKey: "meta_master"
    },
    {
      formatId: "SOCIAL_IMAGE_POST",
      artifactType: "image_prompt",
      title: "Image + caption",
      description: "Concept brief for square image plus matching caption/hashtags.",
      tone: "approachable, community-focused",
      length: {
        body: 90,
        hashtags: 6
      },
      structure: ["headline overlay text", "visual direction", "caption", "hashtags"],
      callToAction: "Tap to apply via instant form.",
      batchKey: "meta_image"
    },
    {
      formatId: "SOCIAL_IMAGE_CAPTION",
      artifactType: "text",
      title: "Image caption copy",
      description:
        "Short social caption that pairs with the hero image. Highlight the hook in one sentence, add 1-2 key perks, and end with a CTA + hashtags.",
      tone: "friendly, motivating, community-forward",
      length: {
        body: 160
      },
      structure: ["hook", "value prop", "cta + hashtags"],
      callToAction: "Encourage candidates to click, swipe, or DM to apply.",
      batchKey: "meta_image"
    },
    {
      formatId: "SOCIAL_STORY_SCRIPT",
      artifactType: "script",
      title: "Story/vertical script",
      description: "3-card story outline referencing hero script for cohesion.",
      derivedFromFormatId: "SHORT_VIDEO_MASTER",
      tone: "upbeat, second-person",
      batchKey: "meta_story"
    }
  ]
};

const SHORT_VIDEO_BLUEPRINT = {
  channelId: "TIKTOK_LEAD",
  version: ASSET_BLUEPRINT_VERSION,
  description: "Short-form vertical video with platform-specific hook variants.",
  formats: [
    {
      formatId: "SHORT_VIDEO_MASTER",
      artifactType: "video_script",
      title: "Master short video script",
      description: "Universal script with beats, lines, and visual cues.",
      requiresMaster: true,
      tone: "fast-paced, inspirational",
      length: {
        seconds: 35
      },
      structure: ["pattern interrupt", "why the role", "what you'll do", "CTA"]
    },
    {
      formatId: "SHORT_VIDEO_TIKTOK",
      artifactType: "video_script",
      title: "TikTok adaptation",
      description: "Platform-native rewrite referencing master.",
      derivedFromFormatId: "SHORT_VIDEO_MASTER",
      tone: "trend-aware, authentic",
      length: {
        seconds: 30
      },
      batchKey: "tiktok_variant"
    },
    {
      formatId: "SHORT_VIDEO_INSTAGRAM",
      artifactType: "video_script",
      title: "Instagram Reels adaptation",
      description: "Reels-specific hook and CTA referencing master script.",
      derivedFromFormatId: "SHORT_VIDEO_MASTER",
      tone: "premium, community-forward",
      length: {
        seconds: 30
      },
      batchKey: "instagram_variant"
    }
  ]
};

const CHANNEL_BLUEPRINTS = new Map([
  ["LINKEDIN_JOBS", LINKEDIN_BLUEPRINT],
  ["LINKEDIN_ADS", LINKEDIN_BLUEPRINT],
  ["META_FB_IG_LEAD", META_BLUEPRINT],
  ["FACEBOOK_JOBS_US", META_BLUEPRINT],
  ["TIKTOK_LEAD", SHORT_VIDEO_BLUEPRINT],
  ["YOUTUBE_LEAD", SHORT_VIDEO_BLUEPRINT],
  ["SNAPCHAT_LEADS", SHORT_VIDEO_BLUEPRINT]
]);

export function getBlueprintForChannel(channelId) {
  return CHANNEL_BLUEPRINTS.get(channelId) ?? DEFAULT_BLUEPRINT;
}

export function buildAssetPlan({ channelIds = [] } = {}) {
  const items = [];
  const seenMasterByChannel = new Set();

  channelIds.forEach((channelIdRaw) => {
    if (!channelIdRaw) return;
    const channelId = ChannelIdEnum.parse(channelIdRaw);
    const blueprint = getBlueprintForChannel(channelId);

    blueprint.formats.forEach((format) => {
      const formatId = AssetFormatEnum.parse(format.formatId);
      const artifactType = AssetArtifactTypeEnum.parse(format.artifactType);
      const planId = `${channelId}:${formatId}`;
      const requiresMaster = Boolean(format.requiresMaster);
      const derivedFrom = format.derivedFromFormatId
        ? AssetFormatEnum.parse(format.derivedFromFormatId)
        : null;

      if (requiresMaster && seenMasterByChannel.has(planId)) {
        return;
      }

      if (requiresMaster) {
        seenMasterByChannel.add(planId);
      }

      items.push({
        planId,
        channelId,
        formatId,
        artifactType,
        blueprintVersion: blueprint.version,
        requiresMaster,
        derivedFromFormatId: derivedFrom,
        batchKey:
          format.batchKey ??
          (requiresMaster
            ? `master:${format.formatId}`
            : derivedFrom
            ? `adapt:${derivedFrom}:${channelId}`
            : `channel:${channelId}`),
        title: format.title,
        description: format.description,
        tone: format.tone ?? DEFAULT_BLUEPRINT.formats[0].tone,
        length: format.length ?? null,
        structure: format.structure ?? null,
        callToAction: format.callToAction ?? null
      });
    });
  });

  return {
    version: ASSET_BLUEPRINT_VERSION,
    channels: channelIds,
    items
  };
}

export function splitAssetPlan(items = []) {
  const masters = [];
  const standalone = [];
  const adaptations = [];

  items.forEach((item) => {
    if (item.requiresMaster) {
      masters.push(item);
    } else if (item.derivedFromFormatId) {
      adaptations.push(item);
    } else {
      standalone.push(item);
    }
  });

  return { masters, standalone, adaptations };
}
