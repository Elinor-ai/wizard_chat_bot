import { llmLogger } from "../logger.js";
import { SUPPORTED_CHANNELS } from "../domain/channels.js";

export function buildChannelRecommendationInstructions(context = {}) {
  const {
    jobSnapshot = {},
    confirmed = {},
    supportedChannels = SUPPORTED_CHANNELS,
  } = context;

  const hiringContext = {
    roleTitle: confirmed.roleTitle ?? jobSnapshot.roleTitle ?? null,
    companyName: confirmed.companyName ?? jobSnapshot.companyName ?? null,
    location: confirmed.location ?? jobSnapshot.location ?? null,
    workModel: confirmed.workModel ?? jobSnapshot.workModel ?? null,
    industry: confirmed.industry ?? jobSnapshot.industry ?? null,
    seniorityLevel:
      confirmed.seniorityLevel ?? jobSnapshot.seniorityLevel ?? null,
    employmentType:
      confirmed.employmentType ?? jobSnapshot.employmentType ?? null,
    coreDuties: confirmed.coreDuties ?? jobSnapshot.coreDuties ?? [],
    mustHaves: confirmed.mustHaves ?? jobSnapshot.mustHaves ?? [],
    benefits: confirmed.benefits ?? jobSnapshot.benefits ?? [],
    salary: confirmed.salary ?? jobSnapshot.salary ?? null,
    salaryPeriod: confirmed.salaryPeriod ?? jobSnapshot.salaryPeriod ?? null,
    currency: confirmed.currency ?? jobSnapshot.currency ?? null,
    jobDescription:
      confirmed.jobDescription ?? jobSnapshot.jobDescription ?? null,
    existingCampaignChannels: Array.isArray(context.existingChannels)
      ? context.existingChannels
      : [],
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
      "Return strictly valid JSON matching the responseContract schema.",
    ],
    supportedChannels,
    responseContract: {
      recommendations: [
        {
          channel: "one of supportedChannels exactly",
          reason: "string rationale describing why the channel is a good fit",
          expectedCPA: "number (optional, USD cost per application)",
        },
      ],
    },
    exampleResponse: {
      recommendations: [
        {
          channel: "linkedin",
          reason:
            "Strong for senior B2B roles where experienced talent actively searches.",
          expectedCPA: 55,
        },
        {
          channel: "reddit",
          reason:
            "Reach niche engineering communities discussing Golang and distributed systems.",
          expectedCPA: 32,
        },
      ],
    },
    hiringContext,
    companyContext: context.companyContext ?? null
  };

  const payload = JSON.stringify(payloadObject, null, 2);
  llmLogger.info(
    { task: "channels", content: payload, length: payload.length },
    "LLM channel recommendation prompt"
  );

  return payload;
}
