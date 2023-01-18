import { createReadStream, ReadStream as fsReadStream } from "node:fs";
import { getOctokit } from "@actions/github";
import { getJSON } from "./simples.js";
import stream from "node:stream";
import fs from "node:fs/promises";
import path from "node:path";
export type githubRelease = Awaited<ReturnType<ReturnType<typeof getOctokit>["rest"]["repos"]["listReleases"]>>["data"][number];

export type rateLimit = {
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

export const github_secret = process.env.GITHUB_SECRET||process.env.GITHUB_TOKEN;
export async function getReateLimit(token?: string) {
  token = token||github_secret;
  const rate = await getJSON<rateLimit>({
    url: "https://api.github.com/rate_limit",
    headers: token?{Authorization: `token ${token}`}:{}
  });
  if (rate.rate.remaining === 0) throw new Error("Github API max requests");
  return rate;
}

type githubReleaseBase = {
  repository: string,
  owner: string,
  token?: string,
};

export async function getRelease(options: githubReleaseBase & {latest?: boolean, releaseTag?: string}): Promise<githubRelease>;
export async function getRelease(options: githubReleaseBase & {all?: boolean, pageAt?: number, peer?: number}): Promise<githubRelease[]>;
export async function getRelease(options: githubReleaseBase & {all?: boolean, pageAt?: number, peer?: number, latest?: boolean, releaseTag?: string}): Promise<githubRelease|githubRelease[]> {
  let urlRequest = `https://api.github.com/repos/${options.owner}/${options.repository}/releases`;
  if (options.releaseTag||options.latest) {
    if (options.latest) urlRequest += "/latest";
    else urlRequest += `/tags/${options.releaseTag}`;
    return getJSON<githubRelease>({
      url: urlRequest,
      headers: options.token?{Authorization: `token ${options.token}`}:{}
    });
  }
  const data: githubRelease[] = [];
  let page = 1;
  if (options.pageAt) options.pageAt = Math.min(options.pageAt, 100);
  if (options.peer) options.peer = Math.min(options.peer, 100);
  while (true) {
    const request = await getJSON<githubRelease[]>({
      url: urlRequest,
      query: {
        per_page: options?.peer || 100,
        page: (page++).toString(),
      },
      headers: options.token?{Authorization: `token ${options.token}`}:{}
    });
    data.push(...request);
    if (!options.all) break;
    if (request.length === 0) break;
    if (options.pageAt && page >= options.pageAt) break;
  }
  return data;
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

export async function createRelease(releaseOptions: releaseOptions) {
  if (!releaseOptions) throw new Error("Required release options");
  releaseOptions = {
    secret: github_secret,
    prerelease: false,
    createReleaseIfNotExists: true,
    name: releaseOptions?.tagName,
    ...releaseOptions
  };
  const octokit = getOctokit(releaseOptions.secret);
  let release: githubRelease = (await octokit.rest.repos.listReleases({owner: releaseOptions.owner, repo: releaseOptions.repo})).data.find(release => release.tag_name === releaseOptions.tagName);
  if (!release) {
    if (!releaseOptions.createReleaseIfNotExists) throw new Error("No release with this tag");
    release = (await octokit.rest.repos.createRelease({
      owner: releaseOptions.owner,
      repo: releaseOptions.repo,
      tag_name: releaseOptions.tagName,
      prerelease: releaseOptions.prerelease||false,
      body: releaseOptions.releaseDescribe,
      name: releaseOptions.name
    })).data;
  }

  /** List release assets files */
  async function fileList() {
    return (await octokit.rest.repos.listReleaseAssets({
      owner: releaseOptions.owner,
      repo: releaseOptions.repo,
      release_id: release.id,
      per_page: 100
    })).data;
  }

  /** Delete release with node_id */
  async function deleteRelease(node_id: number): Promise<void>;
  /** find release assets file and delete if exists */
  async function deleteRelease(file_name: string): Promise<void>;
  async function deleteRelease(id_name: number|string): Promise<void> {
    if (typeof id_name === "string") id_name = (await fileList()).find(file => file.name === id_name)?.node_id;
    if (!id_name) throw new Error("No id or file name");
    await octokit.rest.repos.deleteReleaseAsset({
      owner: releaseOptions.owner,
      repo: releaseOptions.repo,
      asset_id: id_name as number
    });
  }

  async function uploadFile(uploadConfig: releaseOptionsUpload) {
    if (!uploadConfig) throw new Error("Require");
    // Delete if exists
    if ((await fileList()).some(data => data.name === uploadConfig.name)) await deleteRelease(uploadConfig.name);
    if (typeof uploadConfig.content === "string") uploadConfig.content = {
      fileSize: (await fs.lstat(uploadConfig.content)).size,
      stream: createReadStream(uploadConfig.content)
    }
    const assetsResponse = await octokit.rest.repos.uploadReleaseAsset({
      owner: releaseOptions.owner,
      repo: releaseOptions.repo,
      release_id: release.id,
      name: uploadConfig.name,
      data: uploadConfig.content.stream as any as string,
      headers: {"content-length": uploadConfig.content.fileSize},
      mediaType: {
        format: "application/octet-stream"
      },
    });
    return assetsResponse.data;
  }

  return {
    uploadFile,
    fileList,
    deleteRelease,
    release,
  };
}

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

export async function githubTree(username: string, repo: string, tree: string = "main") {
  const validate = /^[a-zA-Z0-9_\-]+$/;
  if (!validate.test(username)) throw new Error("Invalid username");
  if (!validate.test(repo)) throw new Error("Invalid repository name");
  return getJSON<githubTree>({
    url: `https://api.github.com/repos/${username}/${repo}/git/trees/${tree}?recursive=true`,
    headers: github_secret?{Authorization: `token ${github_secret}`}:{}
  });
}

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
  const baseURL = new URL("https://api.github.com/repos/");
  baseURL.pathname = path.posix.join(baseURL.pathname, owner, repository);
  const checkExist = await getJSON(baseURL).catch(() => null);
  if (!checkExist) throw new Error("Repository not found");
  const octokit = getOctokit(token);

  /**
   * Get all branches lists
   * @returns
   */
  async function branchList() {
    let page = 1;
    const url = new URL("", baseURL);
    url.pathname = path.posix.join(url.pathname, "branches");
    url.searchParams.set("per_page", "100");
    const branchList: braches[] = [];
    while (true) {
      url.searchParams.set("page", String(page++));
      const data: braches[] = await getJSON(url, {headers: token?{Authorization: `token ${token}`}:{}}).catch(() => null);
      if (!data || (data.length < 0)) break;
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
    const url = new URL("", baseURL);
    url.pathname = path.posix.join(url.pathname, "branches", branch);
    return getJSON<branchInfo>(url, {headers: token?{Authorization: `token ${token}`}:{}});
  }

  async function trees(tree: string) {
    const requestURL = new URL("", baseURL);
    requestURL.pathname = path.posix.join(requestURL.pathname, "git", "trees", tree);
    requestURL.searchParams.set("recursive", "true");
    return getJSON<githubTree>(requestURL, {headers: token?{Authorization: `token ${token}`}:{}}).catch(() => null);
  }

  async function tags() {
    const requestURL = new URL("", baseURL);
    requestURL.pathname = path.posix.join(requestURL.pathname, "tags");
    const tags: tagObject[] = [];
    let page = 1;
    requestURL.searchParams.set("per_page", "100");
    while (true) {
      requestURL.searchParams.set("page", String(page++));
      const data = await getJSON<tagObject[]>(requestURL, {headers: token?{Authorization: `token ${token}`}:{}}).catch(() => null);
      if (!data || (data.length < 0)) break;
      tags.push(...data);
    }
  }

  /**
   * Get all releases lists
   */
  async function getRelease(): Promise<githubRelease[]>;
  /**
   * Get release info by tag
   * @param releaseTag - Release tag
   */
  async function getRelease(releaseTag: string): Promise<githubRelease>;
  async function getRelease(releaseTag?: string): Promise<githubRelease|githubRelease[]> {
    const requestURL = new URL("", baseURL);
    requestURL.pathname = path.posix.join(requestURL.pathname, "releases");
    if (releaseTag) {
      if (releaseTag.trim().toLowerCase() === "latest") requestURL.pathname = path.posix.join(requestURL.pathname, "latest");
      else requestURL.pathname = path.posix.join(requestURL.pathname, "tags", releaseTag);
      return getJSON<githubRelease>(requestURL, {headers: token?{Authorization: `token ${token}`}:{}}).catch(() => null);
    }
    requestURL.searchParams.set("per_page", "100");
    let page = 1;
    const releaseList: githubRelease[] = [];
    while (true) {
      requestURL.searchParams.set("page", String(page++));
      const data: githubRelease[] = await getJSON(requestURL, {headers: token?{Authorization: `token ${token}`}:{}}).catch(() => null);
      if (!data || (data.length < 0)) break;
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