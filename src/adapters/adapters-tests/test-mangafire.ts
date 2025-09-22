// Smoke test for MangaFire adapter
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mangafire = require("../mangafire").default;
import type { Adapter } from "../Adapter";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { smokeTestAdapter } = require("./_runner");

(async () => {
  const plan: { name: string; adapter: Adapter; query: string } = {
    name: "MangaFire",
    adapter: mangafire,
    query: process.env.MANGA_FIRE_QUERY || "One Piece",
  };
  try {
    await smokeTestAdapter(plan);
    console.log("MangaFire smoke test passed");
  } catch (e) {
    console.error("MangaFire smoke test failed", e);
    process.exit(1);
  }
})();
