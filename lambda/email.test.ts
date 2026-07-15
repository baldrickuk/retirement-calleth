import { stageForDays, progressPct } from "./email";

describe("stageForDays", () => {
  it("returns calm above 365 days", () => {
    expect(stageForDays(366).key).toBe("calm");
  });
  it("boundary 365 is cheeky", () => {
    expect(stageForDays(365).key).toBe("cheeky");
  });
  it("boundary 100 is unhinged", () => {
    expect(stageForDays(100).key).toBe("unhinged");
  });
  it("boundary 30 is chaotic", () => {
    expect(stageForDays(30).key).toBe("chaotic");
  });
  it("boundary 7 is peak", () => {
    expect(stageForDays(7).key).toBe("peak");
  });
  it("1 day is peak", () => {
    expect(stageForDays(1).key).toBe("peak");
  });
  it("0 and negative are theday", () => {
    expect(stageForDays(0).key).toBe("theday");
    expect(stageForDays(-3).key).toBe("theday");
  });
  it("preserves the exact calm tone string", () => {
    expect(stageForDays(400).tone).toBe(
      "dry, understated, barely-amused corporate tone. A single restrained joke at most."
    );
  });
});

describe("progressPct", () => {
  it("is 0% at the start date", () => {
    expect(progressPct("2026-01-01", "2028-01-01", new Date("2026-01-01T12:00:00Z"))).toBe(0);
  });
  it("is 100% at the retirement date", () => {
    expect(progressPct("2026-01-01", "2028-01-01", new Date("2028-01-01T00:00:00Z"))).toBe(100);
  });
  it("is ~50% at the midpoint", () => {
    expect(progressPct("2026-01-01", "2028-01-01", new Date("2027-01-01T00:00:00Z"))).toBe(50);
  });
  it("clamps to 0 when today is before the start", () => {
    expect(progressPct("2026-01-01", "2028-01-01", new Date("2025-06-01T00:00:00Z"))).toBe(0);
  });
  it("clamps to 100 when today is past retirement", () => {
    expect(progressPct("2026-01-01", "2028-01-01", new Date("2030-01-01T00:00:00Z"))).toBe(100);
  });
  it("returns 0 for a malformed start date", () => {
    expect(progressPct("not-a-date", "2028-01-01", new Date("2027-01-01T00:00:00Z"))).toBe(0);
  });
  it("returns 0 when start is not before retirement", () => {
    expect(progressPct("2028-01-01", "2026-01-01", new Date("2027-01-01T00:00:00Z"))).toBe(0);
  });
});
