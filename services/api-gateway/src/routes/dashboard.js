import { Router } from "express";
import { wrapAsync, httpError } from "@wizard/utils";
import { JobAssetRecordSchema } from "@wizard/core";

function getAuthenticatedUserId(req) {
  const userId = req.user?.id;
  if (!userId) {
    throw httpError(401, "Unauthorized");
  }
  return userId;
}

function loadJobsForUser(firestore, userId) {
  return firestore.listCollection("jobs", [
    { field: "ownerUserId", operator: "==", value: userId }
  ]);
}

async function loadAssetsForUser(firestore, userId) {
  const docs = await firestore.queryDocuments(
    "jobAssets",
    "ownerUserId",
    "==",
    userId
  );
  return docs
    .map((doc) => {
      const parsed = JobAssetRecordSchema.safeParse(doc);
      return parsed.success ? parsed.data : null;
    })
    .filter(Boolean);
}

async function loadCreditPurchases(firestore, userId) {
  if (!firestore?.queryDocuments) {
    return [];
  }
  return firestore.queryDocuments("creditPurchases", "userId", "==", userId);
}

function deriveJobTitle(job) {
  if (!job) return "Untitled role";
  if (typeof job.roleTitle === "string" && job.roleTitle.trim().length > 0) {
    return job.roleTitle.trim();
  }
  if (typeof job.companyName === "string" && job.companyName.trim().length > 0) {
    return `${job.companyName.trim()} role`;
  }
  return "Untitled role";
}

function computeSummary(jobs = [], assets = []) {
  const summary = {
    jobs: {
      total: jobs.length,
      active: 0,
      awaitingApproval: 0,
      draft: 0,
      states: {}
    },
    assets: {
      total: 0,
      approved: 0,
      queued: 0
    },
    campaigns: {
      total: 0,
      live: 0,
      planned: 0
    },
    credits: {
      balance: 0,
      reserved: 0,
      lifetimeUsed: 0
    },
    usage: {
      tokens: 0,
      applies: 0,
      interviews: 0,
      hires: 0
    },
    updatedAt: new Date().toISOString()
  };

  jobs.forEach((job) => {
    const status = job.status ?? "unknown";
    summary.jobs.states[status] = (summary.jobs.states[status] ?? 0) + 1;

    if (status === "draft") {
      summary.jobs.draft += 1;
    } else if (["awaiting_confirmation"].includes(status)) {
      summary.jobs.awaitingApproval += 1;
    } else if (["approved", "assets_generating", "campaigns_planned", "publishing", "live"].includes(status)) {
      summary.jobs.active += 1;
    }

    const campaigns = job.campaigns ?? [];
    summary.campaigns.total += campaigns.length;
    campaigns.forEach((campaign) => {
      if (campaign.status === "live") {
        summary.campaigns.live += 1;
      } else if (["scheduled", "planned"].includes(campaign.status)) {
        summary.campaigns.planned += 1;
      }
    });

    const jobCredits = job.credits ?? {};
    summary.credits.balance += Number(jobCredits.balance ?? 0);
    summary.credits.reserved += Number(jobCredits.reserved ?? 0);
    summary.credits.lifetimeUsed += Number(jobCredits.lifetimeUsed ?? 0);

    const jobMetrics = job.metrics ?? {};
    summary.usage.applies += Number(jobMetrics.applies ?? 0);
    summary.usage.interviews += Number(jobMetrics.interviews ?? 0);
    summary.usage.hires += Number(jobMetrics.hires ?? 0);

    const tokensUsed = Number(jobMetrics.tokensUsed ?? 0);
    if (!Number.isNaN(tokensUsed)) {
      summary.usage.tokens += tokensUsed;
    }
  });

  assets.forEach((asset) => {
    summary.assets.total += 1;
    if (asset.status === "READY") {
      summary.assets.approved += 1;
    } else if (asset.status === "PENDING" || asset.status === "GENERATING") {
      summary.assets.queued += 1;
    }
  });

  return summary;
}

function extractCampaigns(jobs = []) {
  return jobs.flatMap((job) =>
    (job.campaigns ?? []).map((campaign) => ({
      campaignId: campaign.campaignId,
      jobId: job.id,
      jobTitle:
        typeof job.roleTitle === "string" && job.roleTitle.trim().length > 0
          ? job.roleTitle.trim()
          : typeof job.companyName === "string" && job.companyName.trim().length > 0
          ? `${job.companyName.trim()} role`
          : "Untitled role",
      logoUrl:
        typeof job.logoUrl === "string" && job.logoUrl.trim().length > 0
          ? job.logoUrl
          : typeof job.confirmed?.logoUrl === "string" &&
              job.confirmed.logoUrl.trim().length > 0
            ? job.confirmed.logoUrl
            : null,
      channel: campaign.channel,
      status: campaign.status,
      budget: campaign.budget ?? 0,
      objective: campaign.objective ?? "unknown",
      createdAt: campaign.createdAt ?? job.updatedAt ?? job.createdAt
    }))
  );
}

