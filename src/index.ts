import * as childPromisses from "./childPromisses.js";
import * as extendFs from "./extendsFs.js";
import * as DockerRegistry from "./DockerRegistry/index.js";

// Imports http
import * as httpRequest from "./request/simples.js";
import * as httpRequestLarge from "./request/large.js";
import * as httpRequestGithub from "./request/github.js";
import * as httpRequestClient from "./request/client.js";

export default {httpRequest, httpRequestClient, httpRequestLarge, httpRequestGithub, childPromisses, extendFs, DockerRegistry};
export {
  httpRequest,
  httpRequestClient,
  httpRequestLarge,
  httpRequestGithub,
  childPromisses,
  extendFs,
  DockerRegistry
};