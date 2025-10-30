import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { wrapAsync, httpError } from "@wizard/utils";
import {
  JobSchema,
  JobCreationStateEnum,
  JOB_CREATION_STATES,
  LlmSuggestionBucketSchema,
  createJobCreationStateMachine,
  deriveJobStatusFromState
} from "@wizard/core";

const suggestionRequestSchema = z.object({
  jobId: z.string().optional(),
  currentStepId: z.string().optional(),
  state: z.record(z.string(), z.any()).default({}),
  intent: z
    .object({
      includeOptional: z.boolean().optional(),
      optionalCompleted: z.boolean().optional()
    })
    .default({})
});

const draftSchema = suggestionRequestSchema;

const suggestionMergeSchema = z.object({
  jobId: z.string(),
  id: z.string(),
  fieldId: z.string(),
  proposal: z.string()
});

const transitionSchema = z.object({
  jobId: z.string(),
  nextState: JobCreationStateEnum,
  reason: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const jobStateMachine = createJobCreationStateMachine();

const REQUIRED_FIELDS = ["title", "location", "employmentType", "mustHaves", "roleCategory"];
const OPTIONAL_FIELDS = ["salaryRange", "benefits", "niceToHaves", "experienceLevel", "licenses"];

function valueProvided(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return Boolean(value);
}

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLocation(value) {
  if (!value) {
    return {
      geo: null,
      city: "Remote",
      country: "US",
      radiusKm: undefined,
      workModel: "remote"
    };
  }

  if (/remote/i.test(value)) {
    return {
      geo: null,
      city: "Remote",
      country: "US",
      radiusKm: undefined,
      workModel: "remote"
    };
  }

  const [cityPart, countryPart] = value.split(",").map((item) => item.trim());
  return {
    geo: null,
    city: cityPart ?? value,
    country: (countryPart ?? "US").slice(0, 2).toUpperCase(),
    radiusKm: 10,
    workModel: "on_site"
  };
}

function buildDescription(state) {
  const mustHaveList = parseList(state.mustHaves);
  const benefitsList = parseList(state.benefits);
  const sections = [
    `We are hiring a ${state.title || "new teammate"} to join our organization.`,
    mustHaveList.length
      ? `Key requirements include ${mustHaveList
          .slice(0, 3)
          .map((item) => item.toLowerCase())
          .join(", ")}.`
      : "This role values collaborative, impact-driven builders.",
    state.location
      ? `The role is based in ${state.location}.`
      : "This is a flexible location role.",
    benefitsList.length
      ? `Benefits include ${benefitsList.join(", ")}.`
      : "We offer competitive compensation, growth opportunities, and a supportive team."
  ];

  return sections.join(" ");
}

function analyseState(state, intent, existingState = "DRAFT") {
  const requiredFlags = REQUIRED_FIELDS.map((field) => valueProvided(state[field]));
  const requiredStarted = requiredFlags.some(Boolean);
  const requiredComplete = requiredFlags.every(Boolean);

  const optionalFlags = OPTIONAL_FIELDS.map((field) => valueProvided(state[field]));
  const optionalStarted = optionalFlags.some(Boolean);
  const includeOptional =
    intent.includeOptional === undefined ? optionalStarted : intent.includeOptional;
  const optionalComplete =
    intent.optionalCompleted === undefined
      ? includeOptional && optionalFlags.every(Boolean)
      : intent.optionalCompleted;

  const path = [];
  let enrichmentTask = null;

  const stateOrder = JOB_CREATION_STATES;
  const existingIndex = stateOrder.indexOf(existingState);

  const filterPath = (sequence) => {
    if (existingIndex === -1) {
      return sequence;
    }
    return sequence.filter((state) => stateOrder.indexOf(state) > existingIndex);
  };

  if (!requiredStarted) {
    return { path, target: "DRAFT", requiredComplete: false, includeOptional, optionalComplete: false, enrichmentTask: null };
  }

  if (!requiredComplete) {
    path.push("REQUIRED_IN_PROGRESS");
    const filtered = filterPath(path);
    return { path: filtered, target: "REQUIRED_IN_PROGRESS", requiredComplete: false, includeOptional, optionalComplete: false, enrichmentTask: null };
  }

  path.push("REQUIRED_IN_PROGRESS", "REQUIRED_COMPLETE");

  if (!includeOptional) {
    path.push("ENRICHING_REQUIRED", "USER_REVIEW");
    enrichmentTask = "wizard.required.enrich";
    const filtered = filterPath(path);
    return { path: filtered, target: "USER_REVIEW", requiredComplete: true, includeOptional, optionalComplete: false, enrichmentTask };
  }

  path.push("OPTIONAL_IN_PROGRESS");
  if (!optionalComplete) {
    const filtered = filterPath(path);
    return { path: filtered, target: "OPTIONAL_IN_PROGRESS", requiredComplete: true, includeOptional, optionalComplete: false, enrichmentTask: null };
  }

  path.push("LLM_ENRICHING", "OPTIONAL_COMPLETE", "ENRICHING_OPTIONAL", "USER_REVIEW");
  enrichmentTask = "wizard.optional.enrich";
  const filtered = filterPath(path);
  return { path: filtered, target: "USER_REVIEW", requiredComplete: true, includeOptional, optionalComplete: true, enrichmentTask };
}

function applyTransitions(currentState, path) {
  const history = [];
  let pointer = currentState ?? "DRAFT";
  let previous = pointer;
  const now = new Date();

  path.forEach((state) => {
    if (pointer === state) {
      return;
    }
    jobStateMachine.assertTransition(pointer, state);
    history.push({ from: pointer, to: state, at: now });
    previous = pointer;
    pointer = state;
  });

  return { currentState: pointer, previousState: previous, history, timestamp: now };
}

function mergeSuggestions(existingSuggestions = LlmSuggestionBucketSchema.parse({}), newDraftText) {
  const parsed = LlmSuggestionBucketSchema.parse(existingSuggestions);
  if (!newDraftText) {
    return parsed;
  }
  const draftId = `draft-${Date.now()}`;
  return {
    ...parsed,
    descriptionDrafts: [
      ...parsed.descriptionDrafts,
      {
        id: draftId,
        text: newDraftText,
        promptVersion: "job-description.v1",
        model: "stub",
        score: undefined
      }
    ]
  };
}

function buildAsset(existingAsset, summary, metadata, userId, jobId, versionRef) {
  const now = new Date();
  const baseVersion = existingAsset ? existingAsset.currentVersion + 1 : 1;
  const versionPayload = {
    version: baseVersion,
    promptVersion: metadata?.options?.promptVersion ?? "job-description.v1",
    model: metadata?.options?.model ?? "stub",
    summary,
    payload: { description: summary },
    createdAt: now,
    createdBy: userId,
    tokensUsed: metadata?.tokensUsed ?? 0,
    creditsCharged: metadata?.creditsCharged ?? 0,
    suggestionIds: []
  };

  if (existingAsset) {
    return {
      asset: {
        ...existingAsset,
        status: "review",
        currentVersion: versionPayload.version,
        versions: [...existingAsset.versions, versionPayload],
        updatedAt: now,
        provenance: {
          confirmedVersionId: versionRef,
          suggestionIds: []
        }
      },
      created: false
    };
  }

  return {
    asset: {
      assetId: uuid(),
      type: "jd",
      status: "review",
      currentVersion: versionPayload.version,
      versions: [versionPayload],
      selectedForDistribution: false,
      createdAt: now,
      updatedAt: now,
      provenance: {
        confirmedVersionId: versionRef,
        suggestionIds: []
      }
    },
    created: true
  };
}

export function wizardRouter({ orchestrator, logger, firestore }) {
  const router = Router();

  router.post(
    "/suggestions",
    wrapAsync(async (req, res) => {
      const payload = suggestionRequestSchema.parse(req.body ?? {});
      const userId = req.headers["x-user-id"];
      if (!userId || typeof userId !== "string") {
        throw httpError(401, "Missing x-user-id header");
      }

      const suggestions = [];
      const stepId = payload.currentStepId;

      if ((!stepId || stepId === "compensation") && !valueProvided(payload.state.salaryRange)) {
        suggestions.push({
          id: `salary-${Date.now()}`,
          fieldId: "salaryRange",
          proposal: "$120,000 – $150,000 USD",
          confidence: 0.68,
          rationale: "Market benchmark for similar roles in the US."
        });
      }

      if ((!stepId || stepId === "compensation") && !valueProvided(payload.state.benefits)) {
        suggestions.push({
          id: `benefits-${Date.now()}`,
          fieldId: "benefits",
          proposal: "Medical, dental, vision, 401k match, learning stipend",
          confidence: 0.62,
          rationale: "Common benefits package that improves apply rate."
        });
      }

      res.json({ suggestions });
    })
  );

  router.post(
    "/draft",
    wrapAsync(async (req, res) => {
      const payload = draftSchema.parse(req.body ?? {});
      const userId = req.headers["x-user-id"];
      if (!userId || typeof userId !== "string") {
        throw httpError(401, "Missing x-user-id header");
      }

      const user = await firestore.getDocument("users", userId);
      if (!user) {
        throw httpError(404, "User not found");
      }

      const existingJob = payload.jobId
        ? await firestore.getDocument("jobs", payload.jobId)
        : null;

      const analysis = analyseState(payload.state, payload.intent, existingJob?.stateMachine?.currentState);
      const transitions = applyTransitions(existingJob?.stateMachine?.currentState ?? "DRAFT", analysis.path);

      let llmResult = null;
      if (analysis.enrichmentTask) {
        llmResult = await orchestrator.run({
          type: analysis.enrichmentTask,
          payload: { state: payload.state }
        });
      }

      const now = new Date();
      const jobId = existingJob?.id ?? uuid();
      const jobVersion = (existingJob?.versioning?.currentVersion ?? 0) + 1;
      const locationParsed = parseLocation(payload.state.location ?? existingJob?.confirmed?.location?.city);
      const summary = llmResult?.content ?? buildDescription(payload.state);
      const creditAmount = Number(llmResult?.metadata?.creditsCharged ?? 0);
      const tokensUsed = Number(llmResult?.metadata?.tokensUsed ?? 0);
      const jobStatus = deriveJobStatusFromState(transitions.currentState);
      const previousState =
        transitions.history.length > 0
          ? transitions.history[transitions.history.length - 1].from
          : existingJob?.stateMachine?.previousState ??
            existingJob?.stateMachine?.currentState ??
            "DRAFT";

      const currentAssets = existingJob?.assets ?? [];
      const jdAsset = currentAssets.find((asset) => asset.type === "jd");
      const assetVersionRef = `${jobId}-v${jobVersion}`;
      const { asset: updatedJdAsset, created } = buildAsset(
        jdAsset,
        summary,
        llmResult?.metadata,
        userId,
        jobId,
        assetVersionRef
      );
      const updatedAssets = created
        ? [...currentAssets, updatedJdAsset]
        : currentAssets.map((asset) => (asset.assetId === updatedJdAsset.assetId ? updatedJdAsset : asset));

      const baseSuggestions = existingJob?.pendingSuggestions ?? LlmSuggestionBucketSchema.parse({});
      const mergedSuggestions = mergeSuggestions(baseSuggestions, summary);

      const baseLlmMeta = existingJob?.llm ?? {
        predictions: LlmSuggestionBucketSchema.parse({}),
        lastRunAt: null,
        modelsUsed: []
      };

      const llmMeta = analysis.enrichmentTask
        ? {
            predictions: mergeSuggestions(baseLlmMeta.predictions, summary),
            lastRunAt: now,
            modelsUsed: [
              ...baseLlmMeta.modelsUsed,
              {
                task: analysis.enrichmentTask,
                provider: llmResult?.metadata?.options?.provider ?? "stub",
                model: llmResult?.metadata?.options?.model ?? "placeholder",
                tokens: llmResult?.metadata?.tokensUsed ?? 0,
                credits: llmResult?.metadata?.creditsCharged ?? 0,
                ranAt: now
              }
            ]
          }
        : baseLlmMeta;

      const jobDraft = {
        id: jobId,
        ownerUserId: existingJob?.ownerUserId ?? user.id,
        orgId: user.orgId ?? existingJob?.orgId ?? null,
        status: jobStatus,
        schemaVersion: existingJob?.schemaVersion ?? "job.v1",
        stateMachine: {
          currentState: transitions.currentState,
          previousState,
          history: [...(existingJob?.stateMachine?.history ?? []), ...transitions.history],
          requiredComplete: analysis.requiredComplete,
          optionalOffered: analysis.includeOptional
            ? Array.from(new Set([...(existingJob?.stateMachine?.optionalOffered ?? []), ...OPTIONAL_FIELDS]))
            : existingJob?.stateMachine?.optionalOffered ?? [],
          lastTransitionAt: transitions.timestamp,
          lockedByRequestId: null
        },
        confirmed: {
          ...((existingJob && existingJob.confirmed) || {}),
          title: payload.state.title || existingJob?.confirmed?.title || "Untitled role",
          roleCategory: payload.state.roleCategory || existingJob?.confirmed?.roleCategory || "general",
          location: {
            geo: locationParsed.geo,
            city: locationParsed.city,
            country: locationParsed.country,
            radiusKm: locationParsed.radiusKm
          },
          workModel: locationParsed.workModel,
          employmentType:
            payload.state.employmentType ?? existingJob?.confirmed?.employmentType ?? "full_time",
          schedule: existingJob?.confirmed?.schedule ?? [],
          salary: payload.state.salaryRange
            ? {
                currency: "USD",
                min: Number(
                  String(payload.state.salaryRange)
                    .replace(/[^0-9\-–]/g, "")
                    .split(/-|–/)[0]
                ) || null,
                max: Number(
                  String(payload.state.salaryRange)
                    .replace(/[^0-9\-–]/g, "")
                    .split(/-|–/)[1]
                ) || null,
                period: "year",
                overtime: false
              }
            : existingJob?.confirmed?.salary ?? null,
          description: summary,
          requirements: {
            mustHave:
              parseList(payload.state.mustHaves).length > 0
                ? parseList(payload.state.mustHaves)
                : existingJob?.confirmed?.requirements?.mustHave ?? [],
            niceToHave:
              parseList(payload.state.niceToHaves).length > 0
                ? parseList(payload.state.niceToHaves)
                : existingJob?.confirmed?.requirements?.niceToHave ?? []
          },
          benefits:
            parseList(payload.state.benefits).length > 0
              ? parseList(payload.state.benefits)
              : existingJob?.confirmed?.benefits ?? [],
          experienceLevel: payload.state.experienceLevel ?? existingJob?.confirmed?.experienceLevel ?? null,
          licenses: parseList(payload.state.licenses).length
            ? parseList(payload.state.licenses)
            : existingJob?.confirmed?.licenses ?? [],
          language: existingJob?.confirmed?.language ?? "en-US",
          industry: existingJob?.confirmed?.industry ?? "",
          applyMethod: existingJob?.confirmed?.applyMethod ?? "internal_form",
          applicationFormId: existingJob?.confirmed?.applicationFormId ?? null,
          externalApplyUrl: existingJob?.confirmed?.externalApplyUrl ?? null,
          brand: existingJob?.confirmed?.brand ?? null,
          notesCompliance: existingJob?.confirmed?.notesCompliance ?? ""
        },
        pendingSuggestions: mergedSuggestions,
        llm: llmMeta,
        approvals: existingJob?.approvals ?? {
          fieldsApproved: [],
          approvedBy: null,
          approvedAt: null
        },
        assets: updatedAssets,
        campaigns: existingJob?.campaigns ?? [],
        screening: existingJob?.screening ?? {
          knockoutQuestions: [],
          assessments: [],
          scorecard: {}
        },
        metrics: existingJob?.metrics ?? {
          impressions: 0,
          clicks: 0,
          applies: 0,
          qualifiedApplies: 0,
          interviews: 0,
          offers: 0,
          hires: 0,
          byChannel: {}
        },
        credits: (() => {
          const existingCredits = existingJob?.credits ?? {
            reserved: 0,
            reservations: [],
            charges: [],
            pricingVersion: "v1",
            policy: { reserveOn: ["wizard"], chargeOnSuccess: ["asset_gen"] },
            tokenToCreditRatio: Number(process.env.CREDIT_PER_1000_TOKENS ?? 10)
          };

          if (creditAmount <= 0 || !analysis.enrichmentTask) {
            return existingCredits;
          }

          const reservationId = uuid();
          const ledgerId = uuid();
          const defaultPolicy =
            Object.keys(existingCredits.policy ?? {}).length > 0
              ? existingCredits.policy
              : { reserveOn: ["wizard"], chargeOnSuccess: ["asset_gen"] };

          return {
            ...existingCredits,
            reserved: existingCredits.reserved ?? 0,
            reservations: [
              ...existingCredits.reservations,
              {
                reservationId,
                amount: creditAmount,
                reason: analysis.enrichmentTask,
                at: now,
                status: "released",
                releasedAt: now
              }
            ],
            charges: [
              ...existingCredits.charges,
              {
                ledgerId,
                amount: creditAmount,
                reason: analysis.enrichmentTask,
                at: now
              }
            ],
            pricingVersion: existingCredits.pricingVersion ?? "v1",
            policy: defaultPolicy,
            tokenToCreditRatio:
              existingCredits.tokenToCreditRatio ??
              Number(process.env.CREDIT_PER_1000_TOKENS ?? 10)
          };
        })(),
        publishing: existingJob?.publishing ?? {
          selectedChannels: [],
          scheduleAt: null,
          budgetTotal: 0,
          goal: "qualified_apply"
        },
        attribution: existingJob?.attribution ?? {
          utm: {},
          audiences: [],
          personas: []
        },
        shortCircuitFlow: existingJob?.shortCircuitFlow ?? null,
        versioning: {
          currentVersion: jobVersion,
          previousVersionId: existingJob?.versioning?.previousVersionId ?? null
        },
        createdAt: existingJob?.createdAt ?? now,
        updatedAt: now,
        archivedAt: existingJob?.archivedAt ?? null
      };

      const parsedJob = JobSchema.parse(jobDraft);

      await firestore.saveDocument("jobs", parsedJob.id, parsedJob);
      await firestore.createSnapshot("jobs", parsedJob.id, {
        version: jobVersion,
        job: parsedJob,
        createdAt: now
      });

      const userCredits = user.credits ?? {
        balance: 0,
        reserved: 0,
        lifetimeUsed: 0,
        pricingVersion: "v1"
      };

      let updatedCredits = { ...userCredits, pricingVersion: userCredits.pricingVersion ?? "v1" };
      if (creditAmount > 0 && analysis.enrichmentTask) {
        const outstandingReserved = Math.max(0, (userCredits.reserved ?? 0) - creditAmount);
        updatedCredits = {
          ...updatedCredits,
          balance: Math.max(0, (userCredits.balance ?? 0) - creditAmount),
          reserved: outstandingReserved,
          lifetimeUsed: (userCredits.lifetimeUsed ?? 0) + creditAmount
        };
      }

      await firestore.saveDocument("users", userId, {
        credits: updatedCredits,
        usage: {
          ...(user.usage ?? {}),
          jobsCreated: (user.usage?.jobsCreated ?? 0) + (existingJob ? 0 : 1),
          assetsGenerated: (user.usage?.assetsGenerated ?? 0) + (created ? 1 : 0),
          tokensMonth: (user.usage?.tokensMonth ?? 0) + tokensUsed,
          lastActiveAt: now
        },
        updatedAt: now
      });

      logger.info(
        { jobId: parsedJob.id, userId, state: parsedJob.stateMachine.currentState, status: parsedJob.status },
        "Persisted wizard draft"
      );

      res.json({ draftId: parsedJob.id, status: "SAVED", state: parsedJob.stateMachine.currentState });
    })
  );

  router.post(
    "/confirm",
    wrapAsync(async (req, res) => {
      const payload = suggestionMergeSchema.parse(req.body ?? {});
      const userId = req.headers["x-user-id"];
      if (!userId || typeof userId !== "string") {
        throw httpError(401, "Missing x-user-id header");
      }

      const job = await firestore.getDocument("jobs", payload.jobId);
      if (!job) {
        throw httpError(404, "Job not found");
      }

      const updatedJob = {
        ...job,
        confirmed: {
          ...job.confirmed,
          [payload.fieldId]: payload.proposal
        },
        approvals: {
          ...(job.approvals ?? {}),
          fieldsApproved: [
            ...(job.approvals?.fieldsApproved ?? []),
            payload.fieldId
          ],
          approvedBy: userId,
          approvedAt: new Date()
        },
        updatedAt: new Date()
      };

      const parsed = JobSchema.parse(updatedJob);
      await firestore.saveDocument("jobs", parsed.id, parsed);
      logger.info({ jobId: parsed.id, field: payload.fieldId }, "Suggestion merged into job");

      res.json({ status: "QUEUED", suggestionId: payload.id });
    })
  );

  router.post(
    "/transition",
    wrapAsync(async (req, res) => {
      const payload = transitionSchema.parse(req.body ?? {});
      const userId = req.headers["x-user-id"];
      if (!userId || typeof userId !== "string") {
        throw httpError(401, "Missing x-user-id header");
      }

      const job = await firestore.getDocument("jobs", payload.jobId);
      if (!job) {
        throw httpError(404, "Job not found");
      }

      const currentState = job.stateMachine?.currentState ?? "DRAFT";
      jobStateMachine.assertTransition(currentState, payload.nextState);

      const now = new Date();
      const historyEntry = {
        from: currentState,
        to: payload.nextState,
        at: now,
        reason: payload.reason
      };

      let orchestrationResult = null;
      if (payload.nextState === "DISTRIBUTION_RECOMMENDATION_LLM") {
        orchestrationResult = await orchestrator.run({
          type: "wizard.channel.recommend",
          payload: {
            confirmed: job.confirmed,
            draftId: job.id
          }
        });
      }

      const recommendations =
        payload.nextState === "DISTRIBUTION_RECOMMENDATION_LLM"
          ? Array.isArray(orchestrationResult?.content?.recommendations)
            ? orchestrationResult.content.recommendations
            : [
                {
                  channel: "linkedin",
                  reason: "Reach experienced professionals using existing job summary data.",
                  expectedCPA: 42
                },
                {
                  channel: "tiktok",
                  reason: "High reach for entry to mid-level roles with strong creative assets.",
                  expectedCPA: 35
                }
              ]
          : job.pendingSuggestions?.channelRecommendations ?? [];

      const creditAmount = Number(orchestrationResult?.metadata?.creditsCharged ?? 0);
      const tokensUsed = Number(orchestrationResult?.metadata?.tokensUsed ?? 0);

      const existingCredits = job.credits ?? {
        reserved: 0,
        reservations: [],
        charges: [],
        pricingVersion: "v1",
        policy: { reserveOn: ["wizard"], chargeOnSuccess: ["asset_gen"] },
        tokenToCreditRatio: Number(process.env.CREDIT_PER_1000_TOKENS ?? 10)
      };

      let nextCredits = existingCredits;
      if (creditAmount > 0 && orchestrationResult) {
        const reservationId = uuid();
        const ledgerId = uuid();
        nextCredits = {
          ...existingCredits,
          reserved: existingCredits.reserved ?? 0,
          reservations: [
            ...existingCredits.reservations,
            {
              reservationId,
              amount: creditAmount,
              reason: "wizard.channel.recommend",
              at: now,
              status: "released",
              releasedAt: now
            }
          ],
          charges: [
            ...existingCredits.charges,
            {
              ledgerId,
              amount: creditAmount,
              reason: "wizard.channel.recommend",
              at: now
            }
          ],
          pricingVersion: existingCredits.pricingVersion ?? "v1",
          policy:
            Object.keys(existingCredits.policy ?? {}).length > 0
              ? existingCredits.policy
              : { reserveOn: ["wizard"], chargeOnSuccess: ["asset_gen"] },
          tokenToCreditRatio:
            existingCredits.tokenToCreditRatio ??
            Number(process.env.CREDIT_PER_1000_TOKENS ?? 10)
        };
      }

      const versionNumber = (job.versioning?.currentVersion ?? 0) + 1;
      const pendingSuggestions = LlmSuggestionBucketSchema.parse(
        job.pendingSuggestions ?? {}
      );
      const llmMeta = job.llm ?? {
        predictions: LlmSuggestionBucketSchema.parse({}),
        lastRunAt: null,
        modelsUsed: []
      };

      const updatedJob = JobSchema.parse({
        ...job,
        status: deriveJobStatusFromState(payload.nextState),
        stateMachine: {
          ...job.stateMachine,
          currentState: payload.nextState,
          previousState: currentState,
          history: [...(job.stateMachine?.history ?? []), historyEntry],
          lastTransitionAt: now
        },
        pendingSuggestions: {
          ...pendingSuggestions,
          channelRecommendations: recommendations
        },
        llm:
          payload.nextState === "DISTRIBUTION_RECOMMENDATION_LLM"
            ? {
                predictions: {
                  ...(llmMeta.predictions ?? LlmSuggestionBucketSchema.parse({})),
                  channelRecommendations: recommendations
                },
                lastRunAt: now,
                modelsUsed: [
                  ...(llmMeta.modelsUsed ?? []),
                  {
                    task: "wizard.channel.recommend",
                    provider: orchestrationResult?.metadata?.options?.provider ?? "stub",
                    model: orchestrationResult?.metadata?.options?.model ?? "placeholder",
                    tokens: tokensUsed,
                    credits: creditAmount,
                    ranAt: now
                  }
                ]
              }
            : llmMeta,
        approvals:
          payload.nextState === "APPROVED"
            ? {
                ...(job.approvals ?? {}),
                approvedBy: userId,
                approvedAt: now,
                fieldsApproved: Array.from(
                  new Set([...(job.approvals?.fieldsApproved ?? []), "job_description"])
                )
              }
            : job.approvals ?? {
                fieldsApproved: [],
                approvedBy: null,
                approvedAt: null
              },
        credits: nextCredits,
        versioning: {
          currentVersion: versionNumber,
          previousVersionId: job.versioning?.currentVersion
            ? String(job.versioning.currentVersion)
            : job.versioning?.previousVersionId ?? null
        },
        updatedAt: now
      });

      await firestore.saveDocument("jobs", updatedJob.id, updatedJob);
      await firestore.createSnapshot("jobs", updatedJob.id, {
        version: versionNumber,
        job: updatedJob,
        createdAt: now,
        reason: `transition:${payload.nextState}`
      });

      if (creditAmount > 0 && orchestrationResult) {
        const ownerId = job.ownerUserId ?? userId;
        const owner = await firestore.getDocument("users", ownerId);
        if (owner) {
          const ownerCredits = owner.credits ?? {
            balance: 0,
            reserved: 0,
            lifetimeUsed: 0,
            pricingVersion: "v1",
            tokenToCreditRatio: Number(process.env.CREDIT_PER_1000_TOKENS ?? 10)
          };
          await firestore.saveDocument("users", ownerId, {
            credits: {
              ...ownerCredits,
              balance: Math.max(0, (ownerCredits.balance ?? 0) - creditAmount),
              reserved: ownerCredits.reserved ?? 0,
              lifetimeUsed: (ownerCredits.lifetimeUsed ?? 0) + creditAmount,
              pricingVersion: ownerCredits.pricingVersion ?? "v1"
            },
            usage: {
              ...(owner.usage ?? {}),
              tokensMonth: (owner.usage?.tokensMonth ?? 0) + tokensUsed,
              lastActiveAt: now
            },
            updatedAt: now
          });
        }
      }

      logger.info(
        {
          jobId: payload.jobId,
          from: currentState,
          to: payload.nextState,
          orchestrated: Boolean(orchestrationResult)
        },
        "Job state transitioned"
      );

      res.json({
        jobId: updatedJob.id,
        currentState: updatedJob.stateMachine.currentState,
        status: updatedJob.status
      });
    })
  );

  return router;
}
