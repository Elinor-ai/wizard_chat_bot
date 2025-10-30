import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { wrapAsync, httpError } from "@wizard/utils";
import { JobSchema } from "@wizard/core";

const suggestionRequestSchema = z.object({
  jobId: z.string().optional(),
  state: z.record(z.string(), z.any()).default({})
});

const draftSchema = z.object({
  jobId: z.string().optional(),
  state: z.record(z.string(), z.any()).default({})
});

const suggestionMergeSchema = z.object({
  jobId: z.string(),
  id: z.string(),
  fieldId: z.string(),
  proposal: z.string()
});

function parseList(value) {
  if (!value) return [];
  return value
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

function generateAssetFromState(state) {
  const now = new Date();
  return {
    assetId: uuid(),
    type: "jd",
    status: "ok",
    promptVersion: "job-description.v1",
    model: "copilot-baseline",
    createdAt: now,
    updatedAt: now,
    summary: buildDescription(state)
  };
}

function buildJobDocument({ state, user, existingJob }) {
  const now = new Date();
  const locationParsed = parseLocation(state.location);
  const jobId = existingJob?.id ?? uuid();
  const existingVersion = existingJob?.versioning?.currentVersion ?? 0;

  const jobDraft = {
    id: jobId,
    ownerUserId: user.id,
    orgId: user.orgId ?? null,
    status: "awaiting_confirmation",
    schemaVersion: "job.v1",
    stateMachine: {
      currentStep: "wizard.submit",
      requiredComplete: true,
      optionalOffered: ["salary", "benefits", "screening"],
      lastTransitionAt: now,
      lockedByRequestId: null
    },
    confirmed: {
      title: state.title || existingJob?.confirmed?.title || "Untitled role",
      roleCategory:
        state.roleCategory || existingJob?.confirmed?.roleCategory || "general",
      location: {
        geo: locationParsed.geo,
        city: locationParsed.city,
        country: locationParsed.country,
        radiusKm: locationParsed.radiusKm
      },
      workModel: locationParsed.workModel,
      employmentType:
        state.employmentType ??
        existingJob?.confirmed?.employmentType ??
        "full_time",
      schedule: existingJob?.confirmed?.schedule ?? [],
      salary: state.salaryRange
        ? {
            currency: "USD",
            min: Number(
              String(state.salaryRange)
                .replace(/[^0-9\-–]/g, "")
                .split(/-|–/)[0]
            ) || null,
            max: Number(
              String(state.salaryRange)
                .replace(/[^0-9\-–]/g, "")
                .split(/-|–/)[1]
            ) || null,
            period: "year",
            overtime: false
          }
        : existingJob?.confirmed?.salary ?? null,
      description:
        existingJob?.confirmed?.description ?? buildDescription(state),
      requirements: {
        mustHave:
          parseList(state.mustHaves).length > 0
            ? parseList(state.mustHaves)
            : existingJob?.confirmed?.requirements?.mustHave ?? [],
        niceToHave:
          parseList(state.niceToHaves).length > 0
            ? parseList(state.niceToHaves)
            : existingJob?.confirmed?.requirements?.niceToHave ?? []
      },
      benefits:
        parseList(state.benefits).length > 0
          ? parseList(state.benefits)
          : existingJob?.confirmed?.benefits ?? [],
      experienceLevel: existingJob?.confirmed?.experienceLevel ?? "mid",
      licenses: existingJob?.confirmed?.licenses ?? [],
      language: existingJob?.confirmed?.language ?? "en-US",
      industry: existingJob?.confirmed?.industry ?? "",
      applyMethod: existingJob?.confirmed?.applyMethod ?? "internal_form",
      applicationFormId: existingJob?.confirmed?.applicationFormId ?? null,
      externalApplyUrl: existingJob?.confirmed?.externalApplyUrl ?? null,
      brand: existingJob?.confirmed?.brand ?? null,
      notesCompliance: existingJob?.confirmed?.notesCompliance ?? ""
    },
    pendingSuggestions: existingJob?.pendingSuggestions ?? {
      salaryRanges: [],
      benefitIdeas: [],
      titleVariants: [],
      descriptionDrafts: [],
      channelRecommendations: []
    },
    approvals: existingJob?.approvals ?? {
      fieldsApproved: [],
      approvedBy: null,
      approvedAt: null
    },
    assets: existingJob?.assets ?? [],
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
    credits: existingJob?.credits ?? {
      reserved: 5,
      charges: [],
      pricingVersion: "v1",
      policy: { reserveOn: ["wizard_submission"], chargeOnSuccess: ["asset_gen"] }
    },
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
      currentVersion: existingVersion + 1,
      previousVersionId: existingJob?.versioning?.previousVersionId ?? null
    },
    createdAt: existingJob?.createdAt ?? now,
    updatedAt: now,
    archivedAt: existingJob?.archivedAt ?? null
  };

  const parsedJob = JobSchema.parse(jobDraft);
  const asset = generateAssetFromState(state);

  const existingAssets = parsedJob.assets.filter(
    (existingAsset) => existingAsset.type !== "jd"
  );
  parsedJob.assets = [...existingAssets, asset];

  return { job: parsedJob, asset };
}

