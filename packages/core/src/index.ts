export * as Ar from "@sirherobrine23/ar";
export * as http from "@sirherobrine23/http";
export * as Extends from "@sirherobrine23/extends";
export * as Debian from "@sirherobrine23/debian";
export * as Cloud from "@sirherobrine23/cloud";
export * as Docker from "@sirherobrine23/docker-registry/src/exp.js";

export function parseM3U(fileData: string) {
  fileData = fileData.replace(/\r\n/gm, "\n").replace("#EXTM3U", "").trim();
  const lines = fileData.split(/^#EXT[A-Z]+:/gm).filter(Boolean);
  return lines.map(data => {
    const url = data.split("\n").find(line => line.trim().startsWith("http"))?.trim();
    const channelInfo: Record<string, any> = {};
    const info = data.split("\n")[0]?.trim()?.replace(/^[0-9\-]+\s/, "") ?? "";
    if (!info) return null;
    let latestKey: string;
    info.split(" ").forEach((item) => {
      if (item.includes("=")) {
        const [key, value] = item.split("=");
        channelInfo[key] = value;
        latestKey = key;
      } else {
        channelInfo[latestKey] += " " + item;
      }
    });
    Object.keys(channelInfo).forEach(key => {
      let keyData = channelInfo[key].replace(/"/g, "").trim();
      if (keyData.includes(",")) keyData = keyData.split(",");
      if (!keyData) delete channelInfo[key];
      else channelInfo[key] = keyData;
    });

    return {
      URL: new URL(url),
      url: url,
      channelInfo
    };
  }).filter(Boolean);
}

// Mongo notation
type NestedPaths<Type, Depth extends number[]> = Depth['length'] extends 8 ? [] : Type extends string | number | boolean | Date | RegExp | Buffer | Uint8Array | ((...args: any[]) => any)  ? [] : Type extends ReadonlyArray<infer ArrayType> ? [] | [number, ...NestedPaths<ArrayType, [...Depth, 1]>] : Type extends Map<string, any> ? [string] : Type extends object ? {
  [Key in Extract<keyof Type, string>]: Type[Key] extends Type ? [Key] : Type extends Type[Key] ? [Key] : Type[Key] extends ReadonlyArray<infer ArrayType> ? Type extends ArrayType ? [Key] : ArrayType extends Type ? [Key] : [
  Key,
  ...NestedPaths<Type[Key], [...Depth, 1]>
  ] : // child is not structured the same as the parent
  [
  Key,
  ...NestedPaths<Type[Key], [...Depth, 1]>
  ] | [Key];
}[Extract<keyof Type, string>] : [];

type Join<T extends unknown[], D extends string> = T extends [] ? "" : T extends [string | number] ? `${T[0]}` : T extends [string | number, ...infer R] ? `${T[0]}${D}${Join<R, D>}` : string

export type objectNotation<T> = {
[Property in Join<NestedPaths<T, []>, ".">]: Property extends keyof T ? T[Property] : never
};

/**
* Remove dot notation from object
*
* @param notationObj - Notation object
* @returns Object without notation
*/
export function notationToObject(notationObj: any): any {
const obj: any = {};
for (const key in notationObj) {
  let currentObj = obj;
  const keys = key.split(".");
  for (let i = 0; i < keys.length; i++) {
    if (i === keys.length - 1) currentObj[keys[i]] = notationObj[key];
    else {
      currentObj[keys[i]] ??= {};
      currentObj = currentObj[keys[i]];
    }
  }
}
return obj;
}

/**
* Add notation to object
*
* @param obj - Object
* @returns Notation object
*/
export function objectToNotation<T>(obj: T): objectNotation<T> {
const notationObj: any = {};
function recursive(obj: any, notationObj: any, path: string) {
  for (const key in obj) {
    if (typeof obj[key] === "object") recursive(obj[key], notationObj, path + key + ".");
    else notationObj[path + key] = obj[key];
  }
}
recursive(obj, notationObj, "");
return notationObj;
}