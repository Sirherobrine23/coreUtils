import * as childPromisses from "./childPromisses.js";
import * as extendsCrypto from "./extendsCrypto.js";
import * as extendFs from "./extendsFs.js";
import * as httpRequest from "./request/simples.js";
import * as httpRequestLarge from "./request/large.js";
import * as httpRequestGithub from "./request/github.js";
import * as httpRequestClient from "./request/client.js";
import * as DockerRegistry from "./DockerRegistry/index.js";
import * as Ar from "./ar.js";
import * as DebianPackage from "./deb.js";
import * as googleDriver from "./googleDrive.js";
import * as internalOracle from "./oracle_cloud/index.js";
import * as Notation from "./notation.js"

// Export
export default {
  Ar: Ar.default,
  DockerRegistry: DockerRegistry.default,
  oracleBucket: internalOracle.bucket,
  googleDriver: googleDriver.default,
  httpRequestGithub: httpRequestGithub.default,
  extendFs: extendFs.default,
  httpRequest,
  httpRequestClient,
  httpRequestLarge,
  childPromisses,
  extendsCrypto,
  DebianPackage,
  Notation
};

export {
  Ar,
  httpRequest,
  httpRequestClient,
  httpRequestLarge,
  httpRequestGithub,
  childPromisses,
  extendFs,
  DockerRegistry,
  extendsCrypto,
  DebianPackage,
  googleDriver,
  internalOracle as Oracle,
  Notation
};