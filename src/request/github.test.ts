import github, { rateLimit } from "./github.js";

describe("Github", function() {
  this.timeout(Infinity);
  it("Rate limit", async () => await rateLimit());
  it("Tree", async () => (await github("Sirherobrine23", "coreUtils")).trees("main"));
  it("Releases", async () => (await github("Sirherobrine23", "coreUtils")).getRelease());
  it("Branch list", async () => (await github("Sirherobrine23", "coreUtils")).branchList());
  it("Tags", async () => (await github("Sirherobrine23", "coreUtils")).tags());
});
