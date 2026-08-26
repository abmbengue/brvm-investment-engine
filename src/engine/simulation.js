/** Future value with monthly compounding + monthly contribution. */
export function futureValue(capital, monthly, annualRate, years) {
  const c = Math.max(0, Number(capital) || 0);
  const m = Math.max(0, Number(monthly) || 0);
  const r = Number(annualRate) || 0;
  const y = Math.max(1, Math.trunc(Number(years) || 1));
  let z = c;
  const months = 12 * y;
  const monthlyRate = r / 12;
  for (let i = 0; i < months; i++) {
    z = z * (1 + monthlyRate) + m;
  }
  return z;
}

export function capitalContributed(capital, monthly, years) {
  const c = Math.max(0, Number(capital) || 0);
  const m = Math.max(0, Number(monthly) || 0);
  const y = Math.max(1, Math.trunc(Number(years) || 1));
  return c + m * 12 * y;
}

/** Build projection table for selected horizons up to maxYears. */
export function buildProjections(capital, monthly, centralRate, maxYears) {
  const y = Math.max(1, Math.trunc(Number(maxYears) || 1));
  const base = [1, 5, 10, 20, 25, 30, 40, 50, 100];
  const pts = base.filter((x) => x <= y);
  if (!pts.includes(y)) pts.push(y);
  pts.sort((a, b) => a - b);

  const prudent = 0.05;
  const dynamic = 0.12;
  const central = Number(centralRate) || 0.09;

  return pts.map((t) => {
    const contributed = capitalContributed(capital, monthly, t);
    const prudentFv = futureValue(capital, monthly, prudent, t);
    const centralFv = futureValue(capital, monthly, central, t);
    const dynamicFv = futureValue(capital, monthly, dynamic, t);
    return {
      years: t,
      contributed,
      prudent: prudentFv,
      central: centralFv,
      dynamic: dynamicFv,
      gainCentral: centralFv - contributed,
      deltaContributedVsCentral: centralFv - contributed,
    };
  });
}
