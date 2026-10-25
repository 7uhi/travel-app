/**
 * Privacy-safe failure logging for the suggestion feature. Prompts, notes,
 * provider payloads, and raw error messages can all carry member content,
 * so the only thing ever logged is a static message plus an allowlisted
 * metadata object — never the caught error itself.
 */
export function logSuggestionFailure(): void {
  console.error("suggestActivityIdeas failed", { code: "generation_failed" });
}
