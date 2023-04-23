import { isIP } from "node:net";

export class parseImage {
  /**  Protocol schema example: http, https, docker */
  protocolSchema = "http";

  /** service for scope */
  service?: string = "registry.docker.io";

  /** Get token realm */
  realm?: string = "https://auth.docker.io/token";

  /** Image registry, example: "**registry-1.docker.io**" */
  registry: string = "registry-1.docker.io";

  /** Repository owner */
  readonly owner: string;

  /** Repository name */
  readonly repo: string;

  /** Image tag if informed */
  tag?: string;

  /** target sha256 */
  sha256?: string;

  constructor(image: string) {
    if (typeof image !== "string") throw new TypeError("Required image argument!");
    image = image.trim().toLowerCase()
    const split = image.split("/");
    if (!(split.at(0))) throw new TypeError("Invalid image");
    if (split.length === 1) {
      this.owner = "library";
      this.repo = split.at(0);
      this.protocolSchema = "https";
    } else if (split.length === 2 && !(split.at(0).includes(":") || Boolean(isIP(split.at(0))) || (/^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9]))\.([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/).test(split.at(0)))) {
      this.owner = split.at(0);
      this.repo = split.at(1);
      this.protocolSchema = "https";
    } else {
      this.service = this.realm = undefined;
      this.registry = split.shift();
      this.repo = split.pop();
      this.owner = split.join("/");
    }
    let sha256Index = -1, tagIndex = -1;
    if ((sha256Index = this.repo.indexOf("@")) !== -1) {
      this.sha256 = this.repo.slice(sha256Index+1);
      this.repo = this.repo.slice(0, sha256Index);
    }
    if ((tagIndex = this.repo.indexOf(":")) !== -1) {
      this.tag = this.repo.slice(tagIndex+1);
      this.repo = this.repo.slice(0, tagIndex);
    }
    this.owner||= "";
    Object.defineProperty(this, "owner", {writable: false, value: this.owner});
    Object.defineProperty(this, "repo", {writable: false, value: this.repo});
  }

  getImageURI() {
    let img = `${this.registry}/${this.owner}/${this.repo}`;
    if (this.sha256) img += "@"+this.sha256;
    else if (this.tag) img += ":"+this.tag;
    return img;
  }

  toString() {
    return `${this.owner}/${this.repo}`;
  }
}

/**
 * knownOS is the list of past, present, and future known GOOS values.
 */
export type goSystem = "aix"|"android"|"darwin"|"dragonfly"|"freebsd"|"hurd"|"illumos"|"ios"|"js"|"linux"|"nacl"|"netbsd"|"openbsd"|"plan9"|"solaris"|"wasip1"|"windows"|"zos";

/**
 * knownArch is the list of past, present, and future known GOARCH values.
 */
export type goArch = "386"|"amd64"|"amd64p32"|"arm"|"armbe"|"arm64"|"arm64be"|"loong64"|"mips"|"mipsle"|"mips64"|"mips64le"|"mips64p32"|"mips64p32le"|"ppc"|"ppc64"|"ppc64le"|"riscv"|"riscv64"|"s390"|"s390x"|"sparc"|"sparc64"|"wasm";

const onGo: {arch: {[arch in Exclude<NodeJS.Architecture, goArch>]?: goArch}, platform: {[platform in Exclude<NodeJS.Platform, goSystem>]?: goSystem}} = {
  arch: {
    x64: "amd64",
    ia32: "386",
    mipsel: "mipsle",
  },
  platform: {
    sunos: "solaris",
    win32: "windows",
    cygwin: "windows",
    haiku: undefined,
  }
}

export function nodeToGO<T extends keyof typeof onGo, D = T extends "arch" ? (NodeJS.Architecture) : (NodeJS.Platform)>(target: T, src: D): T extends "arch" ? (goArch) : (goSystem) {
  if (!onGo[target]) throw new TypeError("Select platform or arch!");
  return onGo[target][src as any] ?? src;
}