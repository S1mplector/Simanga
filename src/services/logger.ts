import pino from "pino";

// Basic pino logger configuration. Can be expanded (pretty transport, file, etc.)
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: undefined, // avoid pid/hostname noise in logs
  redact: {
    paths: [
      // common sensitive keys to avoid leaking
      'req.headers.cookie',
      'cookie',
      'authorization',
    ],
    remove: true,
  },
});

export default logger;
export const child = (bindings: Record<string, any>) => logger.child(bindings);
