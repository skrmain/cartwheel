import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { AppError } from "../errors/app-error.js";

export function validate(
  schema: ZodType,
  target: "body" | "params" = "body"
): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(target === "params" ? req.params : req.body);
    if (!result.success) {
      next(new AppError("Request validation failed.", "VALIDATION_ERROR", 400, result.error.flatten()));
      return;
    }

    if (target === "body") {
      req.body = result.data;
    }
    next();
  };
}
