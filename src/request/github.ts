import { createReadStream, ReadStream as fsReadStream } from "node:fs";
import { fetchJSON, fetchJSONRaw, responseError, gotRequestError } from "./simples.js";
import { Octokit } from "octokit";
import { homedir } from "node:os";
import { format } from "node:util";
import stream from "node:stream";
import yaml from "yaml";
import path from "node:path";
import fs from "node:fs/promises";
export type rateLimitObject = Awaited<ReturnType<Octokit["rest"]["rateLimit"]["get"]>>["data"];
export type githubRelease = Awaited<ReturnType<Octokit["rest"]["repos"]["listReleases"]>>["data"][number];
export type branchInfo = Awaited<ReturnType<Octokit["rest"]["repos"]["listBranches"]>>["data"][number];
export type braches = Awaited<ReturnType<Octokit["rest"]["repos"]["listBranchesForHeadCommit"]>>["data"][number];
export type tagObject = Awaited<ReturnType<Octokit["rest"]["repos"]["listTags"]>>["data"][number];

export type githubTree = {
  sha: string,
  url: string,
  truncated: boolean,
  tree: {
    path: string,
    mode: string,
    sha: string,
    url: string
  }&({
    type: "blob",
    size: number,
  }|{
    type: "tree",
  })[],
};

