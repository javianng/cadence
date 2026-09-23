import "server-only";

import {
  JsonRpcProvider,
  Wallet,
  formatEther,
  parseEther,
  parseUnits,
} from "ethers";
import { env } from "~/env";

export const AMOY_CHAIN_ID = 80002;

export const provider = new JsonRpcProvider(env.AMOY_RPC_URL, AMOY_CHAIN_ID, {
  staticNetwork: true,
});

export const wallet = new Wallet(
  env.DEPLOYER_PRIVATE_KEY.startsWith("0x")
    ? env.DEPLOYER_PRIVATE_KEY
    : `0x${env.DEPLOYER_PRIVATE_KEY}`,
  provider,
);

/**
 * Amoy's suggested tip swings between ~30 and 60+ gwei; pin it near the
 * 25 gwei network minimum (same caps as contracts/hardhat.config.ts).
 */
export const FEE_OVERRIDES = {
  maxPriorityFeePerGas: parseUnits("30", "gwei"),
  maxFeePerGas: parseUnits("35", "gwei"),
} as const;

/** Never let a transaction take the wallet below this (same as the seed). */
export const MIN_BALANCE_POL = "0.005";

/**
 * Throws a readable error if sending `gas` at the capped fee could leave the
 * wallet under MIN_BALANCE_POL. Returns the balance for logging.
 */
export async function assertGasBudget(label: string, gas: bigint) {
  const balance = await provider.getBalance(wallet.address);
  const cost = gas * FEE_OVERRIDES.maxFeePerGas;
  if (balance - cost < parseEther(MIN_BALANCE_POL)) {
    throw new Error(
      `Insufficient gas for ${label}: wallet ${wallet.address} has ${formatEther(balance)} POL, ` +
        `this needs up to ${formatEther(cost)} POL and must leave ${MIN_BALANCE_POL} POL. Top up from the Amoy faucet.`,
    );
  }
  return balance;
}
