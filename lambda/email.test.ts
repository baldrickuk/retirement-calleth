import { stageForDays } from "./email";

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
