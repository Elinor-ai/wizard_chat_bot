import { ShotPhaseEnum } from "@wizard/core";
import { parseJsonContent, safePreview } from "../utils/parsing.js";

function normalizePhase(value) {
  const upper = (value ?? "").toString().trim().toUpperCase();
  if (ShotPhaseEnum.options.includes(upper)) {
    return upper;
  }
  return null;
}

function normalizeShots(shots = []) {
  if (!Array.isArray(shots)) return [];
  return shots
    .map((shot, index) => {
      if (!shot || typeof shot !== "object") return null;
      const phase = normalizePhase(shot.phase ?? shot.stage);
      const visual = typeof shot.visual === "string" ? shot.visual.trim() : "";
      const onScreenText =
        typeof shot.on_screen_text === "string"
          ? shot.on_screen_text.trim()
          : typeof shot.text === "string"
          ? shot.text.trim()
          : "";
      const voiceOver =
        typeof shot.voice_over === "string"
          ? shot.voice_over.trim()
          : typeof shot.voice === "string"
          ? shot.voice.trim()
          : "";
      if (!phase || (!visual && !onScreenText && !voiceOver)) {
        return null;
      }
      return {
        id: `shot-${index + 1}`,
        phase,
        order: index + 1,
        durationSeconds: Number(shot.duration_seconds ?? shot.duration ?? 4) || 4,
        startSeconds: Number(shot.start_seconds ?? 0),
        visual,
        onScreenText,
        voiceOver,
        bRoll:
          typeof shot.b_roll === "string"
            ? shot.b_roll.trim()
            : typeof shot.broll === "string"
            ? shot.broll.trim()
            : null
      };
    })
    .filter(Boolean);
}

function normalizeThumbnail(thumbnail = {}) {
  const description =
    typeof thumbnail.description === "string"
      ? thumbnail.description.trim()
      : typeof thumbnail.prompt === "string"
      ? thumbnail.prompt.trim()
      : "Recommended high-contrast frame";
  const overlay =
    typeof thumbnail.overlay_text === "string"
      ? thumbnail.overlay_text.trim()
      : typeof thumbnail.text === "string"
      ? thumbnail.text.trim()
      : null;
  return {
    description,
    overlayText: overlay
  };
}

export function parseVideoStoryboardResult(response) {
  const parsed = parseJsonContent(response?.text) ?? response?.json;
  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        message: "LLM did not return storyboard JSON",
        rawPreview: safePreview(response?.text)
      }
    };
  }

  const shots = normalizeShots(parsed.shots ?? parsed.storyboard);
  if (shots.length < 4) {
    return {
      error: {
        reason: "shots_missing",
        message: "Storyboard requires at least 4 shots",
        rawPreview: safePreview(response?.text)
      }
    };
  }

  const thumbnail = normalizeThumbnail(parsed.thumbnail ?? {});

  return {
    shots,
    thumbnail,
    metadata: response?.metadata ?? null
  };
}
