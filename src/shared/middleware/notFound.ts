import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error.js";

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError("The requested route was not found.", "NOT_FOUND", 404));
};
