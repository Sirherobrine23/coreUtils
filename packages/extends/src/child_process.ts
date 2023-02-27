import child_process from "node:child_process";
import path from "node:path"
import * as extendsFS from "./fs.js";

export type childProcessResult = {
  code?: number|NodeJS.Signals,
  pid?: number,
  stdout?: Buffer,
  stderr?: Buffer
};

export type execObject = {
  command: string,
  args?: (string|number|boolean)[],
  cwd?: string,
  env?: {[envName: string]: (string|number|boolean)[]},
  abortSignal?: AbortSignal,
  killSignal?: AbortSignal,
  gid?: number,
  uid?: number,
  shell?: string
};

/**
 * Get full path if command exists, else return null
 *
 * @param command - Command path or name
 * @returns
 */
export async function commandExists(command: string): Promise<null|string> {
  try {
    let fileLocation = "";
    if (path.isAbsolute(command) || command.startsWith("..") || command.startsWith(".") && (["/", "\\"]).includes(command[1])) if (await extendsFS.exists(command)) fileLocation = path.resolve(process.cwd(), command);
    else {
      const commandFind: Omit<execObject, "args"|"killSignal"> = {command: `command -v "${command}"`};
      if (process.platform === "win32") commandFind.command = `where "${command}"`;
      fileLocation = (await exec(commandFind).then(({stderr = Buffer.from([]), stdout = Buffer.from([])}) => stdout?.toString("utf8")||stderr?.toString("utf8")||"")).trim();
    }
    return fileLocation.trim() ? fileLocation : null;
  } catch {
    return null;
  }
}

export async function execFile(command: string|execObject, args?: execObject["args"]|Omit<execObject, "command"|"args">, options?: Omit<execObject, "command"|"args">): Promise<childProcessResult> {
  const commandRun = typeof command === "string" ? command : typeof command.command === "string" ? command.command : undefined;
  if (!commandRun) throw TypeError("Command is invalid, required string or object with command!");
  // Command args
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const commandArgs = (typeof command === "string" ? Array.isArray(args) ? args.map(String) : [] : typeof command !== "string" && Array.isArray(command?.args) ? command?.args.map(String) : []);
  const child = child_process.execFile(commandRun as any, commandArgs as any, {
    maxBuffer: Infinity,
    killSignal: (typeof command === "string" ? typeof args === "object" && !Array.isArray(args) ? args.killSignal : options?.killSignal : command.killSignal),
    signal: (typeof command === "string" ? typeof args === "object" && !Array.isArray(args) ? args.abortSignal : options?.abortSignal : command.abortSignal),
    uid: (typeof command === "string" ? typeof args === "object" && !Array.isArray(args) ? args.uid : options?.uid : command.uid),
    gid: (typeof command === "string" ? typeof args === "object" && !Array.isArray(args) ? args.gid : options?.gid : command.gid),
    shell: (typeof command === "string" ? typeof args === "object" && !Array.isArray(args) ? args.shell : options?.shell : command.shell),
    cwd: typeof command === "string" ? typeof args === "object" && !Array.isArray(args) ? args.cwd : options?.cwd : command.cwd,
    env: {
      ...process.env,
      ...(Object.keys((typeof command === "string" ? typeof args === "object" && !Array.isArray(args) ? args.env : options?.env : command.env) || {})).reduce((acc, key) => {
        const env = (typeof command === "string" ? typeof args === "object" && !Array.isArray(args) ? args.env : options?.env : command.env) || {};
        acc[key] = String(env[key]);
        return acc;
      }, {})
    }
  } as any);

  // out's
  if (child.stdout) child.stdout.on("data", data => stdout.push(Buffer.isBuffer(data) ? data : Buffer.from(data)));
  if (child.stderr) child.stderr.on("data", data => stderr.push(Buffer.isBuffer(data) ? data : Buffer.from(data)));
  const code = await new Promise<childProcessResult["code"]>((done, reject) => child.on("error", reject).on("cose", (code, signal) => done(code||signal)));

  return {
    stdout: stdout.length > 0 ? Buffer.concat(stdout) : null,
    stderr: stderr.length > 0 ? Buffer.concat(stderr) : null,
    pid: child.pid,
    code,
  };
}

