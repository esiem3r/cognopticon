import type { ActionOutcome } from "./types";

export function evaluateOutcome(outcome: ActionOutcome) {
  return {
    ok: outcome.ok,
    confidence: outcome.ok ? 0.82 : 0.68,
    summary: outcome.summary,
    needsHumanReview: !outcome.ok || /requires|unavailable|refused/i.test(outcome.summary)
  };
}
