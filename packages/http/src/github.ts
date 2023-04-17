import { jsonRequestBody, streamRequest, httpCoreError } from "./main.js";
import { homedir } from "node:os";
import { Octokit } from "octokit";
import stream from "node:stream";
import path from "node:path";
import yaml from "yaml";
import fs from "node:fs/promises";

export async function testToken(token: string) {
  return jsonRequestBody("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  }).then(() => true, () => false);
}

let __githubTokenTmp: string;
if (process.env.GITHUB_SECRET) __githubTokenTmp = process.env.GITHUB_SECRET;
else if(process.env.GITHUB_TOKEN) __githubTokenTmp = process.env.GITHUB_TOKEN;
else {
  for (const filePath of ([path.join(homedir(), ".config/gh/hosts.yml"), path.join(homedir(), "AppData", "Roaming", "GitHub CLI", "hosts.yml")])) {
    try {
      const file = yaml.parse(await fs.readFile(filePath, "utf8"));
      if (file?.github?.token) {
        // console.warn("Github token from Github CLI");
        __githubTokenTmp = file.github.token;
      }
      else if (file["github.com"]?.oauth_token) {
        // console.warn("Github token from Github CLI");
        __githubTokenTmp = file["github.com"].oauth_token;
      }
    } catch {}
  }
}

if (__githubTokenTmp) if (!(await testToken(__githubTokenTmp))) __githubTokenTmp = undefined;

/**
 * Github token from GITHUB_SECRET or GITHUB_TOKEN, or also from `gh` (if authenticated).
 */
export const githubToken = __githubTokenTmp;

// Export types from Octokit
export type rateLimitObject = Awaited<ReturnType<Octokit["rest"]["rateLimit"]["get"]>>["data"];
export type githubRelease = Awaited<ReturnType<Octokit["rest"]["repos"]["listReleases"]>>["data"][number];
export type branchInfo = Awaited<ReturnType<Octokit["rest"]["repos"]["listBranches"]>>["data"][number];
export type braches = Awaited<ReturnType<Octokit["rest"]["repos"]["listBranchesForHeadCommit"]>>["data"][number];
export type tagObject = Awaited<ReturnType<Octokit["rest"]["repos"]["listTags"]>>["data"][number];
export type githubTree = {
  sha: string,
  url: string,
  truncated: boolean,
  tree: ({
    path: string,
    mode: string,
    sha: string,
    url: string
  } & ({
    type: "tree",
  } | {
    type: "blob",
    size: number,
  }))[],
};

export async function repositoryManeger(owner: string, repository: string, relOptions?: {apiUrl?: string, uploadUrl?: string, token?: string}) {
  relOptions ||= {
    token: githubToken,
    apiUrl: "api.github.com",
    uploadUrl: "uploads.github.com"
  };
  relOptions.token ||= githubToken;
  relOptions.apiUrl ||= "api.github.com";
  relOptions.uploadUrl ||= "uploads.github.com";

  // Check if exists
  await jsonRequestBody(new URL(path.posix.join("/repos", owner, repository), `https://${relOptions.apiUrl}`), {headers: relOptions.token ? {Authorization: `Bearer ${relOptions.token}`} : {}}).catch((err: httpCoreError) => {
    if (err.httpCode === 404) throw new Error("Repository not exists");
    else if (err.httpCode === 403) throw new Error("Rate limit max, wait "+err.headers["x-ratelimit-reset"]);
    else if (err.httpCode === 401) throw new Error("Invalid token");
    else throw err;
  });

  // Octokit class
  const octokit = new Octokit({auth: relOptions.token});

  /**
   * Get all branchs
   */
  async function listBranchs(): Promise<braches[]> {
    let next = 1;
    const call = () => jsonRequestBody<braches[]>(new URL(path.posix.join("/repos", owner, repository, "branches"), `https://${relOptions.apiUrl}`), {
      query: {
        page: next++,
      },
      headers: {
        ...(relOptions.token ? {Authorization: `Bearer ${relOptions.token}`} : {}),
      },
    }).then(async data => data.length > 0 ? call().then((data2: braches[]) => data.concat(data2)) : data).catch((err: httpCoreError) => {
      if (err.httpCode === 404) throw new Error("Repository not exists");
      else if (err.httpCode === 403) throw new Error("Rate limit max, wait "+err.headers["x-ratelimit-reset"]);
      else if (err.httpCode === 401) throw new Error("Invalid token");
      else throw err;
    });

    return call();
  }

  /**
   * Get all infos to branch
   */
  async function getBranchInfo(branch: string) {
    return jsonRequestBody<branchInfo[]>(new URL(path.posix.join("/repos", owner, repository, "branches", branch), `https://${relOptions.apiUrl}`), {
      headers: {
        ...(relOptions.token ? {Authorization: `Bearer ${relOptions.token}`} : {}),
      },
    }).catch((err: httpCoreError) => {
      if (err.httpCode === 404) throw new Error("Branch not exists");
      else if (err.httpCode === 403) throw new Error("Rate limit max, wait "+err.headers["x-ratelimit-reset"]);
      else if (err.httpCode === 401) throw new Error("Invalid token");
      else throw err;
    });
  }

  async function getTree(branch: string) {
    return jsonRequestBody<githubTree>(new URL(path.posix.join("/repos", owner, repository, "git/trees", branch), `https://${relOptions.apiUrl}`), {
      headers: {
        ...(relOptions.token ? {Authorization: `Bearer ${relOptions.token}`} : {}),
      },
      query: {
        recursive: true
      }
    }).catch((err: httpCoreError) => {
      if (err.httpCode === 404) throw new Error("Branch not exists");
      else if (err.httpCode === 403) throw new Error("Rate limit max, wait "+err.headers["x-ratelimit-reset"]);
      else if (err.httpCode === 401) throw new Error("Invalid token");
      else throw err;
    });
  }

  async function getTags(): Promise<tagObject[]> {
    let next = 1;
    const call = () => jsonRequestBody(new URL(path.posix.join("/repos", owner, repository, "tags"), `https://${relOptions.apiUrl}`), {
      query: {
        page: next++,
      },
      headers: {
        ...(relOptions.token ? {Authorization: `Bearer ${relOptions.token}`} : {}),
      },
    }).then(async data => data.length > 0 ? call().then((data2: braches[]) => data.concat(data2)) : data).catch((err: httpCoreError) => {
      if (err.httpCode === 404) throw new Error("Repository not exists");
      else if (err.httpCode === 403) throw new Error("Rate limit max, wait "+err.headers["x-ratelimit-reset"]);
      else if (err.httpCode === 401) throw new Error("Invalid token");
      else throw err;
    });

    return call();
  }

  /** Get all releases in repository */
  async function getRelease(): Promise<githubRelease[]>;
  /**
   * Get a specific release
   *
   * @param tagName - Set tag name if else get latest set `__latest__`.
   */
  async function getRelease(tagName: string): Promise<githubRelease>;
  /**
   * Get latest release
   */
  async function getRelease(tagName: "__latest__"): Promise<githubRelease>;
  /**
   * Get release by ID
   * @param tagName - Release ID
   */
  async function getRelease(tagName: number): Promise<githubRelease>;
  async function getRelease(tagName?: string|number): Promise<githubRelease[]|githubRelease> {
    if (tagName) {
      if (typeof tagName === "number") {
        if (tagName <= 0) throw new Error("Invalid release ID");
        else return jsonRequestBody(new URL(path.posix.join("/repos", owner, repository, "releases", tagName.toString()), `https://${relOptions.apiUrl}`), {
          headers: relOptions.token ? {Authorization: `Bearer ${relOptions.token}`} : {},
        });
      }
      else if (tagName === "__latest__") return jsonRequestBody(new URL(path.posix.join("/repos", owner, repository, "releases/latest"), `https://${relOptions.apiUrl}`), {
        headers: relOptions.token ? {Authorization: `Bearer ${relOptions.token}`} : {},
      });
      else return jsonRequestBody(new URL(path.posix.join("/repos", owner, repository, "releases/tags", tagName), `https://${relOptions.apiUrl}`), {
        headers: relOptions.token ? {Authorization: `Bearer ${relOptions.token}`} : {},
      });
    }
    let next = 1;
    const call = () => jsonRequestBody<githubRelease[]>(new URL(path.posix.join("/repos", owner, repository, "releases"), `https://${relOptions.apiUrl}`), {
      query: {
        per_page: 99,
        page: next++,
      },
      headers: {
        ...(relOptions.token ? {Authorization: `Bearer ${relOptions.token}`} : {}),
      },
    }).then(data => data.length > 0 ? call().then(data2 => data.concat(data2)) : data);
    return call();
  }

  async function manegerRelease(tagName: string, options?: {releaseName?: string, releaseBody?: string, type?: "draft"|"preRelease"}) {
    options ||= {};
    // File assests
    const relAssests = new Map<string, githubRelease["assets"][number]>();
    // Release ID
    let relID: number;

    if (await getRelease(tagName).then(({assets, id}) => {relID = id; assets.map(assest => relAssests.set(assest.name, assest)); return false;}, () => true)) {
      if (tagName === "__latest__") throw new Error("Create release, not allow to create this!");
      await octokit.rest.repos.createRelease({
        owner, repo: repository,
        tag_name: tagName,
        name: options.releaseName || tagName,
        body: options.releaseBody,
        draft: options.type === "draft",
        prerelease: options.type === "preRelease"
      }).then(({data: {id}}) => relID = id);
    }

    // Latest sync to update files assests
    let latestSync = Date.now();

    /** Update release */
    async function updateRelease(rel: {tagName?: string, targetCommitish?: string, releaseName?: string, releaseBody?: string, type?: "draft"|"preRelease"}) {
      await jsonRequestBody<githubRelease>(new URL(path.posix.join("/repos", owner, repository, "releases", relID.toString()), `https://${relOptions.apiUrl}`), {
        method: "PATCH",
        headers: {Authorization: `Bearer ${relOptions.token}`},
        body: {
          tag_name: rel.tagName,
          target_commitish: rel.targetCommitish,
          name: rel.releaseName,
          body: rel.releaseBody,
          draft: rel.type === "draft",
          prerelease: rel.type === "preRelease"
        }
      }).then(rel => {
        tagName = rel.tag_name;
        relAssests.clear();
        rel.assets.map(assest => relAssests.set(assest.name, assest));
        latestSync = Date.now();
      });
    }

    /** Delete file from release assests */
    async function deleteAsset(fileName: string) {
      if ((Date.now() - latestSync) >= 5000) await getRelease(relID).then(({assets}) => {relAssests.clear(); assets.map(assest => relAssests.set(assest.name, assest)); latestSync = Date.now();});
      if (relAssests.has(fileName)) await octokit.rest.repos.deleteReleaseAsset({
        owner, repo: repository,
        asset_id: relAssests.get(fileName).id,
      });
      /*           get info                   delete this rel         */
      const rel = relAssests.get(fileName); relAssests.delete(fileName);
      return rel;
    }

    /** Get release file assest */
    async function getAssest(fileName: string) {
      if ((Date.now() - latestSync) >= 5000) await getRelease(relID).then(({assets}) => {relAssests.clear(); assets.map(assest => relAssests.set(assest.name, assest)); latestSync = Date.now();});
      if (!relAssests.has(fileName)) throw new Error("File not exists");
      return stream.Readable.from(await streamRequest(relAssests.get(fileName).browser_download_url, {
        headers: relOptions.token ? {Authorization: `Bearer ${relOptions.token}`} : {},
      }));
    }

    /**
     * Upload file to release
     *
     * @throws get on `error` event.
     *
     * @param fileName - File name.
     */
    function uploadAsset(fileName: string, fileSize: number): stream.Writable {
      return new (class writeAsset extends stream.PassThrough {
        constructor() {
          super();
          if (!relOptions.token) {
            this.emit("error", new Error("Cannot upload file without token!"));
            this.end();
            return;
          } else if (relAssests.has(fileName)) {
            this.emit("error", new Error("File are exists!"));
            this.end();
            return;
          }
          jsonRequestBody<githubRelease["assets"][number]>(new URL(path.posix.join("/repos", owner, repository, "releases", relID.toString(), "assets"), `https://${relOptions.uploadUrl}`), {
            method: "POST",
            body: stream.Readable.from(this),
            query: {
              name: fileName,
            },
            headers: {
              Authorization: `Bearer ${relOptions.token}`,
              "Content-Type": "application/octet-stream",
              "Content-Length": fileSize.toString(),
            }
          }).then(rel => {
            relAssests.set(rel.name, rel);
            this.end();
          }, err => this.emit("error", err));
        }
      })();
    }

    return {
      getLocaAssets: () => Array.from(relAssests.values()),
      updateRelease,
      uploadAsset,
      deleteAsset,
      getAssest,
    }
  }

  return {
    repository: {
      listBranchs,
      getBranchInfo,
      getTags
    },
    git: {
      getTree,
      getRawFile(branch: string, filePath: string) {
        return new (class rawFile extends stream.Readable {
          constructor() {
            super({read(){}});
            (async () => {
              return (await streamRequest(new URL(path.posix.join(owner, repository, branch, filePath), "https://raw.githubusercontent.com"), {
                headers: relOptions.token ? {Authorization: `Bearer ${relOptions.token}`} : {},
                query: {token: relOptions.token}
              })).on("data", data => this.push(data, "binary")).once("close", () =>  this.push(null)).on("error", this.emit.bind(this, "error"));
            })().catch(err => this.emit("error", err));
          }
        })()
      }
    },
    release: {
      manegerRelease,
      getRelease,
      async deleteRelease(releaseID: number) {
        if (!relOptions.token) throw new Error("No token set to delete release!");
        if (await getRelease(releaseID).then(() => false).catch(() => true)) throw new Error("Release not exists!");
        await jsonRequestBody(new URL(path.posix.join("/repos", owner, repository, "releases", releaseID.toString()), `https://${relOptions.apiUrl}`), {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${relOptions.token}`,
          }
        });
      }
    }
  };
}