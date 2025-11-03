import { createLogger } from "@wizard/utils";

const logger = createLogger("llm-client");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? process.env.LLM_CHAT_API_KEY ?? null;
const OPENAI_API_URL = process.env.OPENAI_API_URL ?? "https://api.openai.com/v1/chat/completions";
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? process.env.LLM_CHAT_MODEL ?? "gpt-4o-mini";
const OPENAI_SUGGEST_MODEL =
  process.env.OPENAI_SUGGEST_MODEL ??
  process.env.LLM_SUGGESTION_MODEL ??
  process.env.OPENAI_CHAT_MODEL ??
  "gpt-4o-mini";

function ensureApiKey() {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }
}

async function callOpenAI({ messages, model, temperature = 0.2, maxTokens = 800 }) {
  ensureApiKey();

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" }
    })
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
    logger.warn({ error, preview: jsonText.slice(0, 200) }, "Failed to parse LLM JSON");
    return null;
  }
}

async function askSuggestions(context) {
  try {
    const systemPrompt =
      "You are Wizard's recruiting copilot. Respond ONLY with valid JSON that matches the required schema.";
    const userPrompt = {
      role: "user",
      content: JSON.stringify(
        {
          instructions: [
            "Return an object with keys: improved_value, autofill_candidates, irrelevant_fields, next_step_teaser, followUpToUser.",
            "improved_value should be null or an object with { fieldId, value, rationale, confidence (0-1), source, mode } describing a polished rewrite of the field the user just edited.",
            "autofill_candidates should be an array of objects with { fieldId, value, rationale, confidence (0-1), source } for other fields you can prefill now or on upcoming screens.",
            "irrelevant_fields should be an array of objects with { fieldId, reason } for questions that no longer apply and should be hidden.",
            "next_step_teaser must be a short string that previews what the user will see next and why it helps them.",
            "followUpToUser should be an array (0-3 items) acknowledging what was autofilled or hidden, written as supportive coaching.",
            "All fieldId values must match the nested schema paths provided in context.state."
          ],
          context
        },
        null,
        2
      )
    };

    const content = await callOpenAI({
      model: OPENAI_SUGGEST_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        userPrompt
      ],
      temperature: 0.1,
      maxTokens: 600
    });

    const parsed = parseJsonContent(content);
    if (parsed && typeof parsed === "object") {
      return {
        improved_value: parsed.improved_value ?? parsed.improvedValue ?? null,
        autofill_candidates: Array.isArray(parsed.autofill_candidates ?? parsed.autofillCandidates)
          ? parsed.autofill_candidates ?? parsed.autofillCandidates
          : [],
        irrelevant_fields: Array.isArray(parsed.irrelevant_fields ?? parsed.irrelevantFields)
          ? parsed.irrelevant_fields ?? parsed.irrelevantFields
          : [],
        next_step_teaser:
          typeof parsed.next_step_teaser === "string"
            ? parsed.next_step_teaser
            : typeof parsed.nextStepTeaser === "string"
            ? parsed.nextStepTeaser
            : "",
        followUpToUser: Array.isArray(parsed.followUpToUser ?? parsed.follow_up_to_user)
          ? parsed.followUpToUser ?? parsed.follow_up_to_user
          : []
      };
    }
    throw new Error("Structured suggestions missing");
  } catch (error) {
    logger.warn({ error, context }, "askSuggestions fell back to heuristic");
    return null;
  }
}

async function askChat({ userMessage, draftState, intent }) {
  try {
    const systemPrompt =
      "You are Wizard's recruiting copilot. Reply succinctly with actionable guidance.";
    const content = await callOpenAI({
      model: OPENAI_CHAT_MODEL,
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
  } catch (error) {
    logger.warn({ error }, "askChat fell back to canned response");
    const title = draftState?.title ? ` about ${draftState.title}` : "";
    const location = draftState?.location ? ` in ${draftState.location}` : "";
    return `Understood. I'll take that into account${title}${location ? ` ${location}` : ""}.`;
  }
}

export const llmClient = {
  askChat,
  askSuggestions
};
