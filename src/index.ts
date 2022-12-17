import * as childPromisses from "./childPromisses.js";
import * as extendsCrypto from "./extendsCrypto.js";
import * as extendFs from "./extendsFs.js";
import * as httpRequest from "./request/simples.js";
import * as httpRequestLarge from "./request/large.js";
import * as httpRequestGithub from "./request/github.js";
import * as httpRequestClient from "./request/client.js";
import * as DockerRegistry from "./DockerRegistry/index.js";

// Export
export default {
  DockerRegistry: DockerRegistry.default,
  httpRequest,
  httpRequestClient,
  httpRequestLarge,
  httpRequestGithub,
  childPromisses,
  extendFs,
  extendsCrypto
};

export {
  httpRequest,
  httpRequestClient,
  httpRequestLarge,
  httpRequestGithub,
  childPromisses,
  extendFs,
  DockerRegistry,
  extendsCrypto
};