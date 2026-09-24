// Writes the CadenceLoan ABI to ../src/lib/web3/abi.json for the Next.js app.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(root, "artifacts/contracts/CadenceLoan.sol/CadenceLoan.json");
const outPath = resolve(root, "../src/lib/web3/abi.json");

const { abi } = JSON.parse(readFileSync(artifactPath, "utf8"));
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(abi, null, 2) + "\n");
console.log(`Wrote ${abi.length} ABI entries to ${outPath}`);
