import {
  assertTransition,
  canTransition,
  RIDE_TRANSITIONS,
} from "./ride-state";

describe("ride state machine", () => {
  it("allows legal transitions", () => {
    expect(canTransition("REQUESTED", "SEARCHING_DRIVER")).toBe(true);
    expect(canTransition("REQUESTED", "CUSTOMER_CANCELLED")).toBe(true);
    expect(canTransition("SEARCHING_DRIVER", "DRIVER_ASSIGNED")).toBe(true);
    expect(canTransition("SEARCHING_DRIVER", "NO_DRIVER_FOUND")).toBe(true);
    expect(canTransition("DRIVER_ASSIGNED", "DRIVER_ARRIVING")).toBe(true);
    expect(canTransition("DRIVER_ARRIVING", "DRIVER_AT_PICKUP")).toBe(true);
    expect(canTransition("DRIVER_AT_PICKUP", "TRIP_STARTED")).toBe(true);
    expect(canTransition("TRIP_STARTED", "TRIP_COMPLETED")).toBe(true);
    expect(canTransition("TRIP_COMPLETED", "PAYMENT_PENDING")).toBe(true);
    expect(canTransition("PAYMENT_PENDING", "DISPUTED")).toBe(true);
    expect(canTransition("PAYMENT_FAILED", "PAYMENT_PENDING")).toBe(true);
    expect(canTransition("DISPUTED", "RESOLVED")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("REQUESTED", "TRIP_STARTED")).toBe(false);
    expect(canTransition("REQUESTED", "PAYMENT_PENDING")).toBe(false);
    expect(canTransition("TRIP_STARTED", "CUSTOMER_CANCELLED")).toBe(false);
    expect(canTransition("TRIP_COMPLETED", "DRIVER_ASSIGNED")).toBe(false);
  });

  it("terminal states have no outgoing edges", () => {
    for (const status of [
      "CUSTOMER_CANCELLED",
      "DRIVER_CANCELLED",
      "NO_DRIVER_FOUND",
      "RESOLVED",
    ]) {
      expect(
        RIDE_TRANSITIONS[status as keyof typeof RIDE_TRANSITIONS],
      ).toHaveLength(0);
      expect(canTransition(status, "REQUESTED")).toBe(false);
    }
  });

  it("assertTransition throws on illegal transitions", () => {
    expect(() => assertTransition("REQUESTED", "PAYMENT_PENDING")).toThrow(
      /Illegal ride transition: REQUESTED -> PAYMENT_PENDING/,
    );
    expect(() =>
      assertTransition("REQUESTED", "SEARCHING_DRIVER"),
    ).not.toThrow();
  });
});
