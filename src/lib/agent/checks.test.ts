import { describe, expect, it } from "vitest";
import { decisionFor, isJump, primaryJumpPct } from "./checks";

describe("primary jump check", () => {
  it("flags changes above 30% period-on-period", () => {
    expect(isJump(primaryJumpPct(130, 100))).toBe(false); // exactly 30%
    expect(isJump(primaryJumpPct(131, 100))).toBe(true);
    expect(isJump(primaryJumpPct(69, 100))).toBe(true);
    expect(isJump(primaryJumpPct(95, 100))).toBe(false);
  });

  it("doesn't flag when there's nothing to compare", () => {
    expect(primaryJumpPct(10, undefined)).toBeNull();
    expect(primaryJumpPct(null, 10)).toBeNull();
    expect(isJump(null)).toBe(false);
    expect(isJump(primaryJumpPct(5, 0))).toBe(true);
  });
});

describe("decisionFor", () => {
  it("escalates whenever any rule fired, regardless of margin", () => {
    expect(decisionFor(["KPI_BREACH"], 250, 225)).toBe("escalate");
    expect(decisionFor(["STEP_UP"], 250, 275)).toBe("escalate");
  });

  it("otherwise auto-adjusts or does nothing based on the margin", () => {
    expect(decisionFor([], 250, 225)).toBe("auto_adjust");
    expect(decisionFor([], 200, 200)).toBe("no_change");
  });
});