async function cliToken(): Promise<string|undefined> {
  if (process.env.GITHUB_SECRET) return process.env.GITHUB_SECRET;
  else if(process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  else if (process.platform === "win32") {
    const state = path.join(homedir(), "AppData", "Roaming", "GitHub CLI", "hosts.yml");
    try {
      const file = yaml.parse(await fs.readFile(state, "utf8"));
      if (file?.github?.token) {
        console.warn("Github token from Github CLI");
        return file.github.token;
      }
      else if (file["github.com"]?.oauth_token) {
        console.warn("Github token from Github CLI");
        return file["github.com"].oauth_token;
      }
    } catch {}
  } else {
    const state = path.join(homedir(), ".config/gh/hosts.yml");
    try {
      const file = yaml.parse(await fs.readFile(state, "utf8"));
      if (file?.github?.token) {
        console.warn("Github token from Github CLI");
        return file.github.token;
      }
      else if (file["github.com"]?.oauth_token) {
        console.warn("Github token from Github CLI");
        return file["github.com"].oauth_token;
      }
    } catch {}
  }
  return undefined;
}
export const github_secret = await cliToken();

export async function rateLimit(token?: string) {
  token = token||github_secret;
  const rate = await fetchJSON<rateLimitObject>({
    url: "https://api.github.com/rate_limit",
    headers: token?{Authorization: `token ${token}`}:{}
  });
  if (rate.rate.remaining === 0) throw new Error(format("Github API max requests, reset at %s", new Date(rate.rate.reset*1000).toLocaleString()));
  return rate;
}

export type releaseOptions = {
  secret?: string,
  owner: string,
  repo: string,
  tagName: string,
  name?: string,
  prerelease?: boolean,
  /** Create release if not exists */
  draft?: boolean,
  createReleaseIfNotExists?: boolean,
  target_commitish?: string,
  releaseDescribe?: string,
  generateReleaseNotes?: boolean
};

export type releaseOptionsUpload = {
  /*** File name */
  name: string,
  /*** file path or Readable stream */
  content: string|{
    fileSize: number,
    stream: stream.Readable|fsReadStream,
  }
};

export default GithubManeger;
/**
 * All functions in one function
 * @param owner - Repository owner
 * @param repository - Repository name
 * @param token - Github token (optional)
 * @returns
 */
export async function GithubManeger(owner: string, repository: string, token: string = github_secret) {
  const baseRepos = new URL("https://api.github.com/repos/");
  baseRepos.pathname = path.posix.join(baseRepos.pathname, owner, repository);
  await fetchJSON(baseRepos).catch(err => {
    if (err instanceof gotRequestError) {
      const rateReset = Number(err.response?.headers["x-ratelimit-reset"]);
      if (err.response?.statusCode === 404) throw new Error(`Repository ${owner}/${repository} not found`);
      else if (err.response?.statusCode === 401) throw new Error("Github token is invalid");
      else if (err.response?.statusCode === 403) throw new Error(format("Github API max requests. Reset at %s", new Date(rateReset * 1000).toLocaleString()));
    } else if (err instanceof responseError) {
      const rateReset = Number(err.headers?.["x-ratelimit-reset"]);
      if (err.code === 404) throw new Error(`Repository ${owner}/${repository} not found`);
      else if (err.code === 401) throw new Error("Github token is invalid");
      else if (err.code === 403) throw new Error(format("Github API max requests. Reset at %s", new Date(rateReset * 1000).toLocaleString()));
    }
    throw err;
  })
  const octokit = new Octokit({auth: token});

  /**
   * Get all branches lists
   * @returns
   */
  async function branchList() {
    const url = new URL(baseRepos);
    url.pathname = path.posix.join(url.pathname, "branches");
    const branchList: braches[] = [];
    let etag: string;
    let next = 1;
    while (true) {
      if (next <= 0) break;
      url.searchParams.set("page", String(next++));
      try {
        const { data, headers } = await fetchJSONRaw<braches[]>(url, {
          headers: {
            ...(token ? {Authorization: `token ${token}`} : {}),
            ...(etag ? { "If-None-Match": etag, etag } : {}),
            Accept: "application/vnd.github.v3+json",
          }
        });
        if (data.length === 0) break;
        branchList.push(...data);
        if (Number(headers["x-ratelimit-remaining"]) < 1) {
          console.warn("Github API max requests. Reset at %s", new Date(Number(headers["x-ratelimit-reset"]) * 1000).toLocaleString());
          break;
        }
      } catch {
        next = 0;
      }
    }
    return branchList;
  }

  /**
   * Get brancher info
   * @param branch - Branch name
   * @returns
   */
  async function getBranchInfo(branch: string) {
    const url = new URL(baseRepos);
    url.pathname = path.posix.join(url.pathname, "branches", branch);
    return fetchJSON<branchInfo>(url, {headers: token?{Authorization: `token ${token}`}:{}});
  }

  async function trees(tree: string) {
    const requestURL = new URL(baseRepos);
    requestURL.pathname = path.posix.join(requestURL.pathname, "git", "trees", tree);
    requestURL.searchParams.set("recursive", "true");
    return fetchJSON<githubTree>(requestURL, {headers: token?{Authorization: `token ${token}`}:{}}).catch(() => null);
  }

  async function tags() {
    const requestURL = new URL(baseRepos);
    requestURL.pathname = path.posix.join(requestURL.pathname, "tags");
    const tags: tagObject[] = [];
    let etag: string;
    let next = 1;
    while (true) {
      if (next <= 0) break;
      requestURL.searchParams.set("page", String(next++));
      try {
        const { data, headers } = await fetchJSONRaw<tagObject[]>(requestURL, {
          headers: {
            ...(token ? {Authorization: `token ${token}`} : {}),
            ...(etag ? { "If-None-Match": etag, etag } : {}),
            Accept: "application/vnd.github.v3+json",
          }
        });
        if (data.length === 0) break;
        tags.push(...data);
        if (Number(headers["x-ratelimit-remaining"]) < 1) {
          console.warn("Github API max requests. Reset at %s", new Date(Number(headers["x-ratelimit-reset"]) * 1000).toLocaleString());
          break;
        }
      } catch {
        next = 0;
      }
    }
    return tags;
  }

  /**
   * Get all releases lists
   */
  async function getRelease(): Promise<githubRelease[]>;
  /**
   * Get release info by tag
   * @param releaseTag - Release tag or `true`/`false` value to get latest release
   */
  async function getRelease(releaseTag: string|boolean): Promise<githubRelease>;
  async function getRelease(releaseTag?: string|boolean): Promise<githubRelease|githubRelease[]> {
    const requestURL = new URL(baseRepos);
    requestURL.pathname = path.posix.join(requestURL.pathname, "releases");
    if (typeof releaseTag === "string"||typeof releaseTag === "boolean") {
      if (typeof releaseTag === "boolean") requestURL.pathname = path.posix.join(requestURL.pathname, "latest");
      else requestURL.pathname = path.posix.join(requestURL.pathname, "tags", releaseTag);
      return fetchJSON<githubRelease>(requestURL, {headers: token?{Authorization: `token ${token}`}:{}}).catch(() => null);
    }
    requestURL.searchParams.set("per_page", "99");
    const releaseList: githubRelease[] = [];
    let next = 1;
    let etag: string;
    while (next >= 1) {
      if (next <= 0) break;
      requestURL.searchParams.set("page", String(next));
      try {
        const { data, headers } = await fetchJSONRaw<githubRelease[]>(requestURL, {
          headers: {
            ...(token?{Authorization: `token ${token}`}:{}),
            ...(etag ? { "If-None-Match": etag, etag } : {}),
            Accept: "application/vnd.github.v3+json",
          }
        });
        etag = headers.etag as string;
        if (data.length === 0) break;
        releaseList.push(...data);
        if (Number(headers["x-ratelimit-remaining"]) < 1) {
          console.warn("Github API max requests. Reset at %s", new Date(Number(headers["x-ratelimit-reset"]) * 1000).toLocaleString());
          break;
        }
        const { link } = headers;
        if (link) {
          const linkData = (typeof link === "string" ? link : link[0]).split(",").map(i => i.trim()).map(i => {
            let [url, rel = ""] = i.split(";").map(i => i.trim());
            if (url.startsWith("<") && url.endsWith(">")) url = url.slice(1, -1);
            if (rel.startsWith("rel=")) rel = rel.slice(4);
            if (rel.startsWith('"') && rel.endsWith('"')) rel = rel.slice(1, -1);
            return {
              rel,
              url: new URL(url),
            };
          });
          const nextUrl = linkData.find(i => i.rel === "next");
          if (nextUrl) {
            const { url } = nextUrl;
            next = Number(url.searchParams.get("page"));
          }
        } else next++;
      } catch {
        next = 0;
      }
    }
    return releaseList;
  }

  async function releaseManeger(options: {tagName: string, name?: string, body?: string, isPrerelease?: boolean}) {
    let Release: githubRelease = await getRelease(options.tagName).catch(() => null);
    if (!Release) Release = await octokit.rest.repos.createRelease({
      owner,
      repo: repository,
      tag_name: options.tagName,
      name: options.name,
      body: options.body,
      prerelease: options.isPrerelease
    }).then(res => res.data as githubRelease);

    /** List release assets files */
    async function listFiles() {
      return (await octokit.rest.repos.listReleaseAssets({
        owner,
        repo: repository,
        release_id: Release.id,
        per_page: 100
      })).data as githubRelease["assets"];
    }

    /** Delete release with node_id */
    async function deleteFile(node_id: number): Promise<void>;
    /** find release assets file and delete if exists */
    async function deleteFile(file_name: string): Promise<void>;
    async function deleteFile(id_name: number|string): Promise<void> {
      if (typeof id_name === "string") id_name = (await listFiles()).find(file => file.name === id_name)?.node_id;
      if (!id_name) throw new Error("No id or file name");
      await octokit.rest.repos.deleteReleaseAsset({
        owner,
        repo: repository,
        asset_id: id_name as number
      });
    }

    /** Upload file to release */
    async function uploadFile(uploadConfig: releaseOptionsUpload) {
      if (!uploadConfig) throw new Error("Require");
      // Delete if exists
      if ((await listFiles()).some(data => data.name === uploadConfig.name)) await deleteFile(uploadConfig.name);
      if (typeof uploadConfig.content === "string") {
        const fileSize = (await fs.lstat(uploadConfig.content)).size;
        uploadConfig.content = {
          fileSize,
          stream: createReadStream(uploadConfig.content)
        }
      }
      return (await octokit.rest.repos.uploadReleaseAsset({
        owner,
        repo: repository,
        release_id: Release.id,
        name: uploadConfig.name,
        data: uploadConfig.content.stream as any,
        headers: {"content-length": uploadConfig.content.fileSize},
        mediaType: {
          format: "application/octet-stream"
        },
      })).data;
    }

    return {
      uploadFile,
      deleteFile,
      listFiles
    };
  }

  return {
    branchList,
    getBranchInfo,
    trees,
    getRelease,
    tags,
    releaseManeger,
  };
}