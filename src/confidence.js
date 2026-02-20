const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function ageDaysFrom(nowMs, isoDateString) {
  if (!isoDateString) {
    return Number.POSITIVE_INFINITY;
  }
  const ageMs = nowMs - new Date(isoDateString).getTime();
  return Math.max(0, Math.floor(ageMs / DAY_MS));
}

export function summarizeVotes(votes, nowMs = Date.now()) {
  const works = votes.filter((vote) => vote.vote_type === "works").length;
  const doesNotWork = votes.filter((vote) => vote.vote_type === "does_not_work").length;
  const totalVotes = works + doesNotWork;

  let lastSuccessAt = null;
  for (const vote of votes) {
    if (vote.vote_type !== "works") {
      continue;
    }
    if (!lastSuccessAt || vote.updated_at > lastSuccessAt) {
      lastSuccessAt = vote.updated_at;
    }
  }

  const successRatio = works / Math.max(totalVotes, 1);
  const signalWeight = clamp(totalVotes / 5, 0, 1);
  const rawRatioScore = 50 + (successRatio - 0.5) * 100 * signalWeight;

  const successAgeDays = ageDaysFrom(nowMs, lastSuccessAt);
  const recencyWeight = clamp(1 - Math.max(successAgeDays - 30, 0) / 90, 0, 1);
  const recencyAdjusted = rawRatioScore * (0.6 + 0.4 * recencyWeight);

  const confidence = totalVotes < 3 ? Math.round(Math.min(60, recencyAdjusted)) : Math.round(recencyAdjusted);

  let freshnessBadge = "Unknown";
  if (successAgeDays <= 30) {
    freshnessBadge = "Verified recently";
  } else if (successAgeDays > 90) {
    freshnessBadge = "Stale";
  } else if (Number.isFinite(successAgeDays)) {
    freshnessBadge = "Aging";
  }

  return {
    works,
    does_not_work: doesNotWork,
    total_votes: totalVotes,
    confidence: clamp(confidence, 0, 100),
    freshness_badge: freshnessBadge,
    low_signal: totalVotes < 3,
    last_verified_at: lastSuccessAt
  };
}

export function summarizeLocation(wifiSummaries) {
  if (wifiSummaries.length === 0) {
    return {
      wifi_confidence: 0,
      freshness_badge: "Unknown",
      last_verified_at: null
    };
  }

  const confidence =
    Math.round(
      wifiSummaries.reduce((sum, summary) => sum + summary.confidence, 0) / wifiSummaries.length
    ) || 0;

  let freshest = "Stale";
  if (wifiSummaries.some((summary) => summary.freshness_badge === "Verified recently")) {
    freshest = "Verified recently";
  } else if (wifiSummaries.some((summary) => summary.freshness_badge === "Aging")) {
    freshest = "Aging";
  } else if (wifiSummaries.some((summary) => summary.freshness_badge === "Unknown")) {
    freshest = "Unknown";
  }

  const lastVerifiedAt = wifiSummaries
    .map((summary) => summary.last_verified_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  return {
    wifi_confidence: confidence,
    freshness_badge: freshest,
    last_verified_at: lastVerifiedAt
  };
}
