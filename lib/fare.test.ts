import { calculateFare, FareRule } from "./fare";

const rule: FareRule = {
  id: 1,
  vehicle_type: "standard",
  base_fare_mru: 100,
  per_km_mru: 100,
  min_fare_mru: 100,
};

describe("calculateFare", () => {
  it("charges the base fare for distances under 1 km", () => {
    expect(calculateFare(rule, 0.4)).toBe(100);
    expect(calculateFare(rule, 0.99)).toBe(100);
  });

  it("charges exactly the base fare at 1 km", () => {
    expect(calculateFare(rule, 1)).toBe(100);
  });

  it("adds per_km for every additional started km", () => {
    expect(calculateFare(rule, 1.1)).toBe(200);
    expect(calculateFare(rule, 2)).toBe(200);
    expect(calculateFare(rule, 3.5)).toBe(400);
    expect(calculateFare(rule, 10.01)).toBe(1100);
  });

  it("floors at min_fare even when base is below it", () => {
    const custom: FareRule = {
      ...rule,
      base_fare_mru: 80,
      per_km_mru: 50,
      min_fare_mru: 100,
    };
    expect(calculateFare(custom, 0.5)).toBe(100);
    expect(calculateFare(custom, 2.5)).toBe(180);
  });

  it("returns min_fare for invalid distances", () => {
    expect(calculateFare(rule, 0)).toBe(100);
    expect(calculateFare(rule, Number.NaN)).toBe(100);
    expect(calculateFare(rule, -3)).toBe(100);
  });
});
