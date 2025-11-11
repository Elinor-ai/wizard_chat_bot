import {
  VideoJobSnapshotSchema,
  VideoQaItemSchema,
  ComplianceFlagSchema
} from "@wizard/core";

function humanizeWorkModel(workModel) {
  if (!workModel) return null;
  return workModel
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function slugify(value) {
  return (value ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "role";
}

export function deriveJobSnapshot(job = {}) {
  const title = typeof job.roleTitle === "string" && job.roleTitle.trim().length > 0 ? job.roleTitle.trim() : "Open role";
  const location =
    typeof job.location === "string" && job.location.trim().length > 0
      ? job.location.trim()
      : "global";
  const salary = typeof job.salary === "string" ? job.salary.trim() : "";
  const salaryPeriod = typeof job.salaryPeriod === "string" ? job.salaryPeriod.trim() : "";
  const payRange = salary
    ? `${salary}${salaryPeriod ? `/${salaryPeriod}` : ""}`
    : null;
  const benefits = Array.isArray(job.benefits)
    ? job.benefits.filter((benefit) => typeof benefit === "string" && benefit.trim().length > 0).slice(0, 8)
    : [];
  const description = typeof job.jobDescription === "string" ? job.jobDescription.trim() : null;

  return VideoJobSnapshotSchema.parse({
    jobId: job.id ?? "unknown",
    title,
    company: typeof job.companyName === "string" && job.companyName.trim().length > 0 ? job.companyName.trim() : null,
    geo: location,
    locationPolicy: humanizeWorkModel(job.workModel) ?? null,
    payRange,
    benefits,
    roleFamily: typeof job.industry === "string" ? job.industry : null,
    description: description ? description.slice(0, 600) : null
  });
}

export function calculateStoryboardDuration(shots = []) {
  return shots.reduce((total, shot) => total + Number(shot.durationSeconds ?? 0), 0);
}

export function normaliseShots(shots = [], spec) {
  const maxDuration = spec?.duration?.maxSeconds ?? 45;
  const minDuration = spec?.duration?.minSeconds ?? 5;
  const recommended = spec?.duration?.recommendedSeconds ?? maxDuration;
  const fallbackDuration = Math.max(minDuration / Math.max(shots.length, 1), 2);

  let running = 0;
  const normalised = shots.map((shot, index) => {
    const duration = Math.max(
      2,
      Math.min(maxDuration,
        Number(shot.durationSeconds) > 0 ? Number(shot.durationSeconds) : fallbackDuration
      )
    );
    const normalisedShot = {
      ...shot,
      id: shot.id ?? `shot-${index + 1}`,
      order: index + 1,
      durationSeconds: duration,
      startSeconds: running
    };
    running += duration;
    return normalisedShot;
  });

  if (running > maxDuration) {
    const scale = maxDuration / running;
    running = 0;
    normalised.forEach((shot) => {
      shot.durationSeconds = Number((shot.durationSeconds * scale).toFixed(2));
      shot.startSeconds = Number(running.toFixed(2));
      running += shot.durationSeconds;
    });
  } else if (running < minDuration) {
    const remaining = Math.max(minDuration - running, 0);
    if (normalised.length > 0) {
      const last = normalised[normalised.length - 1];
      last.durationSeconds = Number((last.durationSeconds + remaining).toFixed(2));
      last.startSeconds = Number((running - last.durationSeconds).toFixed(2));
    }
  } else if (!Number.isFinite(running) || running === 0) {
    const spread = recommended / Math.max(normalised.length, 1);
    running = 0;
    normalised.forEach((shot) => {
      shot.durationSeconds = Number(spread.toFixed(2));
      shot.startSeconds = Number(running.toFixed(2));
      running += shot.durationSeconds;
    });
  }

  return normalised;
}

export function buildQaChecklist({ spec, storyboard, caption, jobSnapshot }) {
  const totalDuration = calculateStoryboardDuration(storyboard);
  const qaItems = [];
  const durationPass =
    totalDuration >= (spec.duration?.minSeconds ?? 0) &&
    totalDuration <= (spec.duration?.maxSeconds ?? Infinity);
  qaItems.push(
    VideoQaItemSchema.parse({
      id: "duration",
      label: `Duration ${spec.duration?.minSeconds ?? "?"}-${spec.duration?.maxSeconds ?? "?"}s`,
      status: durationPass ? "pass" : "attention",
      details: durationPass ? null : `Current duration ${totalDuration.toFixed(1)}s`
    })
  );

  qaItems.push(
    VideoQaItemSchema.parse({
      id: "aspect_ratio",
      label: `Aspect ${spec.aspectRatio}`,
      status: "pass"
    })
  );

  const captionPresent = Boolean(caption?.text && caption.text.trim().length > 0);
  qaItems.push(
    VideoQaItemSchema.parse({
      id: "captions",
      label: "Captions ready",
      status: captionPresent ? "pass" : "fail",
      details: captionPresent ? null : "Add captions to meet accessibility requirements"
    })
  );

  const hasCta = storyboard.some((shot) =>
    /apply|join|tap|swipe|learn|start/i.test(`${shot.onScreenText ?? ""} ${shot.voiceOver ?? ""}`)
  );
  qaItems.push(
    VideoQaItemSchema.parse({
      id: "cta",
      label: "CTA present",
      status: hasCta ? "pass" : "fail",
      details: hasCta ? null : "Add a CTA in the final shot or caption"
    })
  );

  const payDisclosed = Boolean(jobSnapshot.payRange);
  const locationDisclosed = Boolean(jobSnapshot.geo && jobSnapshot.geo !== "global");
  qaItems.push(
    VideoQaItemSchema.parse({
      id: "pay_location",
      label: "Pay + location disclosed",
      status: payDisclosed && locationDisclosed ? "pass" : "attention",
      details: payDisclosed && locationDisclosed ? null : "Add missing pay or city per policy"
    })
  );

  return qaItems;
}

export function buildComplianceFlags({ baseFlags = [], jobSnapshot, spec }) {
  const flags = [];
  baseFlags.forEach((flag) => {
    try {
      flags.push(ComplianceFlagSchema.parse(flag));
    } catch (_error) {
      // swallow invalid flags
    }
  });

  if (!jobSnapshot.payRange) {
    flags.push(
      ComplianceFlagSchema.parse({
        id: "missing_pay",
        label: "Add pay disclosure",
        severity: "blocking",
        details: "Spec recommends sharing pay for employment transparency"
      })
    );
  }

  if (!jobSnapshot.geo || jobSnapshot.geo === "global") {
    flags.push(
      ComplianceFlagSchema.parse({
        id: "missing_location",
        label: "Add city or territory",
        severity: "warning",
        details: "Location is required by most local advertising policies"
      })
    );
  }

  if (Array.isArray(spec?.complianceNotes)) {
    spec.complianceNotes.forEach((note, index) => {
      if (typeof note === "string" && note.trim().length > 0) {
        flags.push(
          ComplianceFlagSchema.parse({
            id: `spec_${index}`,
            label: note.trim(),
            severity: "info"
          })
        );
      }
    });
  }

  const seen = new Set();
  return flags.filter((flag) => {
    if (seen.has(flag.id)) return false;
    seen.add(flag.id);
    return true;
  });
}
