import { getOctokit } from "@actions/github";
import { createReadStream } from "node:fs";
import { getJSON } from "./simples";
import fs from "node:fs/promises";
const secret = process.env.GITHUB_SECRET||process.env.GITHUB_TOKEN;

export type releaseOptions = {
  secret?: string,
  owner: string,
  repo: string,
  tagName: string,
  prerelease?: boolean,
  /** Create release if not exists */
  createRelease?: boolean
};

export async function createRelease(options: releaseOptions) {
  options = {secret, prerelease: false, createRelease: true, ...options};
  const {owner, repo} = options;
  const octokit = getOctokit(secret);
  const releases = (await octokit.rest.repos.listReleases({owner, repo})).data;
  let release = releases.find(release => release.tag_name === options.tagName);
  if (!release) {
    if (!options.createRelease) throw new Error("No release with this tag");
    release = (await octokit.rest.repos.createRelease({owner, repo, tag_name: options.tagName, prerelease: options.prerelease||false})).data;
  }
  async function list() {
    return (await octokit.rest.repos.listReleaseAssets({owner, repo, release_id: release.id})).data;
  }

  async function deleteRelease(id_name?: number|string) {
    if (typeof id_name === "string") id_name = (await list()).find(file => file.name === id_name)?.node_id;
    if (!id_name) throw new Error("No id or file name");
    await octokit.rest.repos.deleteReleaseAsset({
      owner, repo,
      asset_id: id_name as number
    });
  }

  async function uploadFile(filePath: string, name: string) {
    await deleteRelease(name).catch(() => {});
    const res = await octokit.rest.repos.uploadReleaseAsset({
      owner, repo,
      release_id: release.id,
      name: name,
      data: (createReadStream(filePath) as any) as string,
      headers: {"content-length": (await fs.lstat(filePath)).size},
      mediaType: {
        format: "application/octet-stream"
      },
    });
    return res.data;
  }

  return {release, uploadFile, list, deleteRelease};
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
  return getJSON<githubTree>(`https://api.github.com/repos/${username}/${repo}/git/trees/${tree}?recursive=true`);
}

export type githubRelease = {
  url: string;
  assets_url: string;
  upload_url: string;
  html_url: string;
  id: number;
  tarball_url: string;
  zipball_url: string;
  body: string;
  author: {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    gravatar_id: string;
    url: string;
    html_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    starred_url: string;
    subscriptions_url: string;
    organizations_url: string;
    repos_url: string;
    events_url: string;
    received_events_url: string;
    type: string;
    site_admin: boolean;
  };
  node_id: string;
  tag_name: string;
  target_commitish: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  assets: Array<{
    url: string;
    id: number;
    node_id: string;
    name: string;
    label: string;
    content_type: string;
    state: string;
    size: number;
    download_count: number;
    created_at: string;
    updated_at: string;
    browser_download_url: string;
    uploader: {
      login: string;
      id: number;
      node_id: string;
      avatar_url: string;
      gravatar_id: string;
      url: string;
      html_url: string;
      followers_url: string;
      following_url: string;
      gists_url: string;
      starred_url: string;
      subscriptions_url: string;
      organizations_url: string;
      repos_url: string;
      events_url: string;
      received_events_url: string;
      type: string;
      site_admin: boolean;
    };
  }>;
};

export async function GithubRelease(username: string, repo: string, releaseTag: string): Promise<githubRelease>;
export async function GithubRelease(username: string, repo: string): Promise<githubRelease[]>;
export async function GithubRelease(username: string): Promise<githubRelease[]>;
export async function GithubRelease(username: string, repo?: string, releaseTag?: string): Promise<githubRelease|githubRelease[]> {
  let fullRepo = username;
  if (!username) throw new Error("Repository is required, example: GithubRelease(\"Username/repo\") or GithubRelease(\"Username\", \"repo\")");
  if (repo) {
    if (!/\//.test(fullRepo)) fullRepo += "/"+repo;
  }
  if (releaseTag) {
    if (releaseTag.toLowerCase() === "latest") return getJSON<githubRelease>(`https://api.github.com/repos/${fullRepo}/releases/latest`);
    return getJSON<githubRelease>(`https://api.github.com/repos/${fullRepo}/releases/tags/${releaseTag}`);
  }
  return getJSON<githubRelease[]>(`https://api.github.com/repos/${fullRepo}/releases?per_page=100`);
}