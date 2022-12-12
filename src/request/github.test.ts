import * as github from "./github.js";

describe("Github", function(){
  this.timeout(Infinity);
  it("Releases", async () => github.GithubRelease("Sirherobrine23", "coreUtils"));
  it("Tree", async () => github.githubTree("Sirherobrine23", "coreUtils"));
});
