// Smoke test for Hitomi adapter
// eslint-disable-next-line @typescript-eslint/no-var-requires
const hitomi = require("../hitomi").default;
import type { Adapter } from "../Adapter";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { smokeTestAdapter } = require("./_runner");

(async () => {
  const plan: { name: string; adapter: Adapter; query: string } = {
    name: "Hitomi",
    adapter: hitomi,
    query: process.env.HITOMI_QUERY || "full color",
  };
  try {
    await smokeTestAdapter(plan);
    console.log("Hitomi smoke test passed");
  } catch (e) {
    console.error("Hitomi smoke test failed", e);
    process.exit(1);
  }
})();
