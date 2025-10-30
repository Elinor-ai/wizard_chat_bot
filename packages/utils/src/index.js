import dotenv from "dotenv";
import pino from "pino";
import pretty from "pino-pretty";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("4000"),
  FIRESTORE_PROJECT_ID: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
  REDIS_URL: z.string().optional()
});

export function loadEnv(options = {}) {
  if (!process.env._WIZARD_ENV_LOADED) {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const defaultPath = resolve(moduleDir, "../../../.env");
    const path = options.path ?? process.env.WIZARD_ENV_PATH ?? defaultPath;
    dotenv.config({ ...options, path });
    process.env._WIZARD_ENV_LOADED = "true";
    if (!process.env._WIZARD_ENV_PATH) {
      process.env._WIZARD_ENV_PATH = path;
    }
    if (!process.env.WIZARD_ROOT_DIR) {
      process.env.WIZARD_ROOT_DIR = dirname(path);
    }
  }
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function createLogger(name = "app", opts = {}) {
  const stream = pretty({ colorize: process.env.NODE_ENV !== "production" });
  return pino({ name, level: opts.level ?? process.env.LOG_LEVEL ?? "info" }, stream);
}

export function wrapAsync(handler) {
  return async function wrapped(req, res, next) {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

export function httpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

export function notFound(req, res, next) {
  const error = httpError(404, `Resource not found: ${req.method} ${req.url}`);
  next(error);
}

export function errorHandler(logger) {
  return (error, req, res, _next) => {
    const status = error.status ?? 500;
    if (status >= 500) {
      logger.error({ error, path: req.path }, "Unhandled error");
    }
    res.status(status).json({
      error: {
        message: error.message,
        details: error.details ?? null
      }
    });
  };
}