function generateSuggestions(state) {
  const suggestions = [];

  if (!state.salaryRange) {
    suggestions.push({
      id: `salary-${Date.now()}`,
      fieldId: "salaryRange",
      proposal: "$120,000 – $150,000 USD",
      confidence: 0.68,
      rationale:
        "Based on market data for similar roles in the U.S. with 5-8 years of experience."
    });
  }

  if (!state.benefits) {
    suggestions.push({
      id: `benefits-${Date.now()}`,
      fieldId: "benefits",
      proposal:
        "Medical, dental, and vision coverage; 401k match; 20 days PTO; learning stipend",
      confidence: 0.62,
      rationale:
        "Competitive benefits package that boosts apply rate for senior engineering roles."
    });
  }

  if (state.mustHaves && state.mustHaves.length > 0) {
    suggestions.push({
      id: `title-${Date.now()}`,
      fieldId: "title",
      proposal: `${state.title || "Software Engineer"} (Platform Engineering)`,
      confidence: 0.54,
      rationale:
        "Adding a focus area in the title increases relevancy and click-through rate."
    });
  }

  return suggestions;
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

      const suggestions = generateSuggestions(payload.state);
      await orchestrator.run({ type: "wizard-suggestion", payload });
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

      const { job } = buildJobDocument({ state: payload.state, user, existingJob });

      await firestore.saveDocument("jobs", job.id, job);
      await firestore.createSnapshot("jobs", job.id, {
        version: job.versioning.currentVersion,
        confirmed: job.confirmed,
        pendingSuggestions: job.pendingSuggestions,
        createdAt: new Date()
      });

      if (!existingJob) {
        const updatedCredits = {
          ...(user.credits ?? {}),
          balance: Math.max((user.credits?.balance ?? 0) - 5, 0),
          lifetimeUsed: (user.credits?.lifetimeUsed ?? 0) + 5
        };
        const updatedUsage = {
          ...(user.usage ?? {}),
          jobsCreated: (user.usage?.jobsCreated ?? 0) + 1,
          assetsGenerated: (user.usage?.assetsGenerated ?? 0) + 1,
          lastActiveAt: new Date()
        };
        await firestore.saveDocument("users", userId, {
          credits: updatedCredits,
          usage: updatedUsage,
          updatedAt: new Date()
        });
      } else {
        await firestore.saveDocument("users", userId, {
          usage: {
            ...(user.usage ?? {}),
            assetsGenerated: (user.usage?.assetsGenerated ?? 0) + 1,
            lastActiveAt: new Date()
          },
          updatedAt: new Date()
        });
      }

      logger.info({ userId, jobId: job.id }, "Persisted wizard draft");
      res.json({ draftId: job.id, status: "SAVED" });
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

      await firestore.saveDocument("jobs", job.id, updatedJob);
      logger.info(
        { jobId: job.id, field: payload.fieldId },
        "Suggestion merged into job"
      );

      res.json({ status: "QUEUED", suggestionId: payload.id });
    })
  );

  return router;
}
