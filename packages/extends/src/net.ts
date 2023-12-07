import { isIP, isIPv4, isIPv6 } from "node:net";
export { isIP, isIPv4, isIPv6 };

/**
 * Convert IP to BigInt/number
 * @param ipAddress - IPv4 or IPv6 address.
 * @returns
 */
export function toInt(ipAddress: string): bigint {
  const [ group1, group2, group3, group ] = ipAddress.split(".");
  if (!(group1 && group2 && group3 && group)) {
    while (ipAddress.indexOf("::") >= 0) ipAddress = ipAddress.replace("::", "0000:0000");
    return BigInt(String("0x").concat(ipAddress.split(":").map(c => (c.length === 0||c === "0") ? "0000" : c).join("")));
  }
  return ([group1, group2, group3, group]).reduce<bigint>((p, c: string, i: number) => p + BigInt(parseInt(c) * 256 ** (3 - i)), 0n);
}

/**
 * Convert IPv4 or IPv6 to Binary format.
 *
 * @param ipAddress - IPv4 or IPv6
 * @returns
 */
export function toBinary(ipAddress: bigint|string): string {
  if (!(typeof ipAddress === "string" || typeof ipAddress === "bigint")) throw new TypeError("Invalid input IP Address");
  else if (typeof ipAddress === "string") ipAddress = toInt(ipAddress);
  return ipAddress.toString(2);
}

const fistIPv6 = 4294967295n, endIPv6 = 340282366920938463463374607431768211455n;

/**
 * convert number to IPv4 or IPv6.
 *
 * @param ipInt - IPv4/IPv6 Number
 * @returns
*/
export function toString(ipInt: bigint, forceV6?: boolean): string {
  if (ipInt < 0n || ipInt >= endIPv6) throw new TypeError("Invalid input IP");
  // Ipv6
  if (forceV6 || ipInt > fistIPv6) {
    let hex = ipInt.toString(16), iph: string[] = [];
    if (hex.length <= 16) hex = String().padStart(Math.abs(16 - hex.length), "0").concat(hex);
    while (hex.length > 0) {
      iph.push(hex.slice(0, 4));
      hex = hex.slice(4);
    }
    if (iph.length < 8) for (let i = iph.length; i < 8; i++) iph = (["0000"]).concat(iph);
    if (iph[0] === "0000" && iph[1] === "0000" && iph[2] === "0000" && iph[3] === "0000" && iph[4] === "0000" && iph[5] === "0000") iph = ["", "", "ffff", iph[6], iph[7]];
    else if (iph[2] === "0000" && iph[3] === "0000" && iph[4] !== "0000" && iph[5] === "0000" ) iph = [iph[0], iph[1], iph[4], "", iph[7]];
    iph = iph.map(s =>{
      if (s === "0000") return "0";
      else if (s[0] === "0" && s[1] === "0") return s.slice(2);
      else if (s[0] === "0" && s[1] !== "0") return s.slice(1);
      return s;
    });
    return iph.join(":");
  }

  let remaining: number = parseInt(ipInt.toString());
  return ("").concat(
    String(Math.max(0, Math.min(255, Math.floor(remaining / 256 ** 3)))),
    ".",
    String(Math.max(0, Math.min(255, Math.floor((remaining = remaining % 256 ** 3) / 256 ** 2)))),
    ".",
    String(Math.max(0, Math.min(255, Math.floor((remaining = remaining % 256 ** 2) / 256 ** 1)))),
    ".",
    String(Math.max(0, Math.min(255, Math.floor((remaining = remaining % 256 ** 1) / 256 ** 0)))),
  );
}

/**
 * Convert IPv4 in to IPv6
 *
 * @example
 * ```js
 * toV6("192.178.66.255"); // => "0000:0000:0000:0000:0000:ffff:c0b2:42ff"
 * toV6("192.178.66.255", false); // => "0000:0000:0000:0000:0000:ffff:c0b2:42ff"
 * toV6("192.178.66.255", true); // => "::ffff:c0b2:42ff" - Simplified version
 * ```
 */