function extractLedger(jobs = [], purchases = []) {
  const entries = [];

  jobs.forEach((job) => {
    const jobId = job.id;
    const credits = job.credits ?? {};
    (credits.reservations ?? []).forEach((reservation) => {
      entries.push({
        id: reservation.reservationId,
        jobId,
        type: "RESERVATION",
        workflow: reservation.reason ?? "workflow",
        amount: Number(reservation.amount ?? 0),
        status: reservation.status ?? "pending",
        occurredAt: reservation.at ?? job.updatedAt ?? job.createdAt
      });
    });

    (credits.charges ?? []).forEach((charge) => {
      entries.push({
        id: charge.ledgerId,
        jobId,
        type: "CHARGE",
        workflow: charge.reason ?? "workflow",
        amount: Number(charge.amount ?? 0),
        status: "settled",
        occurredAt: charge.at ?? job.updatedAt ?? job.createdAt
      });
    });
  });

  purchases.forEach((purchase) => {
    entries.push({
      id: purchase.id,
      jobId: purchase.planId ?? "subscription",
      type: "PURCHASE",
      workflow: purchase.planName ?? "Subscription top-up",
      amount: Number(purchase.totalCredits ?? 0),
      status: "settled",
      occurredAt: purchase.createdAt ?? purchase.updatedAt ?? new Date()
    });
  });

  return entries
    .filter((entry) => Boolean(entry.occurredAt))
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );
}

function extractActivity(jobs = [], assets = []) {
  const events = [];
  const jobTitleMap = new Map(jobs.map((job) => [job.id, deriveJobTitle(job)]));

  jobs.forEach((job) => {
    const jobTitle = jobTitleMap.get(job.id) ?? "Untitled role";

    (job.stateMachine?.history ?? []).forEach((transition, index) => {
      events.push({
        id: `${job.id}-state-${index}`,
        type: "state_transition",
        title: `${jobTitle}: ${transition.from} → ${transition.to}`,
        detail: transition.reason ?? "State transition recorded",
        occurredAt: transition.at ?? job.updatedAt ?? job.createdAt
      });
    });

    (job.campaigns ?? []).forEach((campaign) => {
      events.push({
        id: `${job.id}-campaign-${campaign.campaignId}`,
        type: "campaign",
        title: `${jobTitle}: ${campaign.channel} ${campaign.status}`,
        detail: `Budget ${campaign.budget ?? 0}`,
        occurredAt: campaign.createdAt ?? job.updatedAt ?? job.createdAt
      });
    });
  });

  assets.forEach((asset) => {
    const jobTitle = jobTitleMap.get(asset.jobId) ?? "Untitled role";
    events.push({
      id: `${asset.jobId}-asset-${asset.id}`,
      type: "asset",
      title: `${jobTitle}: ${asset.formatId} ${asset.status}`,
      detail: asset.channelId,
      occurredAt: asset.updatedAt ?? asset.createdAt ?? new Date()
    });
  });

  return events
    .filter((event) => Boolean(event.occurredAt))
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    )
    .slice(0, 25);
}

export function dashboardRouter({ firestore, logger }) {
  const router = Router();

  router.get(
    "/summary",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const [jobs, assets, userDoc] = await Promise.all([
        loadJobsForUser(firestore, userId),
        loadAssetsForUser(firestore, userId),
        firestore.getDocument("users", userId)
      ]);
      const summary = computeSummary(jobs, assets);
      if (userDoc?.credits) {
        summary.credits.balance = Number(
          userDoc.credits.balance ?? summary.credits.balance
        );
        summary.credits.reserved = Number(
          userDoc.credits.reserved ?? summary.credits.reserved
        );
        summary.credits.lifetimeUsed = Number(
          userDoc.credits.lifetimeUsed ?? summary.credits.lifetimeUsed
        );
      }
      logger.info(
        { userId, jobCount: jobs.length, assetCount: assets.length },
        "Loaded dashboard summary"
      );
      res.json({ summary });
    })
  );

  router.get(
    "/campaigns",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const jobs = await loadJobsForUser(firestore, userId);
      const campaigns = extractCampaigns(jobs);
      logger.info({ userId, campaignCount: campaigns.length }, "Fetched campaign overview");
      res.json({ campaigns });
    })
  );

  router.get(
    "/ledger",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const [jobs, purchases] = await Promise.all([
        loadJobsForUser(firestore, userId),
        loadCreditPurchases(firestore, userId)
      ]);
      const entries = extractLedger(jobs, purchases);
      logger.info({ userId, entryCount: entries.length }, "Fetched credit ledger entries");
      res.json({ entries });
    })
  );

  router.get(
    "/activity",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const [jobs, assets] = await Promise.all([
        loadJobsForUser(firestore, userId),
        loadAssetsForUser(firestore, userId)
      ]);
      const events = extractActivity(jobs, assets);
      logger.info({ userId, eventCount: events.length }, "Fetched recent dashboard activity");
      res.json({ events });
    })
  );

  return router;
}
