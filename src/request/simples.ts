import gotStands, { Method, Request, RequestError } from "got";
import { JSDOM } from "jsdom";
import * as fs from "node:fs";
import * as stream from "node:stream";
const got = gotStands.extend({
  enableUnixSockets: true,
  http2: true,
  headers: {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36",
    "Accept": "*/*"
  }
});

export class responseError {
  public code: string;
  public textError: string;
  public dataOriginal: any;
  public data: any;
  public ip?: string;
  public url?: string|URL;
  constructor(err: RequestError) {
    if (err?.code && err?.request) {
      this.code = err?.code;
      this.textError = err?.message;
      this.ip = err?.request.ip;
      this.url = err?.options?.url
      if (err?.response?.body) {
        this.dataOriginal = err.response.body;
        if (Buffer.isBuffer(err.response.body)) this.data = err.response.body.toString("utf8");
        try {
          this.data = JSON.parse(this.data);
        } catch {}
      }
      return this;
    }
    throw err;
  }
}

export type requestOptions = {
  url?: string|URL,
  socket?: {
    socketPath: string,
    path?: string,
  },
  query?: {[key: string]: string|number|boolean},
  method?: Method,
  headers?: {[headerName: string]: string[]|string},
  /** accept: `string`, `Buffer`, `stream.Readable`, `fs.ReadStream`, and `JSON object` */
  body?: any,
};

export function streamRequest(options: requestOptions["url"]|requestOptions, extraOptions?: requestOptions) {
  if (typeof options === "string"||options instanceof URL) options = {url: options};
  const fixed = {...options, ...extraOptions};
  if (!(fixed?.url||fixed?.socket)) throw new Error("Host blank")
  let urlRequest = (typeof fixed.url === "string"||fixed.url instanceof URL)?fixed.url:`http://unix:${fixed.socket.socketPath}:${fixed.socket.path||"/"}`;
  if (fixed.query) {
    const query: requestOptions["query"] = fixed.query;
    if (urlRequest instanceof URL) {
      for (const key in query) urlRequest.searchParams.set(key, String(query[key]));
    } else {
      const queryMap = Object.keys(query).map(key => `${key}=${query[key]}`);
      if (queryMap.length > 0) {
        if (([...((new URL(urlRequest)).searchParams)]).length > 0) urlRequest += "&"+queryMap.join("&");
        else urlRequest += "?"+queryMap.join("&");
      }
    }
  }
  const method = fixed.method||"GET";
  const request = {};
  if ((["GET", "get"] as Method[]).includes(method)) delete fixed.body;
  if (fixed.body) {
    if (typeof fixed.body === "string"||Buffer.isBuffer(fixed.body)) request["body"] = fixed.body;
    else if (typeof (fixed.body as stream.Readable).pipe === "function") request["body"] = fixed.body;
    else request["json"] = fixed.body;
    delete fixed.body;
  }
  return got.stream(urlRequest, {
    ...fixed,
    ...request,
    isStream: true,
    method,
  });
}

export async function pipeFetch(options: requestOptions["url"]|requestOptions): Promise<Request>;
export async function pipeFetch(options: requestOptions & {stream: fs.WriteStream|stream.Writable, waitFinish?: true}): Promise<void>;
export async function pipeFetch(options: requestOptions & {stream?: fs.WriteStream|stream.Writable, waitFinish?: boolean}): Promise<void|Request> {
  if (typeof options === "string"||options instanceof URL) options = {url: options};
  if (!(options?.url||options?.socket)) throw new Error("Host blank")
  let urlRequest = (typeof options.url === "string"||options.url instanceof URL)?options.url.toString():`http://unix:${options.socket.socketPath}:${options.socket.path||"/"}`;
  if (options.query) {
    const query: requestOptions["query"] = options.query;
    const queryMap = Object.keys(query).map(key => `${key}=${query[key]}`);
    if (queryMap.length > 0) {
      if (([...((new URL(urlRequest)).searchParams)]).length > 0) urlRequest += "&"+queryMap.join("&");
      else urlRequest += "?"+queryMap.join("&");
    }
  }
  const method = options.method||"GET";
  const request = {};
  if ((["GET", "get"] as Method[]).includes(method)) delete options.body;
  if (options.body) {
    if (typeof options.body === "string") {
      request["body"] = options.body;
    } else if (Buffer.isBuffer(options.body)) {
      request["body"] = options.body;
    }
    else if (options.body instanceof stream.Readable||options.body instanceof fs.ReadStream) {
      request["body"] = options.body;
    } else {
      request["json"] = options.body;
    }
    delete options.body;
  }
  const gotStream = got.stream(urlRequest, {
    isStream: true,
    headers: options.headers||{},
    method,
    ...request
  });

  if (!options.stream) {
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
  }
}

export async function bufferFetch(options: requestOptions["url"]|requestOptions, fetchOptionsStyle?: requestOptions) {
  if (typeof options === "string"||options instanceof URL) options = {url: options};
  const fixed = {...fetchOptionsStyle, ...options};
  if (typeof fixed.url === "string") fixed.url = new URL(fixed.url);
  if (!(fixed.url||fixed.socket)) throw new Error("Host blank")
  let urlRequest = fixed.url ? fixed.url : `http://unix:${fixed.socket.socketPath}:${fixed.socket.path||"/"}`;
  if (fixed.query) {
    const query: requestOptions["query"] = fixed.query;
    if (fixed.url instanceof URL) {
      for (const key in query) fixed.url.searchParams.set(key, String(query[key]));
    } else {
      const queryMap = Object.keys(query).map(key => `${key}=${query[key]}`);
      if (queryMap.length > 0) {
        if (([...((new URL(urlRequest)).searchParams)]).length > 0) urlRequest += "&"+queryMap.join("&");
        else urlRequest += "?"+queryMap.join("&");
      }
    }
  }
  const method = fixed.method||"GET";
  const request = {};
  if (fixed.body) {
    if (typeof fixed.body === "string") {
      request["body"] = fixed.body;
    } else if (Buffer.isBuffer(fixed.body)) {
      request["body"] = fixed.body;
    }
    else if (fixed.body instanceof stream.Readable||fixed.body instanceof fs.ReadStream) {
      request["body"] = fixed.body;
    } else {
      request["json"] = fixed.body;
    }
    delete fixed.body;
  }

  return got(urlRequest, {
    responseType: "buffer",
    headers: fixed.headers||{},
    method,
    ...request
  }).then(res => {
    return {
      headers: res.headers,
      data: Buffer.from(res.body),
      response: res
    };
  }).catch(err => Promise.reject(new responseError(err)));
}

export async function getJSON<JSONReturn = any>(request: requestOptions["url"]|requestOptions, options?: requestOptions) {
  const requestData = await bufferFetch(request, options);
  return JSON.parse(requestData.data.toString("utf8")) as JSONReturn;
}

export async function jsdomRequest(options: requestOptions|string) {
  const requestResponse = await bufferFetch(options);
  const { serialize, window } = new JSDOM(requestResponse.data, {
    url: (typeof options === "string") ? options : options?.url?.toString()
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
