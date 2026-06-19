export interface SubmitFollowUpDraftOptions {
  canSend: boolean;
  message: string;
  onClearDraft: () => void;
  onSubmitFollowUp: (message: string) => Promise<SubmitFollowUpDraftResult | void>;
}

export type SubmitFollowUpDraftResult = "accepted" | "failed" | "skipped";

export async function submitFollowUpDraft(options: SubmitFollowUpDraftOptions): Promise<SubmitFollowUpDraftResult> {
  if (!options.canSend) {
    return "skipped";
  }

  try {
    const result = await options.onSubmitFollowUp(options.message);
    if (result === "failed") {
      return "failed";
    }
  } catch {
    return "failed";
  }

  options.onClearDraft();
  return "accepted";
}
