// Focused smoke test for nHentai adapter with optional cookie auth
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nhentai = require("../nhentai-vpn").default;
import type { Adapter } from "../Adapter";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { smokeTestAdapter } = require("./_runner");

(async () => {
  const plan: { name: string; adapter: Adapter; query: string } = {
    name: "nHentai",
    adapter: nhentai,
    query: process.env.NHENTAI_QUERY || "full color",
  };

  // If a cookie is provided, authenticate the adapter before running the smoke test
  const cookie = process.env.NHENTAI_COOKIE || "";
  if (cookie && typeof (nhentai as any).authenticate === "function") {
    try {
      await (nhentai as any).authenticate({ cookie });
      console.log("[nHentai] Applied session cookie for smoke test");
    } catch (e) {
      console.warn("[nHentai] Failed to apply cookie:", e);
    }
  } else {
    console.warn(
      "[nHentai] No NHENTAI_COOKIE provided. If you encounter 403s, set NHENTAI_COOKIE in your environment."
    );
  }

  try {
    await smokeTestAdapter(plan);
    console.log("nHentai smoke test passed");
  } catch (e) {
    console.error("nHentai smoke test failed", e);
    process.exit(1);
  }
})();
