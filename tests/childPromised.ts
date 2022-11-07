import { execAsync, execFileAsync, commendExists } from "../src/childPromisses";

describe("Child Process Async/Await", () => {
  it("Command Exists", async () => await commendExists(process.platform === "win32" ? "cmd" : "bash", false));
  it("Exec File", async () => await execFileAsync(process.platform === "win32" ? "dir" : "ls", [".."]));
  it("Exec", async () => await execAsync(process.platform === "win32" ? "dir .." : "ls .."));
});