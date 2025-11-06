import { Buffer } from "node:buffer";
import { CampaignSchema } from "@wizard/core";
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
const DEFAULT_GEMINI_SUGGEST_MODEL =
  process.env.GEMINI_SUGGEST_MODEL ?? "gemini-flash-latest";
const DEFAULT_GEMINI_CHAT_MODEL =
  process.env.GEMINI_CHAT_MODEL ?? "gemini-flash-latest";
const DEFAULT_OPENAI_REFINE_MODEL =
  process.env.OPENAI_REFINE_MODEL ??
  process.env.LLM_REFINE_MODEL ??
  DEFAULT_OPENAI_CHAT_MODEL;
const DEFAULT_GEMINI_REFINE_MODEL =
  process.env.GEMINI_REFINE_MODEL ??
  DEFAULT_GEMINI_CHAT_MODEL;

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

function logChannelPreview(provider, rawContent) {
  if (typeof rawContent !== "string") return;
  const trimmed = rawContent.trim();
  logger.info(
    {
      provider,
      content: trimmed,
      length: trimmed.length
    },
    "LLM channel recommendation raw response"
  );
}

function logRefinementPreview(provider, rawContent) {
  if (typeof rawContent !== "string") return;
  const trimmed = rawContent.trim();
  logger.info(
    {
      provider,
      content: trimmed,
      length: trimmed.length
    },
    "LLM job refinement raw response"
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

const refineSpec =
  process.env.LLM_REFINE_PROVIDER ?? `openai:${DEFAULT_OPENAI_REFINE_MODEL}`;
const refineResolved = parseProviderSpec(refineSpec, {
  defaultProvider: "openai",
  defaultModel: DEFAULT_OPENAI_REFINE_MODEL
});
const refineProvider = refineResolved.provider;
const refineModel =
  refineProvider === "gemini"
    ? refineResolved.modelProvided
      ? refineResolved.model
      : DEFAULT_GEMINI_REFINE_MODEL
    : refineResolved.modelProvided
    ? refineResolved.model
    : DEFAULT_OPENAI_REFINE_MODEL;

logger.info(
  { refineProvider, refineModel },
  "LLM refinement provider configured"
);

const DEFAULT_OPENAI_CHANNEL_MODEL =
  process.env.OPENAI_CHANNEL_MODEL ??
  process.env.LLM_CHANNEL_MODEL ??
  DEFAULT_OPENAI_CHAT_MODEL;
const DEFAULT_GEMINI_CHANNEL_MODEL =
  process.env.GEMINI_CHANNEL_MODEL ?? "gemini-flash-latest";

const channelSpec =
  process.env.LLM_CHANNEL_PROVIDER ?? `openai:${DEFAULT_OPENAI_CHANNEL_MODEL}`;
const channelResolved = parseProviderSpec(channelSpec, {
  defaultProvider: "openai",
  defaultModel: DEFAULT_OPENAI_CHANNEL_MODEL
});
const channelProvider = channelResolved.provider;
const channelModel =
  channelProvider === "gemini"
    ? channelResolved.modelProvided
      ? channelResolved.model
      : DEFAULT_GEMINI_CHANNEL_MODEL
    : channelResolved.modelProvided
    ? channelResolved.model
    : DEFAULT_OPENAI_CHANNEL_MODEL;

logger.info(
  { channelProvider, channelModel },
  "LLM channel recommendation provider configured"
);

function canonicalizeChannel(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim().toLowerCase();
  return normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const SUPPORTED_CHANNELS = CampaignSchema.shape.channel.options;
const SUPPORTED_CHANNEL_MAP = SUPPORTED_CHANNELS.reduce((acc, channel) => {
  acc[canonicalizeChannel(channel)] = channel;
  return acc;
}, {});

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

function buildRefinementInstructions(context) {
  const jobDraft = context?.jobSnapshot ?? {};
  const payloadObject = {
    role: "You are a senior hiring editor polishing job descriptions for public launch.",
    mission:
      "Review the employer-provided job details, correct grammar or formatting issues, expand thin areas with authentic content, and ensure every field feels candidate ready.",
    guardrails: [
      "Respect the employer's intent. Only enhance—never invent new benefits, responsibilities, or compensation claims that contradict the draft.",
      "Keep salary information if provided; do not fabricate numbers when absent.",
      "Preserve arrays (duties, benefits, must-haves) as lists. Remove duplicates and tidy the language.",
      "Return strictly valid JSON that matches the responseContract schema without commentary.",
      "Include a concise summary describing key improvements you made."
    ],
    jobSchema: JOB_FIELD_GUIDE,
    requiredFields: JOB_REQUIRED_FIELDS,
    jobDraft,
    responseContract: {
      refined_job: {
        roleTitle: "string",
        companyName: "string",
        location: "string",
        zipCode: "string | null",
        industry: "string | null",
        seniorityLevel: "string",
        employmentType: "string",
        workModel: "string | null",
        jobDescription: "string",
        coreDuties: "string[]",
        mustHaves: "string[]",
        benefits: "string[]",
        salary: "string | null",
        salaryPeriod: "string | null",
        currency: "string | null"
      },
      summary: "string"
    },
    exampleResponse: {
      refined_job: {
        roleTitle: "Senior Backend Engineer",
        companyName: "Botson Labs",
        location: "Tel Aviv, Israel",
        jobDescription:
          "Lead a squad building AI-enhanced hiring workflows. Mentor engineers, ship reliable APIs, and collaborate with product and research partners.",
        coreDuties: [
          "Design, implement, and maintain distributed services handling millions of events per day.",
          "Partner with product managers to translate candidate experience goals into technical roadmaps.",
          "Coach teammates through thoughtful code reviews and architecture discussions."
        ],
        mustHaves: [
          "5+ years building production services in Node.js or Go.",
          "Experience with cloud infrastructure (GCP or AWS) and modern observability stacks.",
          "Track record leading projects with cross-functional stakeholders."
        ],
        benefits: [
          "Stock options with annual refreshers.",
          "Hybrid work model with two in-office collaboration days.",
          "Learning stipend for conferences or certifications."
        ],
        salary: "$150,000 – $180,000",
        salaryPeriod: "per year",
        currency: "USD"
      },
      summary:
        "Clarified duties, tightened qualifications, and expanded benefits for a compelling candidate pitch."
    }
  };

  const payload = JSON.stringify(payloadObject, null, 2);

  logger.info(
    {
      provider: refineProvider,
      content: payload,
      length: payload.length
    },
    "LLM refinement prompt"
  );

  return payload;
}

function normaliseRefinedJob(refinedJob, baseJob = {}) {
  const result = {};
  JOB_FIELD_IDS.forEach((fieldId) => {
    const candidate = refinedJob?.[fieldId];
    let value = candidate;

    if (value === undefined || value === null || value === "") {
      value = baseJob?.[fieldId];
    }

    if (Array.isArray(value)) {
      const cleaned = value
        .map((item) =>
          typeof item === "string" ? item.trim() : item
        )
        .filter((item) => {
          if (item === undefined || item === null) return false;
          if (typeof item === "string") {
            return item.trim().length > 0;
          }
          return true;
        })
        .map((item) => (typeof item === "string" ? item.trim() : item));
      if (cleaned.length > 0) {
        result[fieldId] = cleaned;
      }
      return;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        result[fieldId] = trimmed;
      }
      return;
    }

    if (value !== undefined && value !== null) {
      result[fieldId] = value;
    }
  });

  return result;
}

function buildChannelRecommendationInstructions(context) {
  const { jobSnapshot = {}, confirmed = {}, supportedChannels = [] } = context;
  const hiringContext = {
    roleTitle: confirmed.roleTitle ?? jobSnapshot.roleTitle ?? null,
    companyName: confirmed.companyName ?? jobSnapshot.companyName ?? null,
    location: confirmed.location ?? jobSnapshot.location ?? null,
    workModel: confirmed.workModel ?? jobSnapshot.workModel ?? null,
    industry: confirmed.industry ?? jobSnapshot.industry ?? null,
    seniorityLevel: confirmed.seniorityLevel ?? jobSnapshot.seniorityLevel ?? null,
    employmentType: confirmed.employmentType ?? jobSnapshot.employmentType ?? null,
    coreDuties: confirmed.coreDuties ?? jobSnapshot.coreDuties ?? [],
    mustHaves: confirmed.mustHaves ?? jobSnapshot.mustHaves ?? [],
    benefits: confirmed.benefits ?? jobSnapshot.benefits ?? [],
    salary: confirmed.salary ?? jobSnapshot.salary ?? null,
    salaryPeriod: confirmed.salaryPeriod ?? jobSnapshot.salaryPeriod ?? null,
    currency: confirmed.currency ?? jobSnapshot.currency ?? null,
    jobDescription: confirmed.jobDescription ?? jobSnapshot.jobDescription ?? null,
    existingCampaignChannels: Array.isArray(context.existingChannels)
      ? context.existingChannels
      : []
  };

  const payloadObject = {
    role: "You are a recruitment marketing strategist who plans paid and organic launch channels.",
    mission:
      "Evaluate the confirmed job brief and recommend the best advertising and community channels from the supported list.",
    guardrails: [
      "Only choose channels from the supportedChannels list. If the best venue is not listed, omit it.",
      "Prioritise combinations that balance qualified applicant volume and cost efficiency.",
      "Explain the rationale for each recommendation in one succinct sentence.",
      "If you estimate expectedCPA, provide a positive number representing cost per application in USD; omit the field otherwise.",
      "Return strictly valid JSON matching the responseContract schema."
    ],
    supportedChannels,
    responseContract: {
      recommendations: [
        {
          channel: "one of supportedChannels exactly",
          reason: "string rationale describing why the channel is a good fit",
          expectedCPA: "number (optional, USD cost per application)"
        }
      ]
    },
    exampleResponse: {
      recommendations: [
        {
          channel: "linkedin",
          reason: "Strong for senior B2B roles where experienced talent actively searches.",
          expectedCPA: 55
        },
        {
          channel: "reddit",
          reason: "Reach niche engineering communities discussing Golang and distributed systems.",
          expectedCPA: 32
        }
      ]
    },
    hiringContext
  };

  const payload = JSON.stringify(payloadObject, null, 2);

  logger.info(
    {
      provider: channelProvider,
      content: payload,
      length: payload.length
    },
    "LLM channel recommendation prompt"
  );

  return payload;
}

function normaliseChannelRecommendations(recommendations = [], supportedMap = SUPPORTED_CHANNEL_MAP) {
  if (!Array.isArray(recommendations)) {
    return [];
  }
  const seen = new Set();
  const result = [];

  recommendations.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const canonical = canonicalizeChannel(entry.channel);
    const supported = supportedMap[canonical];
    if (!supported || seen.has(supported)) {
      return;
    }
    const reason =
      typeof entry.reason === "string" ? entry.reason.trim() : "";
    if (!reason) {
      return;
    }

    let expectedCPA;
    if (entry.expectedCPA !== undefined && entry.expectedCPA !== null) {
      const numeric = Number(entry.expectedCPA);
      if (!Number.isNaN(numeric) && numeric >= 0) {
        expectedCPA = numeric;
      }
    }

    result.push({
      channel: supported,
      reason,
      expectedCPA
    });
    seen.add(supported);
  });

  return result;
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

async function askRefineJobOpenAI(context) {
  const systemPrompt =
    "You are a senior hiring editor. Respond ONLY with valid JSON that matches the requested structure.";
  const userPrompt = {
    role: "user",
    content: buildRefinementInstructions(context)
  };

  const content = await callOpenAI({
    model: refineModel,
    messages: [
      { role: "system", content: systemPrompt },
      userPrompt
    ],
    temperature: 0.15,
    maxTokens: 900,
    responseFormat: { type: "json_object" }
  });

  logRefinementPreview("openai", content);

  const parsed = parseJsonContent(content);
  if (parsed && typeof parsed === "object") {
    const refinedJob = normaliseRefinedJob(
      parsed.refined_job ?? parsed.refinedJob ?? {},
      context.jobSnapshot ?? {}
    );
    const summary =
      typeof parsed.summary === "string"
        ? parsed.summary.trim()
        : null;
    return { refinedJob, summary };
  }

  return {
    error: {
      reason: "structured_missing",
      rawPreview: content ? String(content).slice(0, 400) : null,
      message: "LLM did not return valid refinement JSON"
    }
  };
}

async function askRefineJobGemini(context) {
  let attempt = 0;
  let lastText = null;
  while (attempt < 2) {
    const strictContext = {
      ...context,
      attempt,
      strictMode: attempt > 0
    };
    const instructions =
      "You are a senior hiring editor. Respond ONLY with valid JSON that matches the requested structure.";
    const payload = buildRefinementInstructions(strictContext);

    const { text, json, metadata } = await callGemini({
      model: refineModel,
      contents: [
        {
          role: "user",
          parts: [{ text: `${instructions}\n\n${payload}` }]
        }
      ],
      temperature: 0.15,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      expectJson: true
    });

    if (text) {
      logRefinementPreview("gemini", text);
      lastText = text;
    }

    const parsed =
      json && typeof json === "object"
        ? json
        : text
        ? parseJsonContent(text)
        : null;

    if (parsed && typeof parsed === "object") {
      const refinedJob = normaliseRefinedJob(
        parsed.refined_job ?? parsed.refinedJob ?? {},
        strictContext.jobSnapshot ?? {}
      );
      const summary =
        typeof parsed.summary === "string"
          ? parsed.summary.trim()
          : null;
      const telemetry = metadata
        ? {
            promptTokens:
              metadata.promptTokenCount ?? metadata.promptTokens ?? null,
            responseTokens:
              metadata.candidatesTokenCount ?? metadata.responseTokenCount ?? null,
            totalTokens: metadata.totalTokenCount ?? null,
            finishReason: metadata.finishReason ?? null
          }
        : undefined;
      return { refinedJob, summary, metadata: telemetry };
    }

    attempt += 1;
  }

  return {
    error: {
      reason: "structured_missing",
      rawPreview: lastText ? lastText.slice(0, 400) : null,
      message: "LLM did not return valid refinement JSON"
    }
  };
}

async function askChannelRecommendationsOpenAI(context) {
  const systemPrompt =
    "You are a recruitment marketing strategist. Respond ONLY with valid JSON that matches the requested structure.";
  const userPrompt = {
    role: "user",
    content: buildChannelRecommendationInstructions(context)
  };

  const content = await callOpenAI({
    model: channelModel,
    messages: [
      { role: "system", content: systemPrompt },
      userPrompt
    ],
    temperature: 0.2,
    maxTokens: 600,
    responseFormat: { type: "json_object" }
  });

  logChannelPreview("openai", content);

  const parsed = parseJsonContent(content);
  if (parsed && typeof parsed === "object") {
    const recommendations = normaliseChannelRecommendations(
      parsed.recommendations ?? parsed.channels ?? []
    );
    return { recommendations };
  }

  return {
    error: {
      reason: "structured_missing",
      rawPreview: content ? String(content).slice(0, 400) : null,
      message: "LLM did not return valid channel recommendations JSON"
    }
  };
}

async function askChannelRecommendationsGemini(context) {
  let attempt = 0;
  let lastText = null;
  while (attempt < 2) {
    const strictContext = {
      ...context,
      attempt,
      strictMode: attempt > 0
    };
    const instructions =
      "You are a recruitment marketing strategist. Respond ONLY with valid JSON that matches the requested structure.";
    const payload = buildChannelRecommendationInstructions(strictContext);

    const { text, json, metadata } = await callGemini({
      model: channelModel,
      contents: [
        {
          role: "user",
          parts: [{ text: `${instructions}\n\n${payload}` }]
        }
      ],
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      expectJson: true
    });

    if (text) {
      logChannelPreview("gemini", text);
      lastText = text;
    }

    const parsed =
      json && typeof json === "object"
        ? json
        : text
        ? parseJsonContent(text)
        : null;

    if (parsed && typeof parsed === "object") {
      const recommendations = normaliseChannelRecommendations(
        parsed.recommendations ?? parsed.channels ?? []
      );
      const telemetry = metadata
        ? {
            promptTokens: metadata.promptTokenCount ?? metadata.promptTokens ?? null,
            responseTokens: metadata.candidatesTokenCount ?? null,
            totalTokens: metadata.totalTokenCount ?? null,
            finishReason: parsed.finishReason ?? null
          }
        : undefined;
      return { recommendations, metadata: telemetry };
    }

    attempt += 1;
  }

  return {
    error: {
      reason: "structured_missing",
      rawPreview: lastText ? lastText.slice(0, 400) : null,
      message: "LLM did not return valid channel recommendations JSON"
    }
  };
}

async function askChannelRecommendations(context) {
  try {
    const raw =
      channelProvider === "gemini"
        ? await askChannelRecommendationsGemini(context)
        : await askChannelRecommendationsOpenAI(context);

    if (!raw) {
      return null;
    }

    if (raw.error) {
      return {
        error: {
          ...raw.error,
          provider: channelProvider,
          model: channelModel
        }
      };
    }

    if (Array.isArray(raw.recommendations)) {
      const recommendations = normaliseChannelRecommendations(raw.recommendations);
      return {
        provider: channelProvider,
        model: channelModel,
        recommendations,
        metadata: raw.metadata ?? null
      };
    }

    return null;
  } catch (error) {
    logger.warn(
      { err: error, provider: channelProvider },
      "askChannelRecommendations failed"
    );
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error),
        provider: channelProvider,
        model: channelModel
      }
    };
  }
}

async function askRefineJob(context) {
  try {
    const raw =
      refineProvider === "gemini"
        ? await askRefineJobGemini(context)
        : await askRefineJobOpenAI(context);

    if (!raw) {
      return null;
    }

    if (raw.error) {
      return {
        error: {
          ...raw.error,
          provider: refineProvider,
          model: refineModel
        }
      };
    }

    if (raw.refinedJob) {
      return {
        provider: refineProvider,
        model: refineModel,
        refinedJob: raw.refinedJob,
        summary: raw.summary ?? null,
        metadata: raw.metadata ?? null
      };
    }

    return null;
  } catch (error) {
    logger.warn({ err: error, provider: refineProvider }, "askRefineJob failed");
    return {
      error: {
        reason: "exception",
        message: error?.message ?? String(error),
        provider: refineProvider,
        model: refineModel
      }
    };
  }
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
  askSuggestions,
  askChannelRecommendations,
  askRefineJob
};
