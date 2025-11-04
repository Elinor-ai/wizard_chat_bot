import { Buffer } from "node:buffer";
import { createLogger, loadEnv } from "@wizard/utils";

// Ensure .env variables are loaded before resolving provider config
loadEnv();

const logger = createLogger("llm-client");

const DEFAULT_OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? process.env.LLM_CHAT_MODEL ?? "gpt-4o-mini";
const DEFAULT_OPENAI_SUGGEST_MODEL =
  process.env.OPENAI_SUGGEST_MODEL ??
  process.env.LLM_SUGGESTION_MODEL ??
  DEFAULT_OPENAI_CHAT_MODEL;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? process.env.LLM_CHAT_API_KEY ?? null;
const OPENAI_API_URL = process.env.OPENAI_API_URL ?? "https://api.openai.com/v1/chat/completions";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? process.env.LLM_GEMINI_API_KEY ?? null;
const GEMINI_API_URL = process.env.GEMINI_API_URL ?? "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_SUGGEST_MODEL = process.env.GEMINI_SUGGEST_MODEL ?? "gemini-1.5-flash";
const DEFAULT_GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL ?? "gemini-1.5-pro";

const JOB_FIELD_GUIDE = [
  {
    id: "roleTitle",
    label: "Role Title",
    required: true,
    description: "The job title candidates search for; keep it clear and industry-standard.",
    example: "Senior Backend Engineer"
  },
  {
    id: "companyName",
    label: "Company Name",
    required: true,
    description: "The employer or brand the candidate will work for.",
    example: "Botson Labs"
  },
  {
    id: "location",
    label: "Primary Location",
    required: true,
    description: "City, region, or 'Remote' descriptor candidates need for the commute expectation.",
    example: "Tel Aviv, Israel"
  },
  {
    id: "zipCode",
    label: "Postal Code",
    required: false,
    description: "ZIP or postal code for precise geo-targeting or compensation benchmarking.",
    example: "94107"
  },
  {
    id: "industry",
    label: "Industry",
    required: false,
    description: "Industry or business domain of the role, used for benchmarking language and benefits.",
    example: ""
  },
  {
    id: "seniorityLevel",
    label: "Seniority Level",
    required: true,
    description: "Candidate experience expectation (entry, mid, senior, lead, executive).",
    example: "mid"
  },
  {
    id: "employmentType",
    label: "Employment Type",
    required: true,
    description: "Engagement type advertised to candidates (full_time, part_time, contract, temporary, seasonal, intern).",
    example: "full_time"
  },
  {
    id: "workModel",
    label: "Work Model",
    required: false,
    description: "Primary work arrangement (on_site, hybrid, remote).",
    example: "hybrid"
  },
  {
    id: "jobDescription",
    label: "Job Description",
    required: true,
    description: "Narrative summary explaining mission, impact, and what success looks like in the role.",
    example: "Lead the team delivering AI-assisted hiring tools..."
  },
  {
    id: "coreDuties",
    label: "Core Duties",
    required: false,
    description: "Bullet-friendly list of daily responsibilities or ownership areas.",
    example: ["Design scalable APIs", "Partner with product on roadmaps"]
  },
  {
    id: "mustHaves",
    label: "Must-have Qualifications",
    required: false,
    description: "Non-negotiable skills, experiences, or certifications candidates must bring.",
    example: ["3+ years with Node.js", "Experience with Firestore at scale"]
  },
  {
    id: "benefits",
    label: "Benefits & Perks",
    required: false,
    description: "Meaningful benefits that differentiate the role (one item per perk).",
    example: ["Flexible hybrid schedule", "Equity refresh annually"]
  },
  {
    id: "currency",
    label: "Compensation Currency",
    required: false,
    description: "ISO currency code for salary messaging.",
    example: "USD"
  },
  {
    id: "salary",
    label: "Salary or Range",
    required: false,
    description: "Compensation figure candidates should see, ideally formatted with units.",
    example: "$120,000 – $140,000"
  },
  {
    id: "salaryPeriod",
    label: "Salary Period",
    required: false,
    description: "Cadence for salary (per year, monthly, hourly, per shift).",
    example: "per year"
  }
];

