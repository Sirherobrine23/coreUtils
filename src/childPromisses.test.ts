import * as childProcess from "./childPromisses.js";

describe("Child Process Async/Await", () => {
  it("Command Exists", async () => await childProcess.commandExists(process.argv0, false));
  it("Exec File", async () => await childProcess.execFile({
    command: process.argv0,
    args: ["--version"]
  }));
  it("Exec", async () => await childProcess.exec(`"${process.argv0}" --version`));
});
