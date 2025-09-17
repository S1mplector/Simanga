// Focused smoke test for Mangadex adapter
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mangadex = require("../mangadex").default;
import type { Adapter } from "../Adapter";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { smokeTestAdapter } = require("./_runner");

(async () => {
  const plan: { name: string; adapter: Adapter; query: string } = {
    name: "Mangadex",
    adapter: mangadex,
    query: process.env.MANGADEX_QUERY || "Solo Leveling",
  };
  try {
    await smokeTestAdapter(plan);
    console.log("Mangadex smoke test passed");
  } catch (e) {
    console.error("Mangadex smoke test failed", e);
    process.exit(1);
  }
})();
