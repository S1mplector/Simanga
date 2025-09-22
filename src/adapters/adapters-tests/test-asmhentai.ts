// Smoke test for ASMHentai adapter
// eslint-disable-next-line @typescript-eslint/no-var-requires
const asmhentai = require("../asmhentai-vpn").default;
import type { Adapter } from "../Adapter";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { smokeTestAdapter } = require("./_runner");

(async () => {
  const plan: { name: string; adapter: Adapter; query: string } = {
    name: "ASMHentai",
    adapter: asmhentai,
    query: process.env.ASMHENTAI_QUERY || "full color",
  };

  const cookie = process.env.ASMHENTAI_COOKIE || "";
  if (cookie && typeof (asmhentai as any).authenticate === "function") {
    try {
      await (asmhentai as any).authenticate({ cookie });
      console.log("[ASMHentai] Applied session cookie for smoke test");
    } catch (e) {
      console.warn("[ASMHentai] Failed to apply cookie:", e);
    }
  }

  try {
    await smokeTestAdapter(plan);
    console.log("ASMHentai smoke test passed");
  } catch (e) {
    console.error("ASMHentai smoke test failed", e);
    process.exit(1);
  }
})();
