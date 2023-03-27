export class parseImage {
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
    } else if (split.length === 2) {
      this.owner = split.at(0);
      this.repo = split.at(1);
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

const onGo = {
  arch: {
    x64: "amd64"
  },
  platform: {
    win32: "windows",
    sunos: "solaris"
  }
}

export function nodeToGO(target: keyof typeof onGo, src: string): string {
  if (!onGo[target]) throw new TypeError("OK Google!");
  return onGo[target][src] ?? src;
}
