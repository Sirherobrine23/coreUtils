import { OptionsOfBufferResponseBody, OptionsOfJSONResponseBody, OptionsOfTextResponseBody, Request, Response } from "got";
import { extendStream } from "@sirherobrine23/extends";
import * as main from "./main.js";
import path from "path";

export interface Release {
  id: number,
  tag_name: string,
  target_commitish: string,
  name: string,
  body: string,
  url: string,
  html_url: string,
  tarball_url: string,
  zipball_url: string,
  upload_url: string,
  draft: boolean,
  prerelease: boolean,
  created_at: string,
  published_at: string,
  author: {
    active: boolean,
    avatar_url: string,
    created: string,
    description: string,
    email: string,
    followers_count: number,
    following_count: number,
    full_name: string,
    id: number,
    is_admin: boolean,
    language: string,
    last_login: string,
    location: string,
    login: string,
    login_name: any,
    prohibit_login: boolean,
    restricted: boolean,
    starred_repos_count: number,
    visibility: string,
    website: string
  },
  assets: {
    id: number,
    name: string,
    size: number,
    download_count: number,
    created_at: string,
    uuid: string,
    browser_download_url: string
  }[];
};

export interface User {
  "id": number;
  "login": string;
  "username": string;
  "login_name": string;
  "full_name": string;
  "email": string;
  "avatar_url": string;
  "language": string;
  "is_admin": boolean;
  "last_login": string;
  "created": string;
  "restricted": boolean;
  "active": boolean;
  "prohibit_login": boolean;
  "location": string;
  "website": string;
  "description": string;
  "visibility": "public"|"private";
  "followers_count": number;
  "following_count": number;
  "starred_repos_count": number;
}

export interface Org {
  "id": number,
  "name": string,
  "full_name": string,
  "email": string,
  "avatar_url": string,
  "description": string,
  "website": string,
  "location": string,
  "visibility": "public"|"private"|"internal",
  "repo_admin_change_team_access": boolean,
  "username": string
}

export class ReleaseManeger extends Map<string, Omit<Release["assets"][number], "name">> {
  readonly id: number;
  readonly created_at: string;
  readonly author: Release["author"];
  Gitea: Gitea;

  upload_url: string;
  tag_name: string;
  name: string;
  html_url: string;
  tarball_url: string;
  zipball_url: string;
  target_commitish: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string;
  url: string;
  body: string;
  constructor(rel: Release) {
    super();
    this.id = rel.id;
    this.created_at = rel.created_at;
    this.author = Object.freeze(rel.author);
    Object.defineProperty(this, "id", { configurable: false, enumerable: false, writable: false });
    Object.defineProperty(this, "created_at", { configurable: false, enumerable: false, writable: false });
    Object.defineProperty(this, "author", { configurable: false, enumerable: false, writable: false });

    this.upload_url = rel.upload_url;
    this.tag_name = rel.tag_name;
    this.name = rel.name;
    this.html_url = rel.html_url;
    this.tarball_url = rel.tarball_url;
    this.zipball_url = rel.zipball_url;
    this.target_commitish = rel.target_commitish;
    this.draft = rel.draft;
    this.prerelease = rel.prerelease;
    this.published_at = rel.published_at;
    this.url = rel.url;
    this.body = rel.body;

    rel.assets.forEach((s) => this.set(s.name, { id: s.id, size: s.size, download_count: s.download_count, created_at: s.created_at, uuid: s.uuid, browser_download_url: s.browser_download_url }));
  }

  uploadAsset(name: string) {
    const root = new URL(this.upload_url), token = this.Gitea.token;
    let str: Request;
    return new extendStream.Writable({
      autoDestroy: true, emitClose: true,
      async write(chunk, encoding, callback) {
        if (!str) {
          root.searchParams.set("name", name);
          str = main.got(root, {
            isStream: true,
            method: "POST",
            headers: {
              Authorization: String().concat("token ", token),
              "Content-Type": "application/octet-stream"
            },
          });
          str.write(Buffer.from(chunk, encoding), "binary", callback);
          return;
        }
        str.write(Buffer.from(chunk, encoding), "binary", callback);
      },
      final(callback) {
        if (str) return str.end(callback);
        return callback();
      },
    });
  }

  getAsset(name: string) {
    if (!(this.has(name))) throw new Error("File not exists");
    const i = new URL(this.upload_url);
    return main.got(new URL(path.posix.join(i.pathname, String(this.get(name).id)), i), {
      isStream: true,
      method: "GET",
      headers: {
        Authorization: String().concat("token ", this.Gitea.token)
      },
    });
  }

