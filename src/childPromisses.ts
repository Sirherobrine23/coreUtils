import type { ObjectEncodingOptions } from "node:fs";
import * as child_process from "node:child_process";

export type ExecFileOptions = ObjectEncodingOptions & child_process.ExecFileOptions & {stdio?: "ignore"|"inherit"};
export function execFileAsync(command: string): Promise<{stdout: string, stderr: string}>;
export function execFileAsync(command: string, args: (string|number)[]): Promise<{stdout: string, stderr: string}>;
export function execFileAsync(command: string, options: ExecFileOptions): Promise<{stdout: string, stderr: string}>;
export function execFileAsync(command: string, args: (string|number)[], options: ExecFileOptions): Promise<{stdout: string, stderr: string}>;
export function execFileAsync(command: string, args?: ExecFileOptions|(string|number)[], options?: ExecFileOptions) {
  let childOptions: ExecFileOptions = {};
  let childArgs: string[] = [];
  if (args instanceof Array) childArgs = args.map(String); else if (args instanceof Object) childOptions = args as ExecFileOptions;
  if (options) childOptions = options;
  childOptions.maxBuffer = Infinity;
  if (childOptions?.env) childOptions.env = {...process.env, ...childOptions.env};
  return new Promise<{stdout: string, stderr: string}>((resolve, rejectExec) => {
    const child = child_process.execFile(command, childArgs.map(String), childOptions, (err, out, err2) => {if (err) return rejectExec(err);resolve({stdout: out, stderr: err2});});
    if (options?.stdio === "inherit") {
      child.stdout.on("data", data => process.stdout.write(data));
      child.stderr.on("data", data => process.stderr.write(data));
    }
  });
}

export type execAsyncOptions = child_process.ExecOptions & {encoding?: BufferEncoding} & {stdio?: "ignore"|"inherit"};
export function execAsync(command: string): Promise<{stdout: string, stderr: string}>;
export function execAsync(command: string, options: execAsyncOptions): Promise<{stdout: string, stderr: string}>;
export function execAsync(command: string, options?: execAsyncOptions) {
  let childOptions: execAsyncOptions = {};
  if (options) childOptions = options;
  if (childOptions?.env) childOptions.env = {...process.env, ...childOptions.env};
  return new Promise<{stdout: string, stderr: string}>((resolve, rejectExec) => {
    const child = child_process.exec(command, {...childOptions}, (err, out: string|Buffer, err2: string|Buffer) => {if (err) return rejectExec(err);resolve({stdout: ((out instanceof Buffer) ? out.toString():out), stderr: (err2 instanceof Buffer)?err2.toString():err2});});
    if (options?.stdio === "inherit") {
      child.stdout.on("data", data => process.stdout.write(data));
      child.stderr.on("data", data => process.stderr.write(data));
    }
  });
}

export async function commendExists(command: string): Promise<boolean>;
export async function commendExists(command: string, returnBoolean: true): Promise<boolean>;
export async function commendExists(command: string, returnBoolean: false): Promise<string>;
export async function commendExists(command: string, returnBoolean: boolean = true): Promise<string|boolean> {
  let location: string;
  if (process.platform === "win32") location = (await execAsync(`where ${command}`).catch(() => ({stdout: ""}))).stdout;
  else location = (await execAsync(`command -v ${command}`).catch(() => ({stdout: ""}))).stdout;
  if (returnBoolean) return !!location
  if (!location) throw new Error("This command not exists or is a shell function");
  return location;
}