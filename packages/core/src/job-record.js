import { v4 as uuid } from "uuid";

export class JobRecord {
  constructor(args = {}) {
    this.jobId = args.jobId ?? uuid();
    this.versions = args.versions ?? [];
    this.draftState = args.draftState ?? {};
  }

  get latestVersion() {
    return this.versions.at(-1);
  }

  get currentDraft() {
    return { ...this.draftState };
  }

  upsertDraft(fieldId, value) {
    this.draftState[fieldId] = value;
  }

  confirmDraft(actorId) {
    const versionNumber = (this.latestVersion?.version ?? 0) + 1;
    const record = {
      id: uuid(),
      version: versionNumber,
      state: { ...this.draftState },
      confirmedAt: new Date(),
      confirmedBy: actorId
    };
    this.versions.push(record);
    return record;
  }
}
