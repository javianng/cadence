import { id } from "ethers";
import { describe, expect, it } from "vitest";
import { canonicalJson, computeDataHash, periodHashPayload } from "./hash";

describe("canonicalJson", () => {
  it("sorts keys recursively and strips whitespace", () => {
    expect(canonicalJson({ b: [2, 3], a: 1 })).toBe('{"a":1,"b":[2,3]}');
    expect(canonicalJson({ z: { y: 1, x: [{ d: 1, c: 2 }] }, a: null })).toBe(
      '{"a":null,"z":{"x":[{"c":2,"d":1}],"y":1}}',
    );
  });

  it("rejects values that don't round-trip through JSON", () => {
    expect(() => canonicalJson({ a: undefined })).toThrow(TypeError);
    expect(() => canonicalJson({ a: NaN })).toThrow(TypeError);
    expect(() => canonicalJson({ a: Infinity })).toThrow(TypeError);
    expect(() => canonicalJson({ a: 1n })).toThrow(TypeError);
  });
});

describe("computeDataHash", () => {
  it("matches keccak256 of the hand-written canonical string", () => {
    expect(computeDataHash({ b: [2, 3], a: 1 })).toBe(id('{"a":1,"b":[2,3]}'));
  });

  it("is independent of key order", () => {
    expect(computeDataHash({ a: 1, b: { c: 2, d: 3 } })).toBe(
      computeDataHash({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it("changes when any value changes", () => {
    const base = { loanId: "x", readings: [{ v: 1.5 }] };
    expect(computeDataHash(base)).not.toBe(
      computeDataHash({ loanId: "x", readings: [{ v: 1.51 }] }),
    );
  });

  it("returns a 0x-prefixed bytes32", () => {
    expect(computeDataHash({})).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("periodHashPayload", () => {
  it("orders readings by kpiId so storage order doesn't matter", () => {
    const r1 = {
      kpiId: "b",
      primaryValue: 1,
      secondaryValue: 1,
      acceptedValue: 1,
    };
    const r2 = {
      kpiId: "a",
      primaryValue: 2,
      secondaryValue: null,
      acceptedValue: 2,
    };
    const common = { loanId: "l", tokenId: 0, period: 1, transitionScore: 70 };
    expect(
      computeDataHash(periodHashPayload({ ...common, readings: [r1, r2] })),
    ).toBe(
      computeDataHash(periodHashPayload({ ...common, readings: [r2, r1] })),
    );
  });

  it("commits to kpiScores and decision only when given (agent runs)", () => {
    const common = {
      loanId: "l",
      tokenId: 0,
      period: 21,
      transitionScore: 70,
      readings: [],
    };
    const seeded = periodHashPayload(common);
    expect(seeded).not.toHaveProperty("decision");
    expect(seeded).not.toHaveProperty("kpiScores");
    const withDecision = (decision: string) =>
      computeDataHash(
        periodHashPayload({
          ...common,
          kpiScores: [{ id: "a", score: 70 }],
          decision,
        }),
      );
    expect(withDecision("no_change")).not.toBe(withDecision("escalate"));
    expect(withDecision("no_change")).not.toBe(computeDataHash(seeded));
  });
});
