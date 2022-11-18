export * as customChildProcess from "./childPromisses";
export * as extendFs from "./extendsFs";
// Imports http
import * as httpRequest from "./request/simples";
import * as httpRequestLarge from "./request/large";
import * as httpRequestGithub from "./request/github";
import * as httpRequestClient from "./request/client";
export {httpRequest, httpRequestClient, httpRequestLarge, httpRequestGithub};
export const requests = {
  client: httpRequestClient,
  github: httpRequestGithub,
  ...httpRequest,
  ...httpRequestLarge,
}