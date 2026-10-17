import type { ErrorRequestHandler } from "express";
import { z } from "zod";
import { AppError, ServiceBusyError } from "../errors/app-error.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    if (error.statusCode === 503) {
      res.setHeader("Retry-After", String(error.details.retryAfterSeconds ?? 1));
    }
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
    return;
  }

  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: error.flatten()
      }
    });
    return;
  }

  const code = typeof error === "object" && error !== null ? String((error as { code?: string }).code ?? "") : "";
  const message = typeof error === "object" && error !== null ? String((error as { message?: string }).message ?? "") : "";

  if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED" || /database is locked|database table is locked|busy timeout|lock timeout/i.test(message)) {
    const busy = new ServiceBusyError(1);
    res.setHeader("Retry-After", String(busy.details.retryAfterSeconds ?? 1));
    res.status(busy.statusCode).json({
      error: {
        code: busy.code,
        message: busy.message,
        details: { retryAfterSeconds: busy.details.retryAfterSeconds }
      }
    });
    return;
  }

  if (code === "P2002") {
    res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred.",
        details: {}
      }
    });
    return;
  }

  console.error("Unhandled request error:", error);
  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
      details: {}
    }
  });
};
