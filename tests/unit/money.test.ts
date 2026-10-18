import { describe, expect, it } from 'vitest';
import { percentDiscount } from '../../src/shared/utils/money.js';

describe('percentage discounts in integer cents', () => {
    it('rounds half up and applies the percentage once to the subtotal', () => {
        expect(percentDiscount(105, 10)).toBe(11);
        expect(percentDiscount(3 * 1999, 10)).toBe(600);
        expect(percentDiscount(3 * 1997, 10)).toBe(599);
        expect(percentDiscount(3333, 10)).toBe(333);
    });

    it('caps a full discount at the subtotal and never returns a negative discount', () => {
        expect(percentDiscount(3333, 100)).toBe(3333);
        expect(percentDiscount(-10, 100)).toBe(0);
    });
});
