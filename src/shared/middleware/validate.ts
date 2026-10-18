import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../errors/app-error.js';

export function validate(schema: ZodType, target: 'body' | 'params' = 'body'): RequestHandler {
    return (req, _res, next) => {
        if (target === 'body' && req.body === undefined) {
            next(new AppError('Request body is required.', 'VALIDATION_ERROR', 400, { issues: [] }));
            return;
        }
        const result = schema.safeParse(target === 'params' ? req.params : req.body);
        if (!result.success) {
            next(new AppError('Request validation failed.', 'VALIDATION_ERROR', 400, { issues: result.error.issues }));
            return;
        }

        if (target === 'body') {
            req.body = result.data;
        }
        next();
    };
}
