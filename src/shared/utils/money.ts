export function lineTotal(unitPriceCents: number, qty: number): number {
    return unitPriceCents * qty;
}

export function clampCents(value: number): number {
    return Math.max(0, value);
}

export function percentDiscount(subtotalCents: number, percent: number): number {
    const normalizedPercent = Math.min(100, Math.max(0, percent));
    const rawDiscount = Math.floor((subtotalCents * normalizedPercent + 50) / 100);
    return clampCents(Math.min(rawDiscount, subtotalCents));
}
