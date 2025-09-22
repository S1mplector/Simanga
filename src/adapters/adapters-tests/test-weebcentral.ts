// Smoke test for WeebCentral (cheerio) adapter
// eslint-disable-next-line @typescript-eslint/no-var-requires
const weebcentral = require("../weebcentral-cheerio").default;
import type { Adapter } from "../Adapter";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { smokeTestAdapter } = require("./_runner");

(async () => {
  const plan: { name: string; adapter: Adapter; query: string } = {
    name: "WeebCentral",
    adapter: weebcentral,
    query: process.env.WEEBCENTRAL_QUERY || "Solo Leveling",
  };
  try {
    await smokeTestAdapter(plan);
    console.log("WeebCentral smoke test passed");
  } catch (e) {
    console.error("WeebCentral smoke test failed", e);
    process.exit(1);
  }
})();
