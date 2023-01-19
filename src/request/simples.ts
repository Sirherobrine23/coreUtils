import gotStands, { Method, RequestError } from "got";
export { RequestError as gotRequestError } from "got";
import { JSDOM } from "jsdom";
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
  public code: number;
  public textError: string;
  public dataOriginal: any;
  public data: any;
  public ip?: string;
  public url?: string|URL;
  public headers?: {[headerName: string]: string[]|string};
  constructor(err: RequestError|Error) {
    if (err instanceof RequestError) {
      if (err?.code && err?.request) {
        this.code = err.response?.statusCode;
        this.textError = err?.message || err?.response?.statusMessage || err.code;
        this.ip = err?.request?.ip;
        this.url = err?.options?.url
        this.headers = err?.response?.headers;
        if (err?.response?.body) {
          this.dataOriginal = err.response.body;
          if (Buffer.isBuffer(err.response.body)) this.data = err.response.body.toString("utf8");
          try {
            this.data = JSON.parse(this.data);
          } catch {}
        }
        return this;
      }
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

export async function streamRequest(options: requestOptions["url"]|requestOptions, extraOptions?: requestOptions) {
  if (typeof options === "string"||options instanceof URL) options = {url: options};
  const fixed = {...options, ...extraOptions};
  if (!(fixed?.url||fixed?.socket)) throw new Error("Host blank")
  let urlRequest = (typeof fixed.url === "string"||fixed.url instanceof URL) ? new URL(fixed.url) : `http://unix:${fixed.socket.socketPath}:${fixed.socket.path||"/"}`;
  const method = fixed.method || "GET";
  const request = {};
  const deleteBody: Method[] = ["GET", "get"];
  if (!fixed.headers) fixed.headers = {};
  if (fixed.query) {
    const query: requestOptions["query"] = fixed.query;
    if (!(urlRequest instanceof URL)) {
      const queryMap = Object.keys(query).map(key => `${key}=${query[key]}`);
      if (queryMap.length > 0) {
        if (([...((new URL(urlRequest)).searchParams)]).length > 0) urlRequest += "&"+queryMap.join("&");
        else urlRequest += "?"+queryMap.join("&");
      }
    } else for (const key in query) urlRequest.searchParams.set(key, String(query[key]));
  }

  if (deleteBody.includes(method)) delete fixed.body;
  if (fixed.body) {
    if (typeof fixed.body === "string"||Buffer.isBuffer(fixed.body)) request["body"] = fixed.body;
    else if (typeof (fixed.body as stream.Readable).pipe === "function") request["body"] = fixed.body;
    else request["json"] = fixed.body;
    delete fixed.body;
  }

  delete fixed.url;
  delete fixed.socket;
  const requestStream = got.stream(urlRequest, {
    isStream: true,
    method,
    encoding: "binary",
    responseType: "buffer",
    ...request,
    headers: fixed.headers||{},
    throwHttpErrors: true
  });
  return new Promise<typeof requestStream>((done, reject) => requestStream.on("error", err => {try {reject(new responseError(err as any))} catch {reject(err)}}).on("response", () => done(requestStream)));
}

export async function bufferFetch(options: requestOptions["url"]|requestOptions, extraOptions?: requestOptions) {
  if (typeof options === "string"||options instanceof URL) options = {url: options};
  const fixed = {...options, ...extraOptions};
  if (!(fixed?.url||fixed?.socket)) throw new Error("Host blank")
  let urlRequest = (typeof fixed.url === "string"||fixed.url instanceof URL) ? new URL(fixed.url) : `http://unix:${fixed.socket.socketPath}:${fixed.socket.path||"/"}`;
  const method = fixed.method || "GET";
  const request = {};
  const deleteBody: Method[] = ["GET", "get"];
  if (!fixed.headers) fixed.headers = {};
  if (fixed.query) {
    const query: requestOptions["query"] = fixed.query;
    if (!(urlRequest instanceof URL)) {
      const queryMap = Object.keys(query).map(key => `${key}=${query[key]}`);
      if (queryMap.length > 0) {
        if (([...((new URL(urlRequest)).searchParams)]).length > 0) urlRequest += "&"+queryMap.join("&");
        else urlRequest += "?"+queryMap.join("&");
      }
    } else for (const key in query) urlRequest.searchParams.set(key, String(query[key]));
    delete fixed.query;
  }

  if (deleteBody.includes(method)) delete fixed.body;
  if (fixed.body) {
    if (typeof fixed.body === "string"||Buffer.isBuffer(fixed.body)) request["body"] = fixed.body;
    else if (typeof (fixed.body as stream.Readable).pipe === "function") request["body"] = fixed.body;
    else request["json"] = fixed.body;
    delete fixed.body;
  }

  delete fixed.url;
  delete fixed.socket;
  const response = await got(urlRequest, {
    isStream: false,
    encoding: "binary",
    responseType: "buffer",
    ...request,
    headers: fixed.headers||{},
    method,
  }).catch(err => {try {throw new responseError(err as any)} catch {throw err}});
  return {
    URL: new URL(response.url, response.requestUrl),
    headers: response.headers,
    data: response.body,
  };
}

export async function fetchJSON<T = any>(...args: Parameters<typeof streamRequest>) {
  const stream = await bufferFetch(...args);
  const data = JSON.parse(stream.data.toString("utf8")) as T;
  stream.data = null;
  return data;
}


export async function jsdomFetch(options: requestOptions|string) {
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
  const { document } = (await jsdomFetch(options));
  return Array.from(document.querySelectorAll("*")).map(ele => ele["href"]||ele["src"]).filter(data => !!data?.trim()).sort();
}
