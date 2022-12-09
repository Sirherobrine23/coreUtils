import type { Method, Request, RequestError } from "got";
import { JSDOM } from "jsdom";
import * as fs from "node:fs";
import * as stream from "node:stream";
import debug from "debug";
const responseDebug = debug("coreutils:request:response");
const pipeDebug = debug("coreutils:request:pipe");
const bufferDebug = debug("coreutils:request:buffer");

async function getImport<T>(moduleName: string): Promise<T> {return eval(`import("${moduleName}")`);}
let got: Awaited<ReturnType<typeof gotCjs>>;
/** import got from ESM to CJS with `import()` function */
export async function gotCjs(): Promise<(typeof import("got"))["default"]> {
  if (!got) got = (await getImport<typeof import("got")>("got")).default.extend({
    enableUnixSockets: true,
    http2: true,
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36",
      "Accept": "*/*"
    }
  });
  return got;
}

export class responseError {
  public code: string;
  public textError: string;
  public dataOriginal: any;
  public data: any;
  constructor(err: RequestError) {
    if (err?.code && err?.request) {
      this.code = err?.code;
      this.textError = err?.message;
      if (err?.response?.body) {
        this.dataOriginal = err.response.body;
        if (Buffer.isBuffer(err.response.body)) this.data = err.response.body.toString("utf8");
        try {
          this.data = JSON.parse(this.data);
        } catch {}
      }
      responseDebug("catch error, %O", this);
      return this;
    }
    throw err;
  }
}

export type requestOptions = {
  url?: string,
  socket?: {
    socketPath: string,
    path?: string,
  },
  query?: {[key: string]: string},
  method?: Method,
  headers?: {[headerName: string]: string[]|string},
  /** accept: `string`, `Buffer`, `stream.Readable`, and `JSON object` */
  body?: any,
};

export async function pipeFetch(options: requestOptions & {waitFinish?: false}): Promise<Request>;
export async function pipeFetch(options: requestOptions & {stream: fs.WriteStream|stream.Writable, waitFinish?: true}): Promise<void>;
export async function pipeFetch(options: requestOptions & {stream?: fs.WriteStream|stream.Writable, waitFinish?: boolean}): Promise<void|Request> {
  if (!(options?.url||options?.socket)) throw new Error("Host blank")
  let urlRequest = (typeof options.url === "string")?options.url:`http://unix:${options.socket.socketPath}:${options.socket.path||"/"}`;
  if (options.query) {
    const query: requestOptions["query"] = options.query;
    const queryMap = Object.keys(query).map(key => `${key}=${query[key]}`);
    if (queryMap.length > 0) {
      if (/.*\?[\s\S\W]+$/.test(urlRequest)) urlRequest += "&"+queryMap.join("&");
      else urlRequest += "?"+queryMap.join("&");
    }
  }
  const method = options.method||"GET";
  const request = {};
  if ((["GET", "get"] as Method[]).includes(method)) delete options.body;
  if (options.body) {
    if (typeof options.body === "string") request["body"] = options.body;
    else if (Buffer.isBuffer(options.body)) request["body"] = options.body;
    else if (options.body instanceof stream.Writable||options.body instanceof fs.WriteStream) request["body"] = options.body;
    else request["json"] = options.body;
  }
  pipeDebug("Fetching data with options: %O", {...options, stream: "replace to show"});
  const gotStream = (await gotCjs()).stream(urlRequest, {
    isStream: true,
    headers: options.headers||{},
    method,
    ...request
  });

  if (!options.stream) {
    pipeDebug("without finishing escort");
    return gotStream;
  } else {
    await new Promise<void>((done, reject) => {
      gotStream.pipe(options.stream);
      options.stream.on("error", reject);
      gotStream.on("error", reject);
      gotStream.once("end", () => {
        if (options.waitFinish) return options.stream.once("finish", done);
        return done();
      });
    }).catch(err => Promise.reject(new responseError(err)));
    pipeDebug("pipe end");
  }
}

export async function bufferFetch(options: string|requestOptions) {
  if (typeof options === "string") options = {url: options};
  if (!(options.url||options.socket)) throw new Error("Host blank")
  let urlRequest = (typeof options.url === "string")?options.url:`http://unix:${options.socket.socketPath}:${options.socket.path||"/"}`;
  if (options.query) {
    const query: requestOptions["query"] = options.query;
    const queryMap = Object.keys(query).map(key => `${key}=${query[key]}`);
    if (queryMap.length > 0) {
      if (/.*\?[\s\S\W]+$/.test(urlRequest)) urlRequest += "&"+queryMap.join("&");
      else urlRequest += "?"+queryMap.join("&");
    }
  }
  const method = options.method||"GET";
  const request = {};
  if (options.body) {
    if (typeof options.body === "string") request["body"] = options.body;
    else if (Buffer.isBuffer(options.body)) request["body"] = options.body;
    else if (options.body instanceof stream.Writable||options.body instanceof fs.WriteStream) request["body"] = options.body;
    else request["json"] = options.body;
  }

  bufferDebug("Fetching data with options: %O", options);
  return (await gotCjs())(urlRequest, {
    responseType: "buffer",
    headers: options.headers||{},
    method,
    ...request
  }).then(res => {
    bufferDebug("end request data");
    return {
      headers: res.headers,
      data: Buffer.from(res.body),
      response: res
    };
  }).catch(err => Promise.reject(new responseError(err)));
}

export async function getJSON<JSONReturn = any>(request: string|requestOptions) {
  const requestData = await bufferFetch(request);
  return JSON.parse(requestData.data.toString("utf8")) as JSONReturn;
}

export async function jsdomRequest(options: requestOptions|string) {
  const requestResponse = await bufferFetch(options);
  const { serialize, window } = new JSDOM(requestResponse.data, {
    url: typeof options === "string"?options:options?.url
  });
  return {
    headers: requestResponse.headers,
    document: window.document,
    serialize,
    window
  };
}

export async function urls(options: requestOptions|string): Promise<string[]> {
  const { document } = (await jsdomRequest(options));
  return Array.from(document.querySelectorAll("*")).map(ele => ele["href"]||ele["src"]).filter(data => !!data?.trim()).sort();
}