const JOB_REQUIRED_FIELDS = JOB_FIELD_GUIDE.filter((field) => field.required).map((field) => field.id);
const JOB_FIELD_IDS = JOB_FIELD_GUIDE.map((field) => field.id);

const AUTOFILL_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    autofill_candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fieldId: { type: "string" },
          value: {
            oneOf: [
              { type: "string" },
              { type: "number" },
              { type: "boolean" },
              { type: "array" },
              { type: "object" },
              { type: "null" }
            ]
          },
          rationale: { type: "string" },
          confidence: { type: "number" },
          source: { type: "string" }
        },
        required: ["fieldId", "value"],
        additionalProperties: false
      }
    }
  },
  required: ["autofill_candidates"],
  additionalProperties: false
};
function logSuggestionPreview(provider, rawContent) {
  if (typeof rawContent !== "string") return;
  const trimmed = rawContent.trim();
  logger.info(
    {
      provider,
      content: trimmed,
      length: trimmed.length
    },
    "LLM suggestion raw response"
  );
}

function parseProviderSpec(spec, { defaultProvider, defaultModel }) {
  if (!spec) {
    return { provider: defaultProvider, model: defaultModel, modelProvided: false };
  }
  const [maybeProvider, ...rest] = spec.split(":" );
  if (rest.length === 0) {
    if (["openai", "gemini"].includes(maybeProvider)) {
      return { provider: maybeProvider, model: defaultModel, modelProvided: false };
    }
    if (maybeProvider.startsWith("gemini-")) {
      return { provider: "gemini", model: maybeProvider, modelProvided: true };
    }
    return { provider: defaultProvider, model: maybeProvider, modelProvided: true };
  }
  const modelPart = rest.join(":" );
  return {
    provider: maybeProvider || defaultProvider,
    model: modelPart || defaultModel,
    modelProvided: modelPart.length > 0
  };
}

const suggestionSpec = process.env.LLM_SUGGESTION_PROVIDER ?? `openai:${DEFAULT_OPENAI_SUGGEST_MODEL}`;
const suggestionResolved = parseProviderSpec(suggestionSpec, {
  defaultProvider: "openai",
  defaultModel: DEFAULT_OPENAI_SUGGEST_MODEL
});
const suggestionProvider = suggestionResolved.provider;
const suggestionModel =
  suggestionProvider === "gemini"
    ? suggestionResolved.modelProvided
      ? suggestionResolved.model
      : DEFAULT_GEMINI_SUGGEST_MODEL
    : suggestionResolved.modelProvided
    ? suggestionResolved.model
    : DEFAULT_OPENAI_SUGGEST_MODEL;

logger.info({ suggestionProvider, suggestionModel }, "LLM suggestion provider configured");

const chatSpec = process.env.LLM_CHAT_PROVIDER ?? `openai:${DEFAULT_OPENAI_CHAT_MODEL}`;
const chatResolved = parseProviderSpec(chatSpec, {
  defaultProvider: "openai",
  defaultModel: DEFAULT_OPENAI_CHAT_MODEL
});
const chatProvider = chatResolved.provider;
const chatModel =
  chatProvider === "gemini"
    ? chatResolved.modelProvided
      ? chatResolved.model
      : DEFAULT_GEMINI_CHAT_MODEL
    : chatResolved.modelProvided
    ? chatResolved.model
    : DEFAULT_OPENAI_CHAT_MODEL;

logger.info({ chatProvider, chatModel }, "LLM chat provider configured");

function ensureOpenAIKey() {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }
}

function ensureGeminiKey() {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY missing");
  }
}

async function callOpenAI({ messages, model, temperature = 0.2, maxTokens = 800, responseFormat }) {
  ensureOpenAIKey();

  const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens
  };

  if (responseFormat) {
    payload.response_format = responseFormat;
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI response missing content");
  }
  return content;
}

