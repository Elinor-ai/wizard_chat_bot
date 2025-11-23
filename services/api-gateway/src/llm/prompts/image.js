import { llmLogger } from "../logger.js";

function compactJobSnapshot(job = {}) {
  const result = {};
  Object.entries(job ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === "string" && value.trim().length === 0) return;
    if (Array.isArray(value) && value.length === 0) return;
    result[key] = value;
  });
  return result;
}

function serialize(label, payload) {
  const json = JSON.stringify(payload, null, 2);
  llmLogger.info(
    { task: label, payloadSize: json.length },
    "LLM image prompt payload"
  );
  return json;
}

export function buildImagePromptInstructions(context = {}) {
  const jobSnapshot = compactJobSnapshot(context.refinedJob ?? context.jobSnapshot ?? {});

  const payload = {
    role: "You are an AI director crafting a vivid prompt for a professional image promoting a job opportunity.",
    mission:
      "Study the refined job details and output a single, richly detailed visual prompt tailored for modern AI image models.",
    guardrails: [
      "Focus on inclusive, modern workplace visuals. Avoid stereotypes and over-the-top sci-fi elements unless the job context explicitly calls for it.",
      "Do not invent company names or logos beyond what is provided.",
      "Reference the work model (onsite, hybrid, remote) only when relevant to the visual.",
      "Prefer describing lighting, composition, attire, environment, and mood explicitly.",
      "If you recommend avoiding certain elements, include them inside negative_prompt."
    ],
    jobContext: jobSnapshot,
    companyContext: context.companyContext ?? null,
    responseContract: {
      prompt: "string - the final descriptive prompt for the image model",
      negative_prompt:
        "string | null - optional instructions on what to avoid (hands errors, text artifacts, etc.)",
      style: "string | null - optional short descriptor such as 'cinematic photography', '3D render', etc."
    },
    exampleResponse: {
      prompt:
        "Wide-angle cinematic shot of a diverse product engineering squad collaborating around an interactive wall display showing customer journey data, warm diffused studio lighting, contemporary startup office in Tel Aviv, focus on curiosity and mentorship, depth of field, 35mm lens.",
      negative_prompt: "blurry, text, watermark, duplicated limbs, over-saturated neon",
      style: "cinematic photography"
    }
  };

  return serialize("image_prompt_generation", payload);
}

export function buildImageGenerationPayload(context = {}) {
  const payload = {
    prompt: context.prompt ?? "",
    negative_prompt: context.negativePrompt ?? null,
    style: context.style ?? null,
    aspect_ratio: context.aspectRatio ?? "1:1",
    size: context.size ?? "1024x1024",
    seed: context.seed ?? null
  };
  return JSON.stringify(payload);
}
