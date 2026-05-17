// Display currency helper. DB stores USD; UI shows ILS.
// Update the rate here when needed (or wire to a settings table later).
export const USD_TO_ILS = 3.7;

export const usdToIls = (usd: number) => Number(usd) * USD_TO_ILS;
export const ilsToUsd = (ils: number) => Number(ils) / USD_TO_ILS;

export function fmtIls(usd: number, digits = 2): string {
  const v = usdToIls(Number(usd) || 0);
  return `₪${v.toFixed(digits)}`;
}

// For tiny per-unit prices (tokens/seconds) we need more precision.
export function fmtIlsPrecise(usd: number): string {
  const v = usdToIls(Number(usd) || 0);
  if (Math.abs(v) >= 1) return `₪${v.toFixed(4)}`;
  return `₪${v.toFixed(6)}`;
}
