import { NotImplementedError } from '../../shared/errors/app-error.js';

export const couponService = {
    async generateCoupons(): Promise<never> {
        throw new NotImplementedError();
    },
};
