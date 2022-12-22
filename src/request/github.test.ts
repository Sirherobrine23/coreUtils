import * as github from "./github.js";

describe("Github", function(){
  this.timeout(Infinity);
  it("Releases", async () => github.GithubRelease({
    owner: "Sirherobrine23",
    repository: "coreUtils"
  }));
  it("Tree", async () => github.githubTree("Sirherobrine23", "coreUtils"));
});
