export class parseImage {
  /** Image registry, example: "**registry-1.docker.io**" */
  registry: string = "registry.hub.docker.com";

  /** Auth endpoint */
  authBase?: string = "auth.docker.io";

  /** Auth service for scope */
  authService?: string = "registry.docker.io";

  /** Repository owner */
  owner: string = "library";

  /** Repository name */
  repo: string;

  /** Image tag if informed */
  tag?: string;

  /** target sha256 */
  sha256?: string;

  constructor(image: string) {
    if (typeof image !== "string") throw new TypeError("Required image argument!");
    image = image.trim().toLowerCase()
    const dockerImageRegex = /^(([a-z0-9\._\-]+(:([0-9]+))?)\/)?(([a-z0-9\._\-]+)\/)?([a-z0-9\._\-\/:]+)(@(sha256:\S+|\S+|))?$/;
    if (!dockerImageRegex.test(image)) throw new TypeError("Invalid image format");
    let tag: string, [,, registry,,,, owner, imageName,, sha256] = image.match(dockerImageRegex);
    const tagImage = /:([\w\S]+)$/;
    if (tagImage.test(imageName)) {
      const [, newtag] = imageName.match(tagImage);
      tag = newtag;
      imageName = imageName.replace(tagImage, "");
    }

    // fix owner
    if (!owner && !!registry) {
      owner = registry;
      registry = undefined;
    }

    if (!!((registry ?? "").trim())) {
      this.registry = registry;
      this.authService = this.authBase = undefined;
    }
    if (owner) this.owner = owner;
    this.repo = imageName;
    this.tag = tag
    this.sha256 = sha256;
  }

  getRepo() {
    return `${this.owner}/${this.repo}`;
  }
  toString() {
    return `${this.registry}/${this.owner}/${this.repo}`;
  }
}