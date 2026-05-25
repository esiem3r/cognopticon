import privacyPatternSpecs from "../src/lib/privacy-patterns.json" with { type: "json" };

export const releasePrivateContentPatterns = privacyPatternSpecs.map(({ label, source, flags }) => ({
  label,
  pattern: new RegExp(source, flags)
}));

export function releasePrivacyFindings(text) {
  return releasePrivateContentPatterns.filter(({ pattern }) => pattern.test(text));
}
