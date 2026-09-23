import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

// Share the Next.js app's root .env (DEPLOYER_PRIVATE_KEY, AMOY_RPC_URL,
// POLYGONSCAN_API_KEY). Existing process env vars take precedence.
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  // No root .env (e.g. CI) — fall back to process env / Hardhat keystore.
}

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
      },
      production: {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    amoy: {
      type: "http",
      chainType: "generic",
      chainId: 80002,
      url: configVariable("AMOY_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      // Amoy's suggested tip swings (30–60+ gwei); pin it near the 25 gwei
      // network minimum so faucet-sized balances can cover a deploy.
      ignition: {
        maxPriorityFeePerGas: 30_000_000_000n,
        maxFeePerGasLimit: 35_000_000_000n,
      },
    },
  },
  verify: {
    etherscan: {
      // Etherscan V2 multichain API key (covers amoy.polygonscan.com).
      apiKey: configVariable("POLYGONSCAN_API_KEY"),
    },
  },
});
