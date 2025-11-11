import {
  ShotPhaseEnum,
  CaptionSchema
} from "@wizard/core";
import { normaliseShots, slugify } from "./utils.js";

function pickBenefit(benefits = []) {
  if (!Array.isArray(benefits) || benefits.length === 0) return "flexible schedules";
  return benefits[0];
}

function buildShotTemplate({ jobSnapshot, spec }) {
  const locationText =
    jobSnapshot.geo && jobSnapshot.geo !== "global"
      ? jobSnapshot.geo
      : "your city";
  const payText = jobSnapshot.payRange ? `${jobSnapshot.payRange}` : "Competitive pay";
  const benefit = pickBenefit(jobSnapshot.benefits);

  return [
    {
      phase: ShotPhaseEnum.enum.HOOK,
      visual: "Fast cut of workplace/b-roll",
      onScreenText: `${jobSnapshot.title.toUpperCase()} · ${locationText.toUpperCase()}`,
      voiceOver: `Imagine doing your best work as ${jobSnapshot.title} in ${locationText}.`,
      bRoll: "Exterior + product detail"
    },
    {
      phase: ShotPhaseEnum.enum.PROOF,
      visual: "Show real team moments or product impact",
      onScreenText: `Impact · ${jobSnapshot.company ?? "Great team"}`,
      voiceOver: `${jobSnapshot.company ?? "Our team"} powers meaningful work every day.`,
      bRoll: "Team collaboration"
    },
    {
      phase: ShotPhaseEnum.enum.OFFER,
      visual: "Overlay benefits + comp",
      onScreenText: `${payText} | ${benefit}`,
      voiceOver: `Earn ${payText} and enjoy ${benefit}.`,
      bRoll: "Benefits icons"
    },
    {
      phase: ShotPhaseEnum.enum.ACTION,
      visual: "Clear CTA card",
      onScreenText: `Apply in under a minute`,
      voiceOver: `Ready to apply? Tap and complete the ${spec.placementName} form now.`,
      bRoll: "CTA end card"
    }
  ];
}

function ensureWordCount(text, min = 20, max = 30) {
  const words = text.trim().split(/\s+/);
  if (words.length >= min && words.length <= max) {
    return text.trim();
  }
  if (words.length < min) {
    const filler = ["Apply with one tap.", "Interviews moving fast."];
    while (words.length < min && filler.length > 0) {
      words.push(...filler.shift().split(" "));
    }
    return words.slice(0, max).join(" ");
  }
  return words.slice(0, max).join(" ");
}

export function buildFallbackStoryboard({ jobSnapshot, spec }) {
  const shots = buildShotTemplate({ jobSnapshot, spec });
  return normaliseShots(shots, spec);
}

export function buildFallbackCaption({ jobSnapshot, spec }) {
  const company = jobSnapshot.company ? `${jobSnapshot.company} ` : "Our team ";
  const locationText =
    jobSnapshot.geo && jobSnapshot.geo !== "global"
      ? ` in ${jobSnapshot.geo}`
      : "";
  const benefit = pickBenefit(jobSnapshot.benefits);
  const payText = jobSnapshot.payRange ? ` Pay: ${jobSnapshot.payRange}.` : "";
  const base = `${company}is hiring a ${jobSnapshot.title}${locationText}. Own real impact, enjoy ${benefit}, and grow fast.${payText} Tap to apply in under a minute.`;
  const text = ensureWordCount(base, 20, 30);
  const hashtags = (spec.defaultHashtags ?? ["nowhiring"]).slice(0, 3);
  return CaptionSchema.parse({
    text,
    hashtags
  });
}

export function buildFallbackThumbnail({ jobSnapshot }) {
  const overlayText = `${jobSnapshot.title} · ${slugify(jobSnapshot.geo ?? "global")}`.replace(/-/g, " ");
  return {
    description: "High-contrast frame showing teammate smiling with overlay text",
    overlayText
  };
}
