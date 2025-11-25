import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Storage } from "@google-cloud/storage";

const STORAGE_BUCKET = process.env.VIDEO_STORAGE_BUCKET ?? "";
const STORAGE_BASE_URL = process.env.VIDEO_STORAGE_BASE_URL ?? "";
const STORAGE_MAKE_PUBLIC = process.env.VIDEO_STORAGE_MAKE_PUBLIC === "true";
const DOWNLOAD_TIMEOUT_MS = Number(
  process.env.VIDEO_PERSIST_DOWNLOAD_TIMEOUT_MS ?? 300_000
);
const OUTPUT_DIR = path.resolve(
  process.env.VIDEO_RENDER_OUTPUT_DIR ?? "./tmp/video-renders"
);

let storageClient = null;

function getStorageClient() {
  if (!STORAGE_BUCKET) {
    return null;
  }
  if (!storageClient) {
    storageClient = new Storage();
  }
  return storageClient;
}

function sanitizeSegment(value, fallback = "job") {
  if (!value) return fallback;
  const normalized = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function ensureTrailingSlash(value) {
  if (!value) {
    return "/";
  }
  return value.endsWith("/") ? value : `${value}/`;
}

async function downloadVideoStream(url, headers = {}) {
  const response = await axios.get(url, {
    responseType: "stream",
    headers,
    timeout: DOWNLOAD_TIMEOUT_MS,
  });
  return {
    stream: response.data,
    contentType: response.headers["content-type"] ?? "video/mp4",
  };
}

async function uploadToBucket(stream, objectPath, contentType) {
  const client = getStorageClient();
  if (!client) {
    throw new Error("Video storage bucket is not configured");
  }
  const bucket = client.bucket(STORAGE_BUCKET);
  const file = bucket.file(objectPath);
  await pipeline(
    stream,
    file.createWriteStream({
      resumable: false,
      contentType,
    })
  );
  if (STORAGE_MAKE_PUBLIC) {
    await file.makePublic().catch(() => {});
  }
  const base =
    STORAGE_BASE_URL || `https://storage.googleapis.com/${bucket.name}/`;
  return new URL(objectPath, ensureTrailingSlash(base)).toString();
}

async function saveToLocal(stream, objectPath) {
  const segments = objectPath.split("/");
  const destination = path.join(OUTPUT_DIR, ...segments);
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  await pipeline(stream, fs.createWriteStream(destination));
  return `/video-assets/${objectPath}`;
}

export async function persistRemoteVideo({
  sourceUrl,
  jobId,
  provider,
  headers = {},
  logger,
}) {
  if (!sourceUrl) {
    throw new Error("sourceUrl is required to persist remote video");
  }
  const safeJob = sanitizeSegment(jobId, "job");
  const safeProvider = sanitizeSegment(provider, "video");
  const timestamp = Date.now();
  const bucketFileName = `${safeProvider}-${timestamp}.mp4`;
  const objectPath = path.posix.join("videos", safeJob, bucketFileName);
  const localFileName = `${safeProvider}_${timestamp}.mp4`;

  if (getStorageClient()) {
    try {
      const download = await downloadVideoStream(sourceUrl, headers);
      const videoUrl = await uploadToBucket(
        download.stream,
        objectPath,
        download.contentType
      );
      return {
        videoUrl,
        storagePath: `gs://${STORAGE_BUCKET}/${objectPath}`,
        location: "bucket",
      };
    } catch (error) {
      logger?.error?.(
        { err: error, sourceUrl, bucket: STORAGE_BUCKET },
        "Failed to upload video to cloud storage; falling back to local disk"
      );
    }
  }

  const download = await downloadVideoStream(sourceUrl, headers);
  const localUrl = await saveToLocal(download.stream, localFileName);
  return {
    videoUrl: localUrl,
    storagePath: path.join(OUTPUT_DIR, localFileName),
    location: "local",
  };
}
