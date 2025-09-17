// Use CommonJS-style imports for ts-node/register compatibility
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mangadex = require("../mangadex").default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mangafire = require("../mangafire").default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const weebcentral = require("../weebcentral-cheerio").default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const hitomi = require("../hitomi").default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nhentai = require("../nhentai-vpn").default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const asmhentai = require("../asmhentai-vpn").default;
import type { Adapter } from "../Adapter";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { smokeTestAdapter } = require("./_runner");

// Control mature adapters with env var
const INCLUDE_MATURE = process.env.INCLUDE_MATURE === "1";

// Define plans per adapter
const plans: { name: string; adapter: Adapter; query: string }[] = [
  { name: "Mangafire", adapter: mangafire, query: "One Piece" },
  { name: "Mangadex", adapter: mangadex, query: "Solo Leveling" },
  { name: "WeebCentral", adapter: weebcentral, query: "Naruto" },
  { name: "Hitomi", adapter: hitomi, query: "original" }, // common tag
];

if (INCLUDE_MATURE) {
  // If a cookie is provided, authenticate ahead of the test
  if (process.env.NHENTAI_COOKIE) {
    // best-effort, won't throw here; smokeTestAdapter will surface issues
    nhentai.authenticate?.({ cookie: process.env.NHENTAI_COOKIE });
    console.log("[nHentai] Using provided NHENTAI_COOKIE for authentication");
  }
  plans.push({ name: "nHentai", adapter: nhentai, query: "language:english" });
  plans.push({ name: "AsmHentai", adapter: asmhentai, query: "a" }); // broad query to get anything
}

async function main() {
  const failures: string[] = [];
  for (const plan of plans) {
    try {
      await smokeTestAdapter(plan);
    } catch (e) {
      failures.push(plan.name);
    }
  }
  if (failures.length) {
    console.error("Some adapters failed:", failures.join(", "));
    process.exitCode = 1;
  } else {
    console.log("All adapter smoke tests passed.");
  }
}

main().catch((e) => {
  console.error("Runner error:", e);
  process.exit(1);
});
