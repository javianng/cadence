import "server-only";

import {
  Contract,
  type ContractTransactionResponse,
  type Interface,
  type Overrides,
} from "ethers";
import { env } from "~/env";
import abi from "./abi.json";
import { wallet } from "./client";

export type Band = { minScore: number; adjustmentBps: number };

/** Mirrors CadenceLoan.Loan (ethers returns uint/int fields as bigint). */
export type OnChainLoan = {
  borrowerRef: string;
  baseMarginBps: bigint;
  currentMarginBps: bigint;
  floorBps: bigint;
  capBps: bigint;
  maxStepBps: bigint;
  currentScore: bigint;
  pendingAdjustmentBps: bigint;
  updateCount: bigint;
  lastUpdated: bigint;
};

type Tx = Promise<ContractTransactionResponse>;
type WriteFn<A extends unknown[]> = ((...args: [...A, Overrides?]) => Tx) & {
  estimateGas: (...args: [...A, Overrides?]) => Promise<bigint>;
};

export type CadenceLoanContract = {
  interface: Interface;
  getAddress(): Promise<string>;
  mintLoan: WriteFn<
    [
      to: string,
      borrowerRef: string,
      baseMarginBps: number,
      floorBps: number,
      capBps: number,
      maxStepBps: number,
      bands: Band[],
    ]
  >;
  submitScore: WriteFn<
    [tokenId: bigint, score: number, dataHash: string, runRef: string]
  >;
  flagException: WriteFn<
    [tokenId: bigint, reasonCode: string, dataHash: string]
  >;
  resolveAdjustment: WriteFn<
    [tokenId: bigint, approve: boolean, rmRef: string]
  >;
  previewMargin(tokenId: bigint, score: number): Promise<bigint>;
  getLoan(tokenId: bigint): Promise<OnChainLoan>;
  getBands(
    tokenId: bigint,
  ): Promise<{ minScore: bigint; adjustmentBps: bigint }[]>;
  nextTokenId(): Promise<bigint>;
};

export const CADENCE_CONTRACT_ADDRESS = env.CADENCE_CONTRACT_ADDRESS;

export const cadenceContract = new Contract(
  CADENCE_CONTRACT_ADDRESS,
  abi,
  wallet,
) as unknown as CadenceLoanContract;
