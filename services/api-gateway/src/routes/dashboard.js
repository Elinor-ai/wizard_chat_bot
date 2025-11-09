import { Router } from "express";
import { wrapAsync, httpError } from "@wizard/utils";

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

function computeSummary(jobs = []) {
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

    const assets = job.assets ?? [];
    summary.assets.total += assets.length;
    assets.forEach((asset) => {
      if (asset.status === "approved") {
        summary.assets.approved += 1;
      } else if (["queued", "review"].includes(asset.status)) {
        summary.assets.queued += 1;
      }
    });

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
      channel: campaign.channel,
      status: campaign.status,
      budget: campaign.budget ?? 0,
      objective: campaign.objective ?? "unknown",
      createdAt: campaign.createdAt ?? job.updatedAt ?? job.createdAt
    }))
  );
}

function extractLedger(jobs = []) {
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

  return entries
    .filter((entry) => Boolean(entry.occurredAt))
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );
}

function extractActivity(jobs = []) {
  const events = [];

  jobs.forEach((job) => {
    const jobTitle =
      typeof job.roleTitle === "string" && job.roleTitle.trim().length > 0
        ? job.roleTitle.trim()
        : typeof job.companyName === "string" && job.companyName.trim().length > 0
        ? `${job.companyName.trim()} role`
        : "Untitled role";

    (job.stateMachine?.history ?? []).forEach((transition, index) => {
      events.push({
        id: `${job.id}-state-${index}`,
        type: "state_transition",
        title: `${jobTitle}: ${transition.from} → ${transition.to}`,
        detail: transition.reason ?? "State transition recorded",
        occurredAt: transition.at ?? job.updatedAt ?? job.createdAt
      });
    });

    (job.assets ?? []).forEach((asset) => {
      const eventTime = asset.updatedAt ?? asset.createdAt ?? job.updatedAt;
      events.push({
        id: `${job.id}-asset-${asset.assetId}`,
        type: "asset",
        title: `${jobTitle}: ${asset.type.toUpperCase()} ${asset.status}`,
        detail: `Current version ${asset.currentVersion}`,
        occurredAt: eventTime
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
      const jobs = await loadJobsForUser(firestore, userId);
      logger.info({ userId, jobCount: jobs.length }, "Loaded dashboard summary");
      res.json({ summary: computeSummary(jobs) });
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
      const jobs = await loadJobsForUser(firestore, userId);
      const entries = extractLedger(jobs);
      logger.info({ userId, entryCount: entries.length }, "Fetched credit ledger entries");
      res.json({ entries });
    })
  );

  router.get(
    "/activity",
    wrapAsync(async (req, res) => {
      const userId = getAuthenticatedUserId(req);
      const jobs = await loadJobsForUser(firestore, userId);
      const events = extractActivity(jobs);
      logger.info({ userId, eventCount: events.length }, "Fetched recent dashboard activity");
      res.json({ events });
    })
  );

  return router;
}
