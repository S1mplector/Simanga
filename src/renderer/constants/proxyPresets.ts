export interface ProxyPreset {
  label: string;
  value: string;
}

export const proxyPresets: ProxyPreset[] = [
  { label: "Tor SOCKS5 (127.0.0.1:9050)", value: "socks5://127.0.0.1:9050" },
  { label: "Tor SOCKS5 (127.0.0.1:9150)", value: "socks5://127.0.0.1:9150" },
  { label: "HTTP proxy example", value: "http://user:pass@host:8080" },
]; 