async function callGemini({
  model,
  contents,
  temperature = 0.2,
  maxOutputTokens = 800,
  responseMimeType,
  expectJson = false
}) {
  ensureGeminiKey();

  const baseUrl = GEMINI_API_URL.replace(/\/$/, "");
  const endpoint = `${baseUrl}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens,
      ...(responseMimeType ? { responseMimeType } : {})
    }
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Gemini request failed: ${response.status} ${JSON.stringify(data)}`);
  }

  const candidate = data?.candidates?.[0] ?? null;
  const parts = candidate?.content?.parts ?? [];
  let jsonPayload = null;
  const text = parts
    .map((part) => {
      if (typeof part?.text === "string") {
        return part.text;
      }
      if (part?.inlineData?.data) {
        try {
          return Buffer.from(part.inlineData.data, "base64").toString("utf8");
        } catch (_error) {
          return "";
        }
      }
      if (part?.functionCall?.args) {
        try {
          return JSON.stringify(part.functionCall.args);
        } catch (_error) {
          return "";
        }
      }
      if (part?.jsonValue) {
        try {
          if (jsonPayload === null) {
            jsonPayload = part.jsonValue;
          }
          return JSON.stringify(part.jsonValue);
        } catch (_error) {
          return "";
        }
      }
      return "";
    })
    .join("")
    .trim();

  if (!text) {
    const finishReason = candidate?.finishReason ?? data?.finishReason ?? null;
    logger.warn(
      { provider: "gemini", finishReason, candidateSummary: candidate ? Object.keys(candidate) : null },
      "Gemini response missing textual content"
    );
    throw new Error("Gemini response missing content");
  }

  if (expectJson) {
    const metadata = {
      promptTokenCount: data?.usageMetadata?.promptTokenCount ?? null,
      candidatesTokenCount: data?.usageMetadata?.candidatesTokenCount ?? null,
      totalTokenCount: data?.usageMetadata?.totalTokenCount ?? null
    };
    return { text, json: jsonPayload, metadata };
  }

  return text;
}

function parseJsonContent(content) {
  if (!content) return null;
  let jsonText = content.trim();
  const fencedMatch = jsonText.match(/```json([\s\S]*?)```/i);
  if (fencedMatch) {
    jsonText = fencedMatch[1];
  } else {
    const genericFence = jsonText.match(/```([\s\S]*?)```/);
    if (genericFence) {
      jsonText = genericFence[1];
    }
  }

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    logger.warn(
      { message: error?.message, preview: jsonText.slice(0, 200) },
      "Failed to parse LLM JSON"
    );

    const lastBrace = Math.max(jsonText.lastIndexOf("}"), jsonText.lastIndexOf("]"));
    if (lastBrace > 0) {
      try {
        return JSON.parse(jsonText.slice(0, lastBrace + 1));
      } catch (innerError) {
        logger.warn({ message: innerError?.message }, "Second pass JSON parse failed");
      }
    }
    const repaired = repairJsonString(jsonText);
    if (repaired) {
      try {
        const repairedObject = JSON.parse(repaired);
        logger.warn(
          { preview: repaired.slice(0, 120) },
          "JSON repair succeeded"
        );
        return repairedObject;
      } catch (repairError) {
        logger.warn({ message: repairError?.message }, "Repaired JSON still invalid");
      }
    }
    return null;
  }
}

function repairJsonString(input) {
  if (!input) return null;
  let text = input.trim();

  // Remove trailing commas before closing braces/brackets
  text = text.replace(/,(?=\s*[}\]])/g, "");

  // Ensure quotes are balanced (simple heuristic)
  const quoteMatches = text.match(/"/g) ?? [];
  if (quoteMatches.length % 2 !== 0) {
    text += '"';
  }

  // Balance brackets and braces
  const braceDelta = (text.match(/\{/g) ?? []).length - (text.match(/\}/g) ?? []).length;
  if (braceDelta > 0) {
    text += "}".repeat(braceDelta);
  }
  const bracketDelta = (text.match(/\[/g) ?? []).length - (text.match(/\]/g) ?? []).length;
  if (bracketDelta > 0) {
    text += "]".repeat(bracketDelta);
  }

  // If still not ending with closing brace/bracket, append
  if (!/[}\]]$/.test(text)) {
    text += "}";
  }

  return text;
}

