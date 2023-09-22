export class M3U extends Map<string, Record<string, string|string[]>> {
  filter(fn: (value: string, index: number, array: string[]) => boolean) {
    return new M3U(Array.from(this.keys()).filter(fn).map(key => [key, this.get(key)]));
  }

  toJSON() {
    return Array.from(this.keys()).reduce<Record<string, string|string[]>>((acc, key) => Object.assign(acc, {[key]: this.get(key)}), {});
  }

  toArray(): ([string, Record<string, string|string[]>])[] {
    return Array.from(this.keys()).map(key => [key, this.get(key)]);
  }

  toString() {
    const vs = this.toArray().map(([url, info]) => Object.keys(info).map(s => {
      const v = info[s];
      return s.concat("=", Array.isArray(v) ? v.map(s => `"${s}"`).join(",") : `"${v}"`);
    }).join(" ").concat("\r\n", url))
    return ("#EXTM3U\r\n").concat(...(vs.map(s => ("#EXTINF:-1 ").concat(s, "\r\n"))));
  }
}

export function parseM3u(src: string) {
  src = src.split("\r\n").join("\n");
  src = src.slice(src.indexOf("\n")).trim();
  if (src.startsWith("#EXT-X-SESSION-DATA")) src = src.slice(src.indexOf("\n")).trim();
  const targets = new M3U();
  while (src.slice(2).indexOf("#EXTINF:") >= 0) {
    let index = src.slice(2).indexOf("#EXTINF:");
    let urlSrc: string;
    if (index == -1) break;
    index += 2;
    let maped = src.slice(0, index);
    const Keys = new Map<string, string|string[]>();
    // Keys.set("line", String(maped));

    [maped, urlSrc] = maped.slice(maped.indexOf(" ")+1).trim().split("\n").reduce<[string, string]>((acc, key) => [acc[0]+acc[1], key], ["", ""]);
    while(maped.indexOf("=") != -1) {
      const k = maped.indexOf("=");
      const keyName = maped.slice(0, k);
      let value = (maped = maped.slice(k+1)).trim();
      if (maped.indexOf("=") > 0) {
        const nk = maped.indexOf("=");
        const vk = maped.slice(0, nk).lastIndexOf(" ");
        value = maped.slice(0, vk).trim();
        maped = maped.slice(vk+1);
      }
      let start = 0, end: number;
      if (value.startsWith("\"")) start = 1;
      if (value.endsWith("\"")) end = -1;
      value = value.slice(start, end);
      if (Keys.has(keyName)) value.concat(",", Keys.get(keyName) as string);
      Keys.set(keyName, value);
    }
    for (const key of Keys.keys()) {
      const value = Keys.get(key);
      if (Array.isArray(value)) continue;
      Keys.set(key, value.indexOf(",") === -1 ? value : value.split(",").map(value => {
        let start = 0, end: number;
        if (value.startsWith("\"")) start = 1;
        if (value.endsWith("\"")) end = -1;
        value = value.slice(start, end);
        return value;
      }));
    }
    targets.set(urlSrc.trim(), Array.from(Keys.keys()).reduce<Record<string, string>>((acc, key) => Object.assign(acc, {[key]: Keys.get(key)}), {}));

    src = src.slice(index+1);
  }

  return targets;
}