import { expect } from 'vitest';

export function expectApiError(
    response: { status: number; body: unknown },
    status: number,
    code: string,
) {
    expect(response.status).toBe(status);
    expect(response.body).toEqual({
        error: {
            code,
            message: expect.any(String),
            details: expect.any(Object),
        },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/stack|at \w+ \(/i);
}
