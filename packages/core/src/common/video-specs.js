import { z } from "zod";
import { ChannelIdEnum } from "./channels.js";

export const VideoAvailabilityEnum = z.enum(["global", "us_only", "uk_only"]);

export const VideoTextStrategyEnum = z.enum(["supers", "clean"], {
  errorMap: () => ({ message: "Video text strategy must be 'supers' or 'clean'" })
});

export const VideoDurationSchema = z.object({
  minSeconds: z.number().min(1).default(3),
  maxSeconds: z.number().min(3).default(60),
  recommendedSeconds: z.number().min(3).nullable().optional()
});

export const VideoSpecSchema = z.object({
  channelId: ChannelIdEnum,
  placementId: z.string(),
  placementName: z.string(),
  availability: VideoAvailabilityEnum.default("global"),
  medium: z.enum(["video", "short_video"]).default("short_video"),
  aspectRatio: z.string().default("9:16"),
  resolution: z.string().default("1080x1920"),
  duration: VideoDurationSchema,
  captionsRequired: z.boolean().default(true),
  safeZones: z
    .object({
      top: z.number().default(250),
      bottom: z.number().default(250)
    })
    .default({ top: 250, bottom: 250 }),
  endCard: z
    .object({
      required: z.boolean().default(false),
      recommended: z.boolean().default(true),
      guidance: z.string().optional()
    })
    .default({ required: false, recommended: true }),
  captionNotes: z.array(z.string()).default([]),
  complianceNotes: z.array(z.string()).default([]),
  defaultHashtags: z.array(z.string()).default([]),
  defaultCallToAction: z.string().default("Apply now"),
  notes: z.array(z.string()).default([]),
  displayTextStrategy: VideoTextStrategyEnum.default("supers"),
  preferredTier: z.enum(["fast", "standard"]).default("fast")
});

const DEFAULT_VIDEO_SPEC = {
  channelId: "TIKTOK_LEAD",
  placementId: "GENERIC_SHORT",
  placementName: "Short video",
  availability: "global",
  medium: "short_video",
  aspectRatio: "9:16",
  resolution: "1080x1920",
  duration: { minSeconds: 10, maxSeconds: 45, recommendedSeconds: 30 },
  captionsRequired: true,
  safeZones: { top: 220, bottom: 220 },
  endCard: {
    required: false,
    recommended: true,
    guidance: "Reserve last 3s for CTA with logo"
  },
  captionNotes: ["Keep under 2 lines on-screen"],
  complianceNotes: ["Include pay/location when regulations require it"],
  defaultHashtags: ["hiring", "careers"],
  defaultCallToAction: "Apply now",
  notes: ["Deliver Hook → Proof → Offer → Action within spec"]
};

