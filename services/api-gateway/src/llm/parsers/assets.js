import { parseJsonContent, safePreview } from "../utils/parsing.js";

function normaliseScriptBeats(beats = []) {
  if (!Array.isArray(beats)) return [];
  return beats
    .map((beat) => {
      if (!beat || typeof beat !== "object") return null;
      const label = typeof beat.beat === "string" ? beat.beat.trim() : "";
      const dialogue =
        typeof beat.dialogue === "string" ? beat.dialogue.trim() : "";
      const visual = typeof beat.visual === "string" ? beat.visual.trim() : "";
      if (!label && !dialogue && !visual) {
        return null;
      }
      return {
        beat: label || null,
        dialogue: dialogue || null,
        visual: visual || null
      };
    })
    .filter(Boolean);
}

function normaliseHashtags(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => tag.length > 0);
}

function normaliseBullets(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((bullet) => (typeof bullet === "string" ? bullet.trim() : ""))
    .filter((bullet) => bullet.length > 0);
}

function extractContent(raw = {}) {
  const content = {};
  const title =
    typeof raw.title === "string"
      ? raw.title.trim()
      : typeof raw.headline === "string"
      ? raw.headline.trim()
      : null;
  if (title) content.title = title;

  const summary =
    typeof raw.summary === "string"
      ? raw.summary.trim()
      : typeof raw.teaser === "string"
      ? raw.teaser.trim()
      : null;
  if (summary) content.summary = summary;

  const body =
    typeof raw.body === "string"
      ? raw.body.trim()
      : typeof raw.caption === "string"
      ? raw.caption.trim()
      : null;
  if (body) content.body = body;

  const script =
    normaliseScriptBeats(
      raw.script_beats ?? raw.script ?? raw.beats ?? raw.timeline
    );
  if (script.length > 0) {
    content.script = script;
  }

  const bullets = normaliseBullets(raw.bullets ?? raw.points);
  if (bullets.length > 0) {
    content.bullets = bullets;
  }

  const hashtags = normaliseHashtags(raw.hashtags ?? raw.tags);
  if (hashtags.length > 0) {
    content.hashtags = hashtags;
  }

  const cta =
    typeof raw.call_to_action === "string"
      ? raw.call_to_action.trim()
      : typeof raw.cta === "string"
      ? raw.cta.trim()
      : null;
  if (cta) {
    content.callToAction = cta;
  }

  const imagePrompt =
    typeof raw.image_prompt === "string"
      ? raw.image_prompt.trim()
      : typeof raw.visual_prompt === "string"
      ? raw.visual_prompt.trim()
      : null;
  if (imagePrompt) {
    content.imagePrompt = imagePrompt;
  }

  const notes =
    typeof raw.notes === "string" ? raw.notes.trim() : undefined;
  if (notes) {
    content.notes = notes;
  }

  return content;
}

function normaliseAssetPayload(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const planIdRaw = entry.plan_id ?? entry.planId ?? entry.id;
  if (typeof planIdRaw !== "string" || planIdRaw.trim().length === 0) {
    return null;
  }

  const rationale =
    typeof entry.rationale === "string"
      ? entry.rationale.trim()
      : typeof entry.reason === "string"
      ? entry.reason.trim()
      : null;

  const rawContent =
    entry.content && typeof entry.content === "object" ? entry.content : {};

  const combinedContent = {
    ...extractContent(entry),
    ...extractContent(rawContent)
  };

  return {
    planId: planIdRaw.trim(),
    rationale,
    content: combinedContent
  };
}

function parseResponsePayload(response, fallbackField) {
  if (response?.json && typeof response.json === "object") {
    return response.json;
  }
  const parsed = parseJsonContent(response?.text);
  if (parsed && typeof parsed === "object") {
    return parsed;
  }
  if (fallbackField && response?.[fallbackField]) {
    return response[fallbackField];
  }
  return null;
}

export function parseAssetMasterResult(response) {
  const parsed = parseResponsePayload(response);
  if (!parsed) {
    return {
      error: {
        reason: "structured_missing",
        message: "LLM did not return asset payload",
        rawPreview: safePreview(response?.text)
      }
    };
  }

  const assetPayload = parsed.asset ?? parsed;
  const asset = normaliseAssetPayload(assetPayload);
  if (!asset) {
    return {
      error: {
        reason: "asset_missing",
        message: "LLM response missing plan_id/content",
        rawPreview: safePreview(response?.text)
      }
    };
  }

  return {
    asset,
    metadata: response?.metadata ?? null
  };
}

export function parseAssetChannelBatchResult(response) {
  const parsed = parseResponsePayload(response);
  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        message: "LLM did not return batch asset payload",
        rawPreview: safePreview(response?.text)
      }
    };
  }

  const assetsInput = Array.isArray(parsed.assets)
    ? parsed.assets
    : Array.isArray(parsed.items)
    ? parsed.items
    : [];

  const assets = assetsInput
    .map((entry) => normaliseAssetPayload(entry))
    .filter(Boolean);

  if (assets.length === 0) {
    return {
      error: {
        reason: "asset_missing",
        message: "LLM batch response missing plan-aligned assets",
        rawPreview: safePreview(response?.text)
      }
    };
  }

  return {
    assets,
    metadata: response?.metadata ?? null
  };
}

export function parseAssetAdaptResult(response) {
  const parsed = parseResponsePayload(response);
  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        reason: "structured_missing",
        message: "LLM did not return adaptation payload",
        rawPreview: safePreview(response?.text)
      }
    };
  }

  const assetPayload = parsed.asset ?? parsed;
  const asset = normaliseAssetPayload(assetPayload);
  if (!asset) {
    return {
      error: {
        reason: "asset_missing",
        message: "LLM adaptation missing plan_id/content",
        rawPreview: safePreview(response?.text)
      }
    };
  }

  return {
    asset,
    metadata: response?.metadata ?? null
  };
}
