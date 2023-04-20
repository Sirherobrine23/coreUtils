import { parseImage } from "./image.js";
import stream from "node:stream";
import path from "node:path";
import http from "@sirherobrine23/http";

export type tokenAction = "pull"|"push"|"pull,push";
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
  constructor (public img: parseImage, auth?: userAuth) {
    if (auth) this.#auth = auth;
  }
  setAuth(auth: userAuth) {
    if (!(auth.username && auth.password)) throw new Error("Set valid auth");
    this.#auth = auth;
    return this;
  }

  #act: tokenAction = "pull";
  setAction(act: tokenAction) {
    if (act !== this.#act) this.access_token = this.expires_in = this.issued_at = this.token = undefined;
    if (act === "pull,push") this.#act = "pull,push";
    else if (act === "push") this.#act = "push";
    else this.#act = "pull";
    return this;
  }

  has(act: tokenAction) {
    return this.#act === act;
  }

  token: string;
  access_token?: string;
  expires_in?: number;
  issued_at?: string;

  #setScope(www: string) {
    www = www.slice(www.indexOf(" ")).trim();
    const scopes: {[keyname: string]: string} = {};
    while (www.length > 0) {
      let indexOf: number;
      if ((indexOf = www.indexOf("=")) !== -1) {
        const key = www.slice(0, indexOf);
        www = www.slice(indexOf+1);
        if (www.indexOf("\",") !== -1) {
          scopes[key] = www.slice(1, www.indexOf("\",")+1);
          www = www.slice(www.indexOf("\",")+2);
        } else {
          scopes[key] = www;
          www = "";
        }
        if (scopes[key].endsWith("\"")) scopes[key] = scopes[key].slice(0, scopes[key].length -1);
        if (scopes[key].startsWith("\"")) scopes[key] = scopes[key].slice(1);
      }
    }
    this.img.realm = scopes.realm;
    this.img.service = scopes.service;
    return scopes;
  }

  async request(requestConfig: Omit<http.requestOptions, "body"|"url"> & {reqPath: string|(string[]), body?: () => any|Promise<any>}, scope?: string): Promise<http.dummyRequestResponse<stream.Readable>> {
    let req: http.dummyRequestResponse;
    while (true) {
      req = await http.dummyRequest({
        ...requestConfig,
        body: typeof requestConfig.body === "function" ? requestConfig.body() : undefined,
        url: new URL(typeof requestConfig.reqPath === "string" ? requestConfig.reqPath : path.posix.join(...requestConfig.reqPath), `${this.img.protocolSchema}://${this.img.registry}`),
        headers: {
          ...requestConfig.headers,
          ...(typeof this.token === "string" ? {Authorization: "Bearer "+this.token} : {}),
        },
      });
      if (!(req.statusMessage === "write EPIPE" || req.statusMessage === "Cannot call end after a stream was finished")) break;
    }
    if (req.url) this.img.protocolSchema = (new URL(req.url)).protocol.replace(":", "");

    if (req.statusCode === 401) {
      scope ||= `repository:${this.img.owner}/${this.img.repo}:${this.#act}`;
      if (typeof req.headers["www-authenticate"] === "string") {
        const scopes = this.#setScope(req.headers["www-authenticate"]);
        if (scopes.scope) {
          this.access_token = this.expires_in = this.issued_at = this.token = undefined;
          scope = scopes.scope;
        }
      }
      const realme = new URL(this.img.realm || new URL("/token", req.url));
      let auth: http.dummyRequestResponse;
      while (true) {
        auth = await http.jsonDummyRequest({
          url: realme,
          query: {
            service: this.img.service,
            scope
          },
          headers: {
            ...(this.#auth?.username && this.#auth?.password ? {Authorization: basicAuth(this.#auth.username, this.#auth.password)} : {}),
          }
        });
        if (!(auth.statusMessage === "write EPIPE" || auth.statusMessage === "Cannot call end after a stream was finished")) break;
      }

      if (auth.statusCode !== 200) throw auth;
      if (!auth.body.token) throw new Error("Cannot get token!");
      this.token = auth.body.token;
      const { access_token, expires_in, issued_at } = auth.body;
      this.access_token = access_token;
      this.expires_in = expires_in;
      this.issued_at = issued_at;
      if (typeof expires_in === "number" && expires_in >= 1) setTimeout(() => this.token = undefined, expires_in);
      while (true) {
        req = await http.dummyRequest({
          ...requestConfig,
          body: typeof requestConfig.body === "function" ? requestConfig.body() : undefined,
          url: new URL(typeof requestConfig.reqPath === "string" ? requestConfig.reqPath : path.posix.join(...requestConfig.reqPath), `${this.img.protocolSchema}://${this.img.registry}`),
          headers: {
            ...requestConfig.headers,
            Authorization: "Bearer "+(/*this.access_token||*/this.token),
          },
        });
        if (!(req.statusMessage === "write EPIPE" || req.statusMessage === "Cannot call end after a stream was finished")) break;
      }
      if (req.url) this.img.protocolSchema = (new URL(req.url)).protocol.replace(":", "");
    }

    if (req.statusCode === 401) {
      this.access_token = this.expires_in = this.issued_at = this.token = undefined;
      if (typeof req.headers["www-authenticate"] === "string") {
        const scopes = this.#setScope(req.headers["www-authenticate"]);
        if (scopes.scope) scope = scopes.scope;
      }
      return this.request(requestConfig, scope);
    }

    return req;
  }

  async requestJSON<T = any>(requestConfig: Omit<http.requestOptions, "body"|"url"> & {reqPath: string|(string[]), body?: () => any|Promise<any>}, scope?: string): Promise<http.dummyRequestResponse<T>> {
    let req: http.dummyRequestResponse;
    while (true) {
      req = await http.jsonDummyRequest({
        ...requestConfig,
        body: typeof requestConfig.body === "function" ? requestConfig.body() : undefined,
        url: new URL(typeof requestConfig.reqPath === "string" ? requestConfig.reqPath : path.posix.join(...requestConfig.reqPath), `${this.img.protocolSchema}://${this.img.registry}`),
        headers: {
          ...requestConfig.headers,
          ...(typeof this.token === "string" ? {Authorization: "Bearer "+this.token} : {}),
        },
      });
      if (!(req.statusMessage === "write EPIPE" || req.statusMessage === "Cannot call end after a stream was finished")) break;
    }
    if (req.url) this.img.protocolSchema = (new URL(req.url)).protocol.replace(":", "");

    if (req.statusCode === 401) {
      scope ||= `repository:${this.img.owner}/${this.img.repo}:${this.#act}`;
      if (typeof req.headers["www-authenticate"] === "string") {
        const scopes = this.#setScope(req.headers["www-authenticate"]);
        if (scopes.scope) {
          this.access_token = this.expires_in = this.issued_at = this.token = undefined;
          scope = scopes.scope;
        }
      }
      const realme = new URL(this.img.realm || new URL("/token", req.url));
      let auth: http.dummyRequestResponse;
      while (true) {
        auth = await http.jsonDummyRequest({
          url: realme,
          query: {
            service: this.img.service,
            scope
          },
          headers: {
            ...(this.#auth?.username && this.#auth?.password ? {Authorization: basicAuth(this.#auth.username, this.#auth.password)} : {}),
          }
        });
        if (!(auth.statusMessage === "write EPIPE" || auth.statusMessage === "Cannot call end after a stream was finished")) break;
      }

      if (auth.statusCode !== 200) throw auth;
      if (!auth.body.token) throw new Error("Cannot get token!");
      this.token = auth.body.token;
      const { access_token, expires_in, issued_at } = auth.body;
      this.access_token = access_token;
      this.expires_in = expires_in;
      this.issued_at = issued_at;
      if (typeof expires_in === "number" && expires_in >= 1) setTimeout(() => this.token = undefined, expires_in);
      while (true) {
        req = await http.jsonDummyRequest({
          ...requestConfig,
          body: typeof requestConfig.body === "function" ? requestConfig.body() : undefined,
          url: new URL(typeof requestConfig.reqPath === "string" ? requestConfig.reqPath : path.posix.join(...requestConfig.reqPath), `${this.img.protocolSchema}://${this.img.registry}`),
          headers: {
            ...requestConfig.headers,
            Authorization: "Bearer "+(/*this.access_token||*/this.token),
          },
        });
        if (!(req.statusMessage === "write EPIPE" || req.statusMessage === "Cannot call end after a stream was finished")) break;
      }
      if (req.url) this.img.protocolSchema = (new URL(req.url)).protocol.replace(":", "");
    }

    // Try again
    if (req.statusCode === 401) {
      this.access_token = this.expires_in = this.issued_at = this.token = undefined;
      if (typeof req.headers["www-authenticate"] === "string") {
        const scopes = this.#setScope(req.headers["www-authenticate"]);
        if (scopes.scope) scope = scopes.scope;
      }
      return this.requestJSON<T>(requestConfig, scope);
    }

    return req;
  }
}