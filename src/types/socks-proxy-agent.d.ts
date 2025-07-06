declare module "socks-proxy-agent" {
  import { Agent } from "undici";
  export class SocksProxyAgent extends Agent {
    constructor(url: string);
  }
} 