function normaliseCandidates(rawCandidates = [], context = {}) {
  if (!Array.isArray(rawCandidates)) {
    return [];
  }

  return rawCandidates
    .filter((candidate) => {
      if (!candidate || typeof candidate.fieldId !== "string") {
        return false;
      }
      if (!JOB_FIELD_IDS.includes(candidate.fieldId)) {
        return false;
      }
      if (candidate.value === undefined) {
        return false;
      }
      return true;
    })
    .map((candidate) => ({
      fieldId: candidate.fieldId,
      value: candidate.value,
      rationale: candidate.rationale ?? "",
      confidence:
        typeof candidate.confidence === "number" && candidate.confidence >= 0 && candidate.confidence <= 1
          ? candidate.confidence
          : undefined,
      source: candidate.source ?? "expert-assistant"
    }));
}

function buildSuggestionInstructions(context) {
  const strictNotes = context?.strictMode
    ? "Previous output was not valid JSON. You MUST return a single JSON object that exactly matches the responseContract. Do not include text before or after the JSON object."
    : null;
  const payloadObject = {
    role: "You are an expert recruitment assistant helping employers craft world-class job postings.",
    mission:
      "Analyse the partially completed job data and suggest polished values for any remaining fields so the final posting is compelling and ready for distribution.",
    guardrails: [
      "Never overwrite fields that already contain strong employer-provided content unless explicitly asked; focus on gaps.",
      "Use concise, candidate-friendly language that fits the field type.",
      "When you infer a value, explain the logic in the rationale so the employer can decide whether to accept it.",
      "Only return fields defined in the jobSchema. Ignore anything outside that contract.",
      "If visibleFieldIds are provided, suggest values only for those fields unless you have a high-confidence improvement elsewhere.",
      "Return exactly one JSON object. Do not include commentary or characters after the closing brace.",
      "Do not leave trailing commas before closing brackets or braces; ensure the JSON parses with JSON.parse()."
    ],
    responseContract: {
      autofill_candidates: [
        {
          fieldId: "string",
          value: "string | string[] | number",
          rationale: "string explaining why the suggestion helps",
          confidence: "number between 0 and 1 indicating how confident you are",
          source: "string tag for traceability (use 'expert-assistant')"
        }
      ]
    },
    exampleResponse: {
      autofill_candidates: [
        {
          fieldId: "industry",
          value: "Software & Technology",
          rationale: "The company ships AI-powered products, so the industry is Software/Technology.",
          confidence: 0.9,
          source: "expert-assistant"
        }
      ]
    },
    jobSchema: JOB_FIELD_GUIDE,
    requiredFields: JOB_REQUIRED_FIELDS,
    visibleFieldIds:
      Array.isArray(context.visibleFieldIds) && context.visibleFieldIds.length > 0
        ? context.visibleFieldIds
        : null,
    currentJob: context.jobSnapshot ?? {},
    previousSuggestions: context.previousSuggestions ?? {},
    updatedFieldId: context.updatedFieldId ?? null,
    attempt: context.attempt ?? 0,
    retryGuidance: strictNotes
  };

  const payload = JSON.stringify(payloadObject, null, 2);

  logger.info(
    {
      provider: suggestionProvider,
      content: payload,
      length: payload.length
    },
    "LLM suggestion prompt"
  );

  return payload;
}

async function askSuggestionsOpenAI(context) {
  const systemPrompt =
    "You are an expert recruitment assistant. Respond ONLY with valid JSON that matches the requested structure.";
  const userPrompt = {
    role: "user",
    content: buildSuggestionInstructions(context)
  };

  const content = await callOpenAI({
    model: suggestionModel,
    messages: [
      { role: "system", content: systemPrompt },
      userPrompt
    ],
    temperature: 0.1,
    maxTokens: 600,
    responseFormat: { type: "json_object" }
  });

  logSuggestionPreview("openai", content);

  const parsed = parseJsonContent(content);
  if (parsed && typeof parsed === "object") {
    const candidates = normaliseCandidates(
      parsed.autofill_candidates ?? parsed.autofillCandidates ?? parsed.candidates ?? [],
      context
    );
    return { candidates };
  }
  return {
    error: {
      reason: "structured_missing",
      rawPreview: content ? String(content).slice(0, 400) : null,
      message: "LLM did not return valid autofill_candidates JSON"
    }
  };
}

