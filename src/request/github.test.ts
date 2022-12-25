import * as github from "./github.js";

describe("Github", function(){
  this.timeout(Infinity);
  it("Tree", async () => github.githubTree("Sirherobrine23", "coreUtils"));
  it("Releases", async () => github.GithubRelease({
    owner: "Sirherobrine23",
    repository: "coreUtils",
    all: false,
    pageLimit: 1,
    peer: 1
  }));
});
