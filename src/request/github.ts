import { createReadStream, ReadStream as fsReadStream } from "node:fs";
import { getOctokit } from "@actions/github";
import { getJSON } from "./simples";
import stream from "node:stream";
import fs from "node:fs/promises";
import debug from "debug";
const githubRateDebug = debug("coreutils:github:ratelimit");
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
  githubRateDebug("Limit data: %O", rate);
  if (rate.rate.remaining === 0) throw new Error("Github API max requests");
  return rate;
}

export async function GithubRelease(username: string, repo: string, releaseTag: string): Promise<githubRelease>;
export async function GithubRelease(username: string, repo: string): Promise<githubRelease[]>;
export async function GithubRelease(username: string): Promise<githubRelease[]>;
export async function GithubRelease(username: string, repo?: string, releaseTag?: string): Promise<githubRelease|githubRelease[]> {
  let fullRepo = username;
  if (!username) throw new Error("Repository is required, example: GithubRelease(\"Username/repo\") or GithubRelease(\"Username\", \"repo\")");
  if (repo) {
    if (!/\//.test(fullRepo)) fullRepo += "/"+repo;
  }
  await getReateLimit();
  if (releaseTag) {
    if (releaseTag.toLowerCase() === "latest") return getJSON<githubRelease>({
      url: `https://api.github.com/repos/${fullRepo}/releases/latest`,
      headers: github_secret?{Authorization: `token ${github_secret}`}:{}
    });
    return getJSON<githubRelease>({
      url: `https://api.github.com/repos/${fullRepo}/releases/tags/${releaseTag}`,
      headers: github_secret?{Authorization: `token ${github_secret}`}:{}
    });
  }
  const allReleases: githubRelease[] = [];
  let pageIndex = 0
  while (true) {
    const data = await getJSON<githubRelease[]>({
      url: `https://api.github.com/repos/${fullRepo}/releases?per_page=100&page=${pageIndex++}`,
      headers: github_secret?{Authorization: `token ${github_secret}`}:{}
    });
    if (data.length === 0) break;
    allReleases.push(...data);
    if (data.length < 100) break;
  }
  return allReleases;
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
  await getReateLimit(releaseOptions.secret);
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
    type: "blob"|"tree",
    sha: string,
    size: number,
    url: string
  }[],
};

export async function githubTree(username: string, repo: string, tree: string = "main") {
  const validate = /^[a-zA-Z0-9_\-]+$/;
  if (!validate.test(username)) throw new Error("Invalid username");
  if (!validate.test(repo)) throw new Error("Invalid repository name");
  await getReateLimit();
  return getJSON<githubTree>({
    url: `https://api.github.com/repos/${username}/${repo}/git/trees/${tree}?recursive=true`,
    headers: github_secret?{Authorization: `token ${github_secret}`}:{}
  });
}