export async function spawn(command: string|execObject, args?: execObject["args"]|Omit<execObject, "command"|"args">, options?: Omit<execObject, "command"|"args">): Promise<childProcessResult> {
  const commandRun = typeof command === "string" ? command : typeof command.command === "string" ? command.command : undefined;
  if (!commandRun) throw TypeError("Command is invalid, required string or object with command!");
  // Command args
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const commandArgs = (typeof command === "string" ? Array.isArray(args) ? args.map(String) : [] : typeof command !== "string" && Array.isArray(command?.args) ? command?.args.map(String) : []);
  const child = child_process.spawn(commandRun as any, commandArgs as any, {
    maxBuffer: Infinity,
    killSignal: (typeof command === "string" ? typeof args === "object" && !Array.isArray(args) ? args.killSignal : options?.killSignal : command.killSignal),
    signal: (typeof command === "string" ? typeof args === "object" && !Array.isArray(args) ? args.abortSignal : options?.abortSignal : command.abortSignal),
    uid: (typeof command === "string" ? typeof args === "object" && !Array.isArray(args) ? args.uid : options?.uid : command.uid),
    gid: (typeof command === "string" ? typeof args === "object" && !Array.isArray(args) ? args.gid : options?.gid : command.gid),
    shell: (typeof command === "string" ? typeof args === "object" && !Array.isArray(args) ? args.shell : options?.shell : command.shell),
    cwd: typeof command === "string" ? typeof args === "object" && !Array.isArray(args) ? args.cwd : options?.cwd : command.cwd,
    env: {
      ...process.env,
      ...(Object.keys((typeof command === "string" ? typeof args === "object" && !Array.isArray(args) ? args.env : options?.env : command.env) || {})).reduce((acc, key) => {
        const env = (typeof command === "string" ? typeof args === "object" && !Array.isArray(args) ? args.env : options?.env : command.env) || {};
        acc[key] = String(env[key]);
        return acc;
      }, {})
    }
  } as any);

  // out's
  if (child.stdout) child.stdout.on("data", data => stdout.push(Buffer.isBuffer(data) ? data : Buffer.from(data)));
  if (child.stderr) child.stderr.on("data", data => stderr.push(Buffer.isBuffer(data) ? data : Buffer.from(data)));
  const code = await new Promise<childProcessResult["code"]>((done, reject) => child.on("error", reject).on("cose", (code, signal) => done(code||signal)));

  return {
    stdout: stdout.length > 0 ? Buffer.concat(stdout) : null,
    stderr: stderr.length > 0 ? Buffer.concat(stderr) : null,
    pid: child.pid,
    code,
  };
}

export async function exec(command: string|Omit<execObject, "args"|"killSignal">, options?: Omit<execObject, "command"|"args"|"killSignal">): Promise<childProcessResult> {
  const commandRun = typeof command === "string" ? command : typeof command.command === "string" ? command.command : undefined;
  if (!commandRun) throw TypeError("Command is invalid, required string or object with command!");
  // Command args
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const child = child_process.exec(commandRun, {
    maxBuffer: Infinity,
    signal: (typeof command === "string" ? options?.abortSignal : command.abortSignal),
    uid: (typeof command === "string" ? options?.uid : command.uid),
    gid: (typeof command === "string" ? options?.gid : command.gid),
    shell: (typeof command === "string" ? options?.shell : command.shell),
    cwd: typeof command === "string" ? options?.cwd : command.cwd,
    env: {
      ...process.env,
      ...(Object.keys((typeof command === "string" ? options?.env : command.env) || {})).reduce((acc, key) => {
        const env = (typeof command === "string" ? options?.env : command.env) || {};
        acc[key] = String(env[key]);
        return acc;
      }, {})
    }
  });

  // out's
  if (child.stdout) child.stdout.on("data", data => stdout.push(Buffer.isBuffer(data) ? data : Buffer.from(data)));
  if (child.stderr) child.stderr.on("data", data => stderr.push(Buffer.isBuffer(data) ? data : Buffer.from(data)));
  const code = await new Promise<childProcessResult["code"]>((done, reject) => child.on("error", reject).on("cose", (code, signal) => done(code||signal)));

  return {
    stdout: stdout.length > 0 ? Buffer.concat(stdout) : null,
    stderr: stderr.length > 0 ? Buffer.concat(stderr) : null,
    pid: child.pid,
    code,
  };
}