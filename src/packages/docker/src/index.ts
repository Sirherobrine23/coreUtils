export * from "./utils.js";

const ARCH_GO_NODE: {[arch in NodeJS.Architecture]?: string} = {
  x64: "amd64",
};
const OS_GO_NODE: {[platform in NodeJS.Platform]?: string} = {
  win32: "windows",
  sunos: "solaris"
};

export function getGoArch(arch = process.arch): string {
  return ARCH_GO_NODE[arch] ?? process.arch;
}
export function getGoOS(platform = process.platform): string {
  return OS_GO_NODE[platform] ?? process.platform;
}