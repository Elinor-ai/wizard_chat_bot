/**
 * @typedef {Object} VideoGenerationRequest
 * @property {string} prompt
 * @property {number} [duration]
 * @property {string} [aspectRatio]
 */

/**
 * @typedef {Object} VideoGenerationResult
 * @property {string} id
 * @property {'pending' | 'completed' | 'failed'} status
 * @property {string | null} [videoUrl]
 * @property {Error | null} [error]
 */

export class VideoRendererError extends Error {
  constructor(message, { code = "UNKNOWN", context = null } = {}) {
    super(message);
    this.name = "VideoRendererError";
    this.code = code;
    this.context = context;
  }
}

export class IVideoClient {
  /**
   * @param {VideoGenerationRequest} _request
   * @returns {Promise<VideoGenerationResult>}
   */
  async startGeneration(_request) {
    throw new Error("startGeneration not implemented");
  }

  /**
   * @param {string} _id
   * @returns {Promise<VideoGenerationResult>}
   */
  async checkStatus(_id) {
    throw new Error("checkStatus not implemented");
  }
}
