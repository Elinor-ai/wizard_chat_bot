import { WizardCopilotChatSchema } from "@wizard/core";

const COPILOT_CHAT_COLLECTION = "wizardCopilotChats";

export async function loadCopilotHistory({ firestore, jobId, limit = 12 }) {
  if (!jobId) return [];
  const existing = await firestore.getDocument(COPILOT_CHAT_COLLECTION, jobId);
  if (!existing) {
    return [];
  }
  const parsed = WizardCopilotChatSchema.safeParse(existing);
  if (!parsed.success) {
    return [];
  }
  const messages = parsed.data.messages ?? [];
  if (!limit || limit <= 0) {
    return messages;
  }
  return messages.slice(-limit);
}

export async function appendCopilotMessages({
  firestore,
  jobId,
  messages,
  limit = 20,
  now = new Date()
}) {
  if (!jobId) {
    throw new Error("jobId is required to append copilot messages");
  }
  const existing = await firestore.getDocument(COPILOT_CHAT_COLLECTION, jobId);
  const parsed = existing ? WizardCopilotChatSchema.safeParse(existing) : null;
  const base = parsed?.success
    ? parsed.data
    : {
        id: jobId,
        jobId,
        messages: [],
        updatedAt: now
      };

  const merged = [...(base.messages ?? []), ...(messages ?? [])];
  const trimmed =
    limit && limit > 0 ? merged.slice(-limit) : merged;

  const payload = WizardCopilotChatSchema.parse({
    ...base,
    messages: trimmed,
    updatedAt: now
  });

  await firestore.saveDocument(COPILOT_CHAT_COLLECTION, jobId, payload);
  return payload.messages;
}
