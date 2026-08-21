import { Ride } from "@/types/type";

import {
  estimateFareMRU,
  formatDate,
  formatMRU,
  formatTime,
  sortRides,
} from "./utils";

describe("estimateFareMRU", () => {
  it("charges the base 100 MRU for distances under 1 km", () => {
    expect(estimateFareMRU(0.5)).toBe(100);
    expect(estimateFareMRU(0.99)).toBe(100);
  });

  it("charges exactly 1 km at the base fare", () => {
    expect(estimateFareMRU(1)).toBe(100);
  });

  it("adds 100 MRU per additional started km", () => {
    expect(estimateFareMRU(1.1)).toBe(200);
    expect(estimateFareMRU(2)).toBe(200);
    expect(estimateFareMRU(3.5)).toBe(400);
  });

  it("returns the base fare for invalid input", () => {
    expect(estimateFareMRU(0)).toBe(100);
    expect(estimateFareMRU(-5)).toBe(100);
    expect(estimateFareMRU(Number.NaN)).toBe(100);
  });
});

describe("formatMRU", () => {
  it("formats whole MRU without decimals", () => {
    expect(formatMRU(250)).toBe("250 MRU");
    expect(formatMRU(250.4)).toBe("250 MRU");
  });

  it("handles string input", () => {
    expect(formatMRU("150")).toBe("150 MRU");
  });

  it("returns 0 MRU for invalid input", () => {
    expect(formatMRU("abc")).toBe("0 MRU");
    expect(formatMRU(Number.NaN)).toBe("0 MRU");
  });
});

describe("formatTime", () => {
  it("formats minutes under an hour", () => {
    expect(formatTime(15)).toBe("15 min");
  });

  it("formats hours and minutes", () => {
    expect(formatTime(95)).toBe("1h 35m");
  });
});

describe("formatDate", () => {
  it("formats a date string", () => {
    expect(formatDate("2026-08-20T10:00:00Z")).toBe("20 August 2026");
  });
});

describe("sortRides", () => {
  const rides = [
    {
      ride_id: 1,
      created_at: "2026-08-01T10:00:00Z",
    },
    {
      ride_id: 2,
      created_at: "2026-08-20T10:00:00Z",
    },
    {
      ride_id: 3,
      created_at: "2026-08-10T10:00:00Z",
    },
  ] as unknown as Ride[];

  it("sorts newest first without mutating the input", () => {
    const sorted = sortRides(rides);
    expect(sorted.map((ride) => ride.ride_id)).toEqual([2, 3, 1]);
    expect(rides.map((ride) => ride.ride_id)).toEqual([1, 2, 3]);
  });
});