export const VIDEO_CHANNEL_SPECS = [
  {
    channelId: "META_FB_IG_LEAD",
    placementId: "INSTAGRAM_REELS",
    placementName: "Instagram Reels",
    availability: "global",
    medium: "short_video",
    aspectRatio: "9:16",
    resolution: "1080x1920",
    duration: { minSeconds: 15, maxSeconds: 45, recommendedSeconds: 30 },
    captionsRequired: true,
    safeZones: { top: 220, bottom: 300 },
    endCard: {
      required: false,
      recommended: true,
      guidance: "Include CTA + compliance text within final 3 seconds"
    },
    captionNotes: ["Auto-captions required for accessibility"],
    complianceNotes: [
      "Meta employment category: mention 'Equal Opportunity Employer' when possible",
      "No discriminatory targeting"
    ],
    defaultHashtags: ["hiring", "instajobs", "reels"],
    defaultCallToAction: "Apply on Instagram",
    notes: [
      "Use bold on-screen text for ROLE + CITY + PAY",
      "Keep essential text within safe zones",
      "Flag as Meta Employment ad category"
    ],
    displayTextStrategy: "supers",
    preferredTier: "fast"
  },
  {
    channelId: "TIKTOK_LEAD",
    placementId: "TIKTOK_SHORT",
    placementName: "TikTok Short Video",
    availability: "global",
    medium: "short_video",
    aspectRatio: "9:16",
    resolution: "1080x1920",
    duration: { minSeconds: 21, maxSeconds: 34, recommendedSeconds: 28 },
    captionsRequired: true,
    safeZones: { top: 230, bottom: 330 },
    endCard: {
      required: false,
      recommended: true,
      guidance: "Flash CTA + apply link handle"
    },
    captionNotes: ["Use 2-3 short hashtags", "Avoid corporate jargon"],
    complianceNotes: ["HEC (employment) category requires transparent pay/location"],
    defaultHashtags: ["nowhiring", "careers", "tiktokjobs"],
    defaultCallToAction: "Tap to apply",
    notes: ["Hook fast within first 2 seconds", "Use pattern interrupts and text overlays", "HEC (employment) targeting rules apply"],
    displayTextStrategy: "supers",
    preferredTier: "fast"
  },
  {
    channelId: "YOUTUBE_LEAD",
    placementId: "YOUTUBE_SHORTS",
    placementName: "YouTube Shorts",
    availability: "global",
    medium: "short_video",
    aspectRatio: "9:16",
    resolution: "1080x1920",
    duration: { minSeconds: 15, maxSeconds: 60, recommendedSeconds: 45 },
    captionsRequired: true,
    safeZones: { top: 200, bottom: 280 },
    endCard: {
      required: false,
      recommended: true,
      guidance: "End screen with CTA + logo is recommended"
    },
    captionNotes: ["Use 1-2 branded hashtags"],
    complianceNotes: ["Follow employment ad disclosures if targeting regulated regions"],
    defaultHashtags: ["Shorts", "jobs"],
    defaultCallToAction: "Swipe to learn more",
    notes: ["Recommend dedicated end card", "Ensure audio mix leaves room for captions"],
    displayTextStrategy: "clean",
    preferredTier: "standard"
  },
  {
    channelId: "SNAPCHAT_LEADS",
    placementId: "SNAP_SPOTLIGHT",
    placementName: "Snapchat Spotlight",
    availability: "global",
    medium: "short_video",
    aspectRatio: "9:16",
    resolution: "1080x1920",
    duration: { minSeconds: 3, maxSeconds: 15, recommendedSeconds: 9 },
    captionsRequired: true,
    safeZones: { top: 260, bottom: 280 },
    endCard: {
      required: false,
      recommended: true,
      guidance: "Use branded end card under 2 seconds"
    },
    captionNotes: ["Short, high-contrast captions"],
    complianceNotes: ["Mention pay/location when regulated", "Avoid fine print"],
    defaultHashtags: ["snapjobs"],
    defaultCallToAction: "Swipe up to apply",
    notes: ["Keep scenes kinetic", "Use bold overlays with ROLE + CITY"],
    displayTextStrategy: "supers",
    preferredTier: "fast"
  },
  {
    channelId: "X_HIRING",
    placementId: "X_VIDEO_POST",
    placementName: "X Video Post",
    availability: "global",
    medium: "video",
    aspectRatio: "1:1",
    resolution: "1080x1080",
    duration: { minSeconds: 6, maxSeconds: 15, recommendedSeconds: 12 },
    captionsRequired: true,
    safeZones: { top: 200, bottom: 220 },
    endCard: {
      required: false,
      recommended: true,
      guidance: "Overlay CTA + short URL"
    },
    captionNotes: ["Stay under 280 characters", "Add short tracking URL"],
    complianceNotes: ["Avoid sensational claims; mention pay if company policy"],
    defaultHashtags: ["NowHiring"],
    defaultCallToAction: "Apply via link",
    notes: ["Square aspect works best inside feed", "Pair with concise copy"],
    displayTextStrategy: "clean",
    preferredTier: "fast"
  }
];

export const VIDEO_CHANNEL_SPEC_MAP = VIDEO_CHANNEL_SPECS.reduce((acc, spec) => {
  const parsed = VideoSpecSchema.parse(spec);
  acc[spec.channelId] = parsed;
  return acc;
}, {});

export function resolveVideoSpec(channelId) {
  if (!channelId) {
    return VideoSpecSchema.parse(DEFAULT_VIDEO_SPEC);
  }
  const parsedId = ChannelIdEnum.parse(channelId);
  const spec = VIDEO_CHANNEL_SPEC_MAP[parsedId];
  if (spec) {
    return spec;
  }
  return VideoSpecSchema.parse({ ...DEFAULT_VIDEO_SPEC, channelId: parsedId });
}