  async deleteAsset(name: string) {
    if (!(this.has(name))) throw new Error("File not exists");
    const i = new URL(this.upload_url);
    await main.got(new URL(path.posix.join(i.pathname, String(this.get(name).id)), i), {
      method: "DELETE",
      headers: {
        Authorization: String().concat("token ", this.Gitea.token)
      },
    });
  }
}

export class Gitea {
  #rootUrl: URL;
  get url(): URL { return new URL(this.#rootUrl); }
  set url(gurl: string|URL) {
    this.#rootUrl = new URL(gurl);
    if (!(this.#rootUrl.pathname.startsWith("/api"))) this.#rootUrl.pathname = "/api/v1";
  }

  /** Authentication for certain routes */
  token?: string;

  /**
   * Crie uma instancia para API do gitea
   *
   * exemplo: `https://git.example.com/api`
   */
  constructor(giteaUrl?: string|URL) {
    this.url = giteaUrl||"https://gitea.com/api";
  }

  async asyncRequest<T = any>(url: string|URL, options?: OptionsOfTextResponseBody|OptionsOfJSONResponseBody|OptionsOfBufferResponseBody): Promise<Response<T>> {
    return main.got(url, options) as any;
  }

  /**
   * get all user's info
   * @param user - Username/nick name
   * @returns
   */
  async getUser(): Promise<User[]>;
  /**
   * get user info
   * @param user - Username/nick name
   * @returns
   */
  async getUser(user: string): Promise<User>;
  async getUser(user?: string) {
    if (typeof user === "string" && user.length >= 1) return this.asyncRequest<User>(new URL(path.posix.join(this.#rootUrl.pathname, "v1/users", user), this.#rootUrl), {
      responseType: "json",
      headers: {
        ...(typeof this.token === "string" ? { Authorization: String().concat("token ", this.token), } : {}),
      }
    }).then(s => s.body);

    let run = false, users: User[] = [];
    const pageUrl = new URL(path.posix.join(this.#rootUrl.pathname, "v1/users/search"), this.#rootUrl);
    do {
      run = false;
      const data = await this.asyncRequest<{ ok: boolean, data: User[] }>(pageUrl, { responseType: "json", headers: { ...(typeof this.token === "string" ? { Authorization: String().concat("token ", this.token), } : {}), } });
      if (data.body.ok) {
        users = users.concat(data.body.data);
      }
    } while (run);

    return users;
  }

  async getOrg(user?: string) {
    if (typeof user === "string" && user.length >= 1) return this.asyncRequest<Org>(new URL(path.posix.join(this.#rootUrl.pathname, "v1/orgs", user), this.#rootUrl), {
      responseType: "json",
      headers: {
        ...(typeof this.token === "string" ? { Authorization: String().concat("token ", this.token), } : {}),
      }
    }).then(s => s.body);

    let run = false, orgs: Org[] = [];
    const pageUrl = new URL(path.posix.join(this.#rootUrl.pathname, "v1/orgs"), this.#rootUrl);
    do {
      run = false;
      const data = await this.asyncRequest<Org[]>(pageUrl, { responseType: "json", headers: { ...(typeof this.token === "string" ? { Authorization: String().concat("token ", this.token), } : {}), } });
      orgs = orgs.concat(data.body);
    } while (run);

    return orgs;
  }

  async createRelease(owner: string, repo: string, tagName: string, options?: { body?:	string, draft?:	boolean, name?:	string, prerelease?:	boolean, target_commitish?:	string }) {
    if (!options) options = {};
    const pageUrl = new URL(path.posix.join(this.#rootUrl.pathname, "v1/repos", owner, repo, "releases"), this.#rootUrl);
    const d = await this.asyncRequest<Release>(pageUrl, {
      method: "POST",
      responseType: "json",
      headers: { Authorization: String().concat("token ", this.token), },
      json: {
        tag_name:	tagName,
        name:	options?.name,
        body:	options?.body,
        draft: options?.draft,
        prerelease:	options?.prerelease,
        target_commitish:	options?.target_commitish
      }
    });
    return new ReleaseManeger(d.body);
  }

  async getRelease(owner: string, repo: string, tagName: string|number) {
    const pageUrl = new URL(path.posix.join(this.#rootUrl.pathname, "v1/repos", owner, repo, "releases", String(tagName)), this.#rootUrl);
    const d = await this.asyncRequest<Release>(pageUrl, {
      method: "GET",
      responseType: "json",
      headers: { Authorization: String().concat("token ", this.token), },
    });
    return new ReleaseManeger(d.body);
  }
}