async function askSuggestionsGemini(context) {
  let attempt = 0;
  let lastText = null;
  while (attempt < 2) {
    const strictContext = {
      ...context,
      attempt,
      strictMode: attempt > 0
    };
    const instructions =
      "You are an expert recruitment assistant. Respond ONLY with valid JSON that matches the requested structure.";
    const payload = buildSuggestionInstructions(strictContext);

    const { text, json, metadata } = await callGemini({
      model: suggestionModel,
      contents: [
        {
          role: "user",
          parts: [{ text: `${instructions}\n\n${payload}` }]
        }
      ],
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      expectJson: true
    });

    if (text) {
      logSuggestionPreview("gemini", text);
      lastText = text;
    }

    const parsed =
      json && typeof json === "object"
        ? json
        : text
        ? parseJsonContent(text)
        : null;

    if (parsed && typeof parsed === "object") {
      const candidates = normaliseCandidates(
        parsed.autofill_candidates ?? parsed.autofillCandidates ?? parsed.candidates ?? [],
        strictContext
      );
      const telemetry = metadata ?? {};
      return { candidates, metadata: telemetry };
    }

    attempt += 1;
  }

  return {
    error: {
      reason: "structured_missing",
      rawPreview: lastText ? lastText.slice(0, 400) : null,
      message: "LLM did not return valid autofill_candidates JSON"
    }
  };
}

async function askChatOpenAI({ userMessage, draftState, intent }) {
  const systemPrompt = "You are Wizard's recruiting copilot. Reply succinctly with actionable guidance.";
  const content = await callOpenAI({
    model: chatModel,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify(
          {
            userMessage,
            draftState,
            intent
          },
          null,
          2
        )
      }
    ],
    temperature: 0.4,
    maxTokens: 400
  });
  return content.trim();
}

async function askChatGemini({ userMessage, draftState, intent }) {
  const systemPrompt = "You are Wizard's recruiting copilot. Reply succinctly with actionable guidance.";
  const payload = JSON.stringify(
    {
      userMessage,
      draftState,
      intent
    },
    null,
    2
  );

  const content = await callGemini({
    model: chatModel,
    contents: [
      {
        role: "user",
        parts: [{ text: `${systemPrompt}\n\n${payload}` }]
      }
    ],
    temperature: 0.4,
    maxOutputTokens: 8192
  });

  return content.trim();
}

async function askSuggestions(context) {
  try {
    const raw =
      suggestionProvider === "gemini"
        ? await askSuggestionsGemini(context)
        : await askSuggestionsOpenAI(context);
    if (!raw) {
      return null;
    }

    if (raw.error) {
      return {
        error: {
          ...raw.error,
          provider: suggestionProvider,
          model: suggestionModel
        }
      };
    }

    if (Array.isArray(raw.candidates)) {
      return {
        provider: suggestionProvider,
        model: suggestionModel,
        candidates: raw.candidates,
        metadata: raw.metadata ?? null
      };
    }

    return null;
  } catch (error) {
    logger.warn({ err: error, provider: suggestionProvider }, "askSuggestions failed");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error),
        provider: suggestionProvider,
        model: suggestionModel
      }
    };
  }
}

async function askChat({ userMessage, draftState, intent }) {
  try {
    if (chatProvider === "gemini") {
      return await askChatGemini({ userMessage, draftState, intent });
    }
    return await askChatOpenAI({ userMessage, draftState, intent });
  } catch (error) {
    logger.warn({ err: error, provider: chatProvider }, "askChat failed");
    const title = draftState?.title ? ` about ${draftState.title}` : "";
    const location = draftState?.location ? ` in ${draftState.location}` : "";
    return `Understood. I'll take that into account${title}${location ? ` ${location}` : ""}.`;
  }
}

export const llmClient = {
  askChat,
  askSuggestions
};