export function toV6(ipv4: string, compressedv6: boolean = false) {
  if (!(isIPv4(ipv4))) throw new Error("ipv4 is required");
  const classValues = ipv4.split(".").map(s => parseInt(s.split("/")[0]) % 256);
  const hexaCode = (hexaVal: number) => hexaVal >= 0 && hexaVal <= 9 ? hexaVal : (hexaVal === 10 ? "a" : (hexaVal === 11 ? "b" : (hexaVal === 12 ? "c" : (hexaVal === 13 ? "d" : (hexaVal === 14 ? "e" : "f")))));
  const str = classValues.reduce((acc, val, ind) => {
    const mod = +val >= 16 ? +val%16 : +val;
    const modRes = hexaCode(mod);
    const dividerRes = hexaCode(+val >= 16 ? (val-mod)/16 : 0);
    return ind === 1 ? `${acc}${dividerRes}${modRes}:`:`${acc}${dividerRes}${modRes}`;
  }, "");
  return ("").concat(compressedv6 ? ":" : "0000:0000:0000:0000:0000", (":ffff:"), str);
}

/**
 * Get IPv4 from IPv6v4 (IPv4 in IPv6).
 *
 * @param ipv6 - IPv6v4
 * @returns IPv4 address
 */
export function fromV6(ipv6: string): string {
  if (!(isIPv6(ipv6) && (["::ffff:", "0000:0000:0000:0000:0000:ffff:", "2002:"]).some(s => ipv6.startsWith(s) && (s === "2002:" ? (ipv6.endsWith("::")) : true)))) throw new Error("Invalid block input");
  let b64: string;
  if (ipv6.startsWith("2002:")) b64 = ipv6.slice(5, -2);
  else if (ipv6.startsWith("::ffff:")) b64 = ipv6.slice(7);
  else b64 = ipv6.slice(30);
  b64 = b64.split(":").join("");
  if (b64.split(".").length === 4 && !(b64.split(".").map(s => parseInt(s)).some(s => !(s >= 0 && s <= 255)))) return b64;
  if (b64.length > 8) throw new Error("invalid ipv4 in ipv6");
  return toString(BigInt(("0x").concat(b64)));
}

/**
 * Returns the next adjacent address.
 * @returns {string}
 */
export function nextIp(ip: string): string {
  return toString(toInt(ip) + 1n);
}

/**
 * Returns the previous adjacent address.
 * @returns {string}
 */
export function previousIp(ip: string): string {
  return toString(toInt(ip) - 1n);
}

export function address(ip: string): string {
  if (!ip || typeof ip === "string" && ip.length < 3) throw new Error("Set IP address");
  ip = ip.split("/")[0];
  if (isIP(ip) === 0) throw new Error("set valid IP address");
  return ip;
}

export function mask(ipCidr: string) {
  if (ipCidr.indexOf("/") === -1) ipCidr = ipCidr.concat("/", toCidr(ipCidr).split("/")[1]);
  const [_ip, _mask] = ipCidr.split("/");
  const mask = BigInt(_mask);
  if (isIP(_ip) === 0) throw new TypeError("Invalid Address");
  else if (mask < 0n || mask > 128n) throw new Error("Invalid Mask");
  else if (isIPv4(_ip) && 32n !< mask) throw new Error("Invalid cidr IPv4 address");
  else if (128n !< mask) throw new Error("Invalid cidr IPv6 address");
  return mask;
}

export function min(cidr: string): string {
  const addr = address((cidr = toCidr(cidr))), addrInt = toInt(addr);
  const div = isIPv4(addr) ? addrInt % 2n ** (32n - mask(cidr)) : addrInt % 2n ^ (128n - mask(cidr));
  return div > 0n ? toString(addrInt - div) : addr;
}

// console.log(max("0:0:0:0:0:01:0:0/64"));

export function max(cidr: string): string {
  let initial: bigint = toInt(min((cidr = toCidr(cidr)))), add = isIPv4(address(cidr)) ? 2n ** (32n - mask(cidr)) : 2n ^ (128n - mask(cidr));
  return toString(initial + add - 1n);
}

/**
 * Check if ip exists in CIDR
 * @param cidr
 * @param ip
 * @returns
 */
export function includes(cidr: string, ip: string): boolean {
  const ipInt = toInt(ip);
  return ipInt >= toInt(min(cidr)) && ipInt <= toInt(max(cidr));
}

/**
 * Get CIDR from ip
 *
 * @param ip - Input ip
 * @returns
 */
export function toCidr(ip: string | bigint): string {
  if (typeof ip === "bigint") ip = toString(ip);
  else if (ip.indexOf("/") !== -1) {
    const mask = BigInt(ip.split("/")[1]);
    if (mask >= 0 && mask <= 128) return ip;
    ip = address(ip);
  }
  let mask = 8, limitMask = isIPv4(ip) ? 32 : 128;
  while (true) {
    if (mask >= limitMask) break;
    mask += 4;
    if (includes(String().concat(ip, "/", String(mask)), ip)) break;
  }
  return min(`${ip}/${mask}`)+"/"+mask;
}