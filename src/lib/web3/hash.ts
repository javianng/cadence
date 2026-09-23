import { keccak256, toUtf8Bytes } from "ethers";

// Pure (no "server-only"): the public /verify page recomputes hashes too.

/**
 * Deterministic JSON: object keys sorted recursively, no whitespace. Rejects
 * values JSON can't round-trip (undefined, NaN/Infinity, functions, bigint)
 * so two machines can never hash "the same" data differently.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(`canonicalJson: non-finite number ${value}`);
      }
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(",")}]`;
      }
      const obj = value as Record<string, unknown>;
      const entries = Object.keys(obj)
        .sort()
        .map((key) => {
          if (obj[key] === undefined) {
            throw new TypeError(`canonicalJson: undefined value at "${key}"`);
          }
          return `${JSON.stringify(key)}:${canonicalJson(obj[key])}`;
        });
      return `{${entries.join(",")}}`;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
  }
}

/** keccak256 of the canonical JSON of `payload`, as a 0x-prefixed bytes32. */
export function computeDataHash(payload: object): string {
  return keccak256(toUtf8Bytes(canonicalJson(payload)));
}

export type PeriodHashReading = {
  kpiId: string;
  primaryValue: number | null;
  secondaryValue: number | null;
  acceptedValue: number | null;
};

/**
 * The exact object hashed and anchored on-chain for one loan-period. Built
 * only from fields stored in Firestore (loans.tokenId, readings, scoreHistory)
 * so the verify page can rebuild it and compare with ScoreSubmitted.dataHash.
 */
export function periodHashPayload(input: {
  loanId: string;
  tokenId: number;
  period: number;
  transitionScore: number;
  readings: PeriodHashReading[];
}) {
  return {
    loanId: input.loanId,
    tokenId: input.tokenId,
    period: input.period,
    transitionScore: input.transitionScore,
    readings: [...input.readings]
      .sort((a, b) => a.kpiId.localeCompare(b.kpiId))
      .map((r) => ({
        kpiId: r.kpiId,
        primaryValue: r.primaryValue,
        secondaryValue: r.secondaryValue,
        acceptedValue: r.acceptedValue,
      })),
  };
}
