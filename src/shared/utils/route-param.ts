import { AppError } from "../errors/app-error.js";

export function routeParam(
  params: Record<string, string | string[]>,
  name: string
): string {
  const value = params[name];
  if (typeof value !== "string") {
    throw new AppError(`Route parameter "${name}" is required.`, "VALIDATION_ERROR", 400);
  }
  return value;
}
