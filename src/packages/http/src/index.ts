export * from "./main.js";
export * as http from "./main.js";
export * as Github from "./github.js";
export * as large from "./large.js";
import { jsonRequest } from "./main.js";

export type clientIP<protocolType extends "ipv4"|"ipv6" = "ipv4"> = {
  ip: string,
  type: protocolType,
  subtype: string,
  via: string,
  padding: string,
  asn: string,
  asnlist: string,
  asn_name: string,
  country: string,
  protocol: "HTTP/2.0"|"HTTP/1.1"|"HTTP/1.0"
};

export async function getExternalIP(): Promise<{ipv4?: string, ipv6?: string, rawRequest?: {ipv4?: clientIP<"ipv4">, ipv6?: clientIP<"ipv6">}}> {
  const [ipv6, ipv4] = await Promise.all([
    await jsonRequest<clientIP<"ipv6">>("https://ipv6.lookup.test-ipv6.com/ip/").then(data => data.body).catch(() => undefined),
    await jsonRequest<clientIP<"ipv4">>("https://ipv4.lookup.test-ipv6.com/ip/").then(data => data.body).catch(() => undefined)
  ]);
  if (!ipv4 && !ipv6) return {};
  else if (!ipv4) return {ipv6: ipv6.ip, rawRequest: {ipv6}};
  else if (!ipv6) return {ipv4: ipv4.ip, rawRequest: {ipv4}};
  return {
    ipv4: ipv4.ip,
    ipv6: ipv6.ip,
    rawRequest: {ipv4, ipv6}
  };
}