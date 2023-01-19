import github, { rateLimit } from "./github.js";

describe("Github", function() {
  this.timeout(Infinity);
  it("Releases", async () => (await github("cli", "cli")).getRelease());
  it("Tree", async () => (await github("cli", "cli")).trees("main"));
  it("Branch list", async () => (await github("cli", "cli")).branchList());
  it("Tags", async () => (await github("cli", "cli")).tags());
  it("Rate limit", async () => await rateLimit());
});
