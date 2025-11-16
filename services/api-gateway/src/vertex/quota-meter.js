import { VERTEX_DEFAULTS } from "./constants.js";

export class QuotaMeter {
  constructor({ windowMs = 60000, softLimit = VERTEX_DEFAULTS.SOFT_LIMIT_PER_MIN } = {}) {
    this.windowMs = windowMs;
    this.softLimit = softLimit;
    this.attemptTimestamps = [];
    this.inFlight = 0;
    this.last429At = null;
    this.lastSuccessAt = null;
  }

  noteAttempt() {
    const now = Date.now();
    this.#prune(now);
    this.attemptTimestamps.push(now);
    this.inFlight += 1;
    return this.getSnapshot();
  }

  noteSuccess() {
    this.inFlight = Math.max(0, this.inFlight - 1);
    this.lastSuccessAt = Date.now();
    return this.getSnapshot();
  }

  noteFailure() {
    this.inFlight = Math.max(0, this.inFlight - 1);
    return this.getSnapshot();
  }

  note429() {
    this.inFlight = Math.max(0, this.inFlight - 1);
    this.last429At = Date.now();
    return this.getSnapshot();
  }

  getSnapshot() {
    const now = Date.now();
    this.#prune(now);
    const perMinCount = this.attemptTimestamps.length;
    return {
      perMinCount,
      last429At: this.last429At,
      inFlight: this.inFlight,
      softLimit: this.softLimit,
      warn: perMinCount >= this.softLimit
    };
  }

  #prune(now) {
    while (this.attemptTimestamps.length > 0 && now - this.attemptTimestamps[0] > this.windowMs) {
      this.attemptTimestamps.shift();
    }
  }
}
