import "server-only";

import { JsonRpcProvider, Wallet, parseUnits } from "ethers";
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
