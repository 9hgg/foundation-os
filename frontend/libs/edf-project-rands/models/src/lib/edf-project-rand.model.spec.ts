import { getOverheadCoefficient, getDailyCostForCategory, getDailyCostWithOverhead, CategoryEnum, OVERHEAD_COEFFICIENTS } from './edf-project-rand.model';

describe('getOverheadCoefficient', () => {
  it('returns the coefficient for a known year', () => {
    expect(getOverheadCoefficient(2025)).toBe(1.38);
  });

  it('returns the same coefficient for all defined years (2025-2031)', () => {
    for (let year = 2025; year <= 2031; year++) {
      expect(getOverheadCoefficient(year)).toBe(1.38);
    }
  });

  it('throws for an unknown year', () => {
    expect(() => getOverheadCoefficient(2000)).toThrow();
  });
});

describe('getDailyCostForCategory', () => {
  it('returns the correct cost for category A in 2025', () => {
    expect(getDailyCostForCategory(2025, CategoryEnum.A)).toBeCloseTo(378.29, 1);
  });

  it('returns the correct cost for category E in 2025', () => {
    expect(getDailyCostForCategory(2025, CategoryEnum.E)).toBeCloseTo(1211.15, 1);
  });

  it('throws for an unknown year', () => {
    expect(() => getDailyCostForCategory(1990, CategoryEnum.A)).toThrow();
  });

  it('covers all categories without throwing', () => {
    for (const cat of Object.values(CategoryEnum)) {
      expect(() => getDailyCostForCategory(2025, cat)).not.toThrow();
    }
  });
});

describe('getDailyCostWithOverhead', () => {
  it('multiplies daily cost by overhead coefficient', () => {
    const base = getDailyCostForCategory(2025, CategoryEnum.B);
    const overhead = getOverheadCoefficient(2025);
    expect(getDailyCostWithOverhead(2025, CategoryEnum.B)).toBeCloseTo(base * overhead, 2);
  });

  it('is greater than the base daily cost (overhead > 1)', () => {
    const base = getDailyCostForCategory(2026, CategoryEnum.C);
    const withOverhead = getDailyCostWithOverhead(2026, CategoryEnum.C);
    expect(withOverhead).toBeGreaterThan(base);
  });
});
