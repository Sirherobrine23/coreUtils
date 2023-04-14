import { parseImage } from "./image.js";
import http from "@sirherobrine23/http";

export type tokenAction = "pull"|"push";
export interface userAuth {
  /** Username */
  username: string;

  /**
   * Token or Password
   */
  password: string;
};

function basicAuth(username: string, pass?: string) {
  return "Basic "+(Buffer.from(username+(pass ? ":"+pass : "")).toString("base64"));
}

export class Auth {
  #auth: userAuth;
  #image: parseImage;
  #action: tokenAction;
  actionHas(rec: tokenAction) {return this.#action === rec;}

  token: string;
  access_token?: string;
  expires_in?: number;
  issued_at?: string;

  constructor(img: parseImage, tokenAction?: tokenAction, auth?: userAuth) {
    this.#image = img;
    this.#auth = auth;
    if (tokenAction === "push") this.#action = "push";
    else this.#action = "pull";
  }

  /**
   *
   * @param scp - Set custom scope
   * @returns
   */
  async setup(scp?: string) {
    if (this.token) return this;
    if (this.#auth?.username) if (!this.#auth.password) throw new TypeError("required Auth.auth.password to login in registry");
    const headers = await http.jsonRequest(`http://${this.#image.registry}/v2/`).then(d => d.headers).catch(async (err: http.httpCoreError) => err.headers);
    const { owner, repo } = this.#image;
    let auth: string = (headers["www-authenticate"] as any);
    if (typeof auth === "string" && (auth = auth.trim()).length > 0) {
      const scopes = auth.slice(auth.indexOf(" ")).trim().split(",").reduce((acc, data) => {const indexP = data.indexOf("="); if (indexP === -1) return acc; acc[data.slice(0, indexP)] = data.slice(indexP+1).replace(/"(.*)"/, "$1").trim(); return acc;}, {} as {[keyname: string]: string});
      this.#image.realm = scopes.realm;
      this.#image.service = scopes.service;
      // if (scopes.scope) scope = scopes.scope;
    }
    let scope = scp ?? `repository:${owner}/${repo}:${this.#action}`;

    const options: Omit<http.requestOptions, "url"> = {
      query: {
        service: this.#image.service,
        scope
      },
      headers: {
        ...(this.#auth?.username && this.#auth?.password ? {Authorization: basicAuth(this.#auth.username, this.#auth.password)} : {}),
      },
    }

    try {
      const { body: { token, access_token, expires_in, issued_at } } = await http.jsonRequest(this.#image.realm ?? `http://${this.#image.registry}/token`, options).catch((err: http.httpCoreError) => {
        let d: any;
        if (err.body?.details) throw new Error(err.body.details);
        else if (err.body?.errors) if (d = err.body.errors.find(d => !!d.message)?.message) d = new Error(d);
        throw d ?? err;
      });
      this.token = token;
      this.access_token = access_token;
      this.expires_in = expires_in;
      this.issued_at = issued_at;
      if (typeof expires_in === "number" && expires_in >= 1) {
        setTimeout(() => {
          Object.defineProperty(this, "token", {
            configurable: false,
            writable: false,
            value: new TypeError("Token exired"),
          });
        }, expires_in);
      }
    } catch (err) {
      if (err.httpCode !== 404) throw err;
    }

    return this;
  }
}
