import { GithubManeger } from "../src/github.js";
try {
  const main = await GithubManeger("Sirherobrine23", "coreUtils");
  const branches = await main.branchList();
  const branchInfo = await main.getBranchInfo(branches.at(0).name);
  const release = await main.getRelease(true);
  const tags = await main.tags();
  const tree = await main.trees(branches.at(0).name);

  console.dir({
    branches,
    branchInfo,
    release,
    tags,
    tree
  }, {
    colors: true,
    depth: null,
    showHidden: false,
    compact: false,
    breakLength: null,
    
  });
} catch (err) {
  console.error(err);
  process.exit(1);
}