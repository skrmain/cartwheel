import { NextFunction, Request, Response } from 'express';

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - startedAt;
        console.log(
            `${new Date(startedAt).toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`,
        );
    });

    next();
}
