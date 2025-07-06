import type { Adapter } from "./Adapter";
import mangadex from "./mangadex";
import weebcentral from "./weebcentral-cheerio";
import mangafire from "./mangafire";
import nhentai from "./nhentai-vpn";
import asmhentai from "./asmhentai-vpn";
import hitomi from "./hitomi";

export const adapters: Adapter[] = [
  mangadex,
  weebcentral,
  mangafire,
  nhentai,
  asmhentai,
  hitomi
];