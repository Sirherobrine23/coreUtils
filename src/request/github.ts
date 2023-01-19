import { createReadStream, ReadStream as fsReadStream } from "node:fs";
import { getOctokit } from "@actions/github";
import { fetchJSON, responseError, gotRequestError } from "./simples.js";
import { format } from "node:util";
import { homedir } from "node:os";
import yaml from "yaml";
import stream from "node:stream";
import fs from "node:fs/promises";
import path from "node:path";
export type githubRelease = Awaited<ReturnType<ReturnType<typeof getOctokit>["rest"]["repos"]["listReleases"]>>["data"][number];

export type rateLimitObject = {
  "resources": {
    "core": {
      "limit": number,
      "remaining": number,
      "reset": number,
      "used": number
    },
    "search": {
      "limit": number,
      "remaining": number,
      "reset": number,
      "used": number
    },
    "graphql": {
      "limit": number,
      "remaining": number,
      "reset": number,
      "used": number
    },
    "integration_manifest": {
      "limit": number,
      "remaining": number,
      "reset": number,
      "used": number
    },
    "code_scanning_upload": {
      "limit": number,
      "remaining": number,
      "reset": number,
      "used": number
    }
  },
  "rate": {
    "limit": number,
    "remaining": number,
    "reset": number,
    "used": number
  }
}

async function cliToken(): Promise<string|undefined> {
  if (process.platform === "win32") {
    const state = path.join(homedir(), "AppData", "Local", "GitHub CLI", "state.yml");
    const state2 = path.join(homedir(), "AppData", "Roaming", "GitHub CLI", "state.yml");
    try {
      const file = yaml.parse(await fs.readFile(state, "utf8"));
      if (file?.github?.token) return file.github.token;
      else {
        const file2 = yaml.parse(await fs.readFile(state2, "utf8"));
        if (file2?.github?.token) return file2.github.token;
        else if (file2["github.com"]?.oauth_token) return file2["github.com"].oauth_token;
      }
    } catch {}
  } else {
    const state = path.join(homedir(), ".config/gh/hosts.yml");
    try {
      const file = yaml.parse(await fs.readFile(state, "utf8"));
      if (file?.github?.token) return file.github.token;
      else if (file["github.com"]?.oauth_token) return file["github.com"].oauth_token;
    } catch {}
  }
  return undefined;
}

export const github_secret = await cliToken()||process.env.GITHUB_SECRET||process.env.GITHUB_TOKEN;
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

export type braches = {
  name: string,
  protected: boolean,
  commit: {
    sha: string,
    url: string
  }
};

export type branchInfo = {
  name: string,
  commit: {
    sha: string,
    node_id: string,
    commit: {
      author: {
        name: string,
        email: string,
        date: Date
      },
      committer: {
        name: string,
        email: string,
        date: Date
      },
      message: string,
      tree: {
        sha: string,
        url: string
      },
      url: string,
      comment_count: number,
      verification: {
        reason: "valid"|"unsigned",
        verified: boolean,
        signature?: string,
        payload?: string
      }
    },
    url: string,
    html_url: string,
    comments_url: string,
    author: {
      login: string,
      id: number,
      node_id: string,
      avatar_url: string,
      gravatar_id: string,
      url: string,
      html_url: string,
      followers_url: string,
      following_url: string,
      gists_url: string,
      starred_url: string,
      subscriptions_url: string,
      organizations_url: string,
      repos_url: string,
      events_url: string,
      received_events_url: string,
      type: "User"|"Bot",
      site_admin: false
    },
    committer: {
      login: string,
      id: number,
      node_id: string,
      avatar_url: string,
      gravatar_id: string,
      url: string,
      html_url: string,
      followers_url: string,
      following_url: string,
      gists_url: string,
      starred_url: string,
      subscriptions_url: string,
      organizations_url: string,
      repos_url: string,
      events_url: string,
      received_events_url: string,
      type: "User"|"Bot",
      site_admin: false
    },
    parents: {
      sha: string,
      url: string,
      html_url: string
    }[]
  },
  _links: {
    self: string,
    html: string
  },
  protected: boolean,
  protection_url: string,
  protection: {
    enabled: boolean,
    required_status_checks: {
      enforcement_level: "non_admins",
      contexts: string[],
      checks: {
        context: string,
        app_id: any
      }[]
    }
  }
};

export type tagObject = {
  name: string,
  node_id: string,
  zipball_url: string,
  tarball_url: string,
  commit: {
    sha: string,
    url: string
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
      else if (err.response?.statusCode === 403) throw new Error(format("Github API max requests. Reset in %s", new Date(rateReset * 1000).toLocaleString()));
    } else if (err instanceof responseError) {
      const rateReset = Number(err.headers?.["x-ratelimit-reset"]);
      if (err.code === 404) throw new Error(`Repository ${owner}/${repository} not found`);
      else if (err.code === 401) throw new Error("Github token is invalid");
      else if (err.code === 403) throw new Error(format("Github API max requests. Reset in %s", new Date(rateReset * 1000).toLocaleString()));
    }
    throw err;
  })
  let octokit: ReturnType<typeof getOctokit>;
  if (token?.trim()) octokit = getOctokit(token.trim());

  /**
   * Get all branches lists
   * @returns
   */
  async function branchList() {
    let page = 1;
    const url = new URL(baseRepos);
    url.pathname = path.posix.join(url.pathname, "branches");
    url.searchParams.set("per_page", "100");
    const branchList: braches[] = [];
    while (true) {
      url.searchParams.set("page", String(page++));
      const data: braches[] = await fetchJSON(url, {headers: token?{Authorization: `token ${token}`}:{}}).catch(() => null);
      if (!data || (data.length === 0)) break;
      branchList.push(...data);
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
    let page = 1;
    requestURL.searchParams.set("per_page", "100");
    while (true) {
      requestURL.searchParams.set("page", String(page++));
      const data = await fetchJSON<tagObject[]>(requestURL, {headers: token?{Authorization: `token ${token}`}:{}}).catch(() => null);
      if (!data || (data.length === 0)) break;
      tags.push(...data);
    }
    return tags;
  }

  /**
   * Get all releases lists
   */
  async function getRelease(page?: number): Promise<githubRelease[]>;
  /**
   * Get release info by tag
   * @param releaseTag - Release tag or `true`/`false` value to get latest release
   */
  async function getRelease(releaseTag: string|boolean): Promise<githubRelease>;
  async function getRelease(releaseTag?: string|boolean|number): Promise<githubRelease|githubRelease[]> {
    const requestURL = new URL(baseRepos);
    requestURL.pathname = path.posix.join(requestURL.pathname, "releases");
    console.log(requestURL.toString());
    if (typeof releaseTag === "string"||typeof releaseTag === "boolean") {
      if (typeof releaseTag === "boolean") requestURL.pathname = path.posix.join(requestURL.pathname, "latest");
      else requestURL.pathname = path.posix.join(requestURL.pathname, "tags", releaseTag);
      return fetchJSON<githubRelease>(requestURL, {headers: token?{Authorization: `token ${token}`}:{}}).catch(() => null);
    }
    requestURL.searchParams.set("per_page", "100");
    let page = 1;
    if (typeof releaseTag !== "number") releaseTag = 1;
    else if (releaseTag < 1) releaseTag = 1;
    const releaseList: githubRelease[] = [];
    while (true) {
      if (releaseTag !== undefined) requestURL.searchParams.set("page", String(releaseTag));
      else requestURL.searchParams.set("page", String(page++));
      const data: githubRelease[] = await fetchJSON(requestURL, {headers: token?{Authorization: `token ${token}`}:{}}).catch(() => null);
      if (releaseTag !== undefined || !data || (data.length === 0)) break;
      releaseList.push(...data);
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