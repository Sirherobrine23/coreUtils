import gotMain, { Method, Headers, Request, HTTPError } from "got";
import { finished } from "node:stream/promises";
import { JSDOM } from "jsdom";
import stream from "node:stream";
export { HTTPError };

const ignoreBody: Method[] = ["GET", "get", "HEAD", "head"];
const got = gotMain.extend({
  enableUnixSockets: false,
  resolveBodyOnly: false,
  throwHttpErrors: false,
  responseType: "buffer",
  decompress: true,
  method: "GET"
});

export type validURL = string|URL;
export type requestOptions = {
  url?: validURL,
  method?: Method,
  headers?: Headers,
  query?: {[key: string]: string|number|boolean},
  body?: any,
  disableHTTP2?: boolean
};

export class httpCoreError {
  message: string;
  httpCode?: number;
  url?: string;
  headers: Headers;
  rawBody: string;
  body: any;
}

export interface reqStream extends Request {
  headers: Headers
};

export function streamRoot(re: validURL|requestOptions, options?: Omit<requestOptions, "url">, throwHttpErrors: boolean = true) {
  if (!(typeof re === "string"||re instanceof URL||re?.url)) throw new TypeError("Invalid request URL");
  if (typeof re === "string"||re instanceof URL) re = { ...options, url: re };
  else re = { ...options, ...re };
  if (!re.url) throw new TypeError("Invalid request URL");

  // Set Query
  if (typeof re.url === "string") if (!(re.url.startsWith("http"))) re.url = `http://${re.url}`;
  const URLFixed = new URL(String(re.url));
  if (re.query) for (const key in re.query) URLFixed.searchParams.set(key, String(re.query[key]));

  const request = got.stream(URLFixed, {
    isStream: true,
    encoding: "binary",
    throwHttpErrors: !!throwHttpErrors,
    headers: re.headers || {},
    method: re.method || "GET",
    http2: !(re.disableHTTP2),
    ...(() => {
      if (!ignoreBody.includes(re.method||"GET") && re.body) {
        if (re.body instanceof stream.Writable) throw new Error("Invalid body");
        else if (typeof re.body === "string"||Buffer.isBuffer(re.body)) return {body: re.body};
        else if (!(re.body instanceof stream.Readable)) return {json: re.body};
        else return {body: re.body};
      }
      return {};
    })()
  }).on("response", () => {
    if (request.redirectUrls || (request.redirectUrls?.length ?? 0) <= 0) request.redirectUrls = [URLFixed];
  });
  return request;
}

export class dummyRequestResponse<T = any> {
  url?: string;
  req: requestOptions;
  statusCode?: number;
  statusMessage?: string;
  headers?: Headers;
  /** if reponse return stream.Redable, if error return body and if else JSON reponse parse */
  body?: T;
}

export async function dummyRequest(re: validURL|requestOptions, options?: Omit<requestOptions, "url">) {
  return new Promise<dummyRequestResponse<stream.Readable>>(done => {
    const dummy = new dummyRequestResponse<stream.Readable>();
    dummy.req = ((typeof re === "string"||re instanceof URL) ? {url: re, ...options} : re);
    const request = streamRoot(re, options, false).on("error", (err: HTTPError) => {
      dummy.statusCode = err.response?.statusCode;
      dummy.statusMessage = err.message;
      dummy.headers = err.response?.headers;
      if (typeof err?.response?.body === "string") dummy.body = stream.Readable.from(err.response.body);
      else if (err?.response?.body instanceof stream.Readable) dummy.body = stream.Readable.from(err.response.body);
      else dummy.body = stream.Readable.from("");
      dummy.url = (request.response?.redirectUrls?.length > 0 ? request.response.redirectUrls.at(-1) : new URL((typeof re === "string"||re instanceof URL) ? re.toString() : re.url.toString())).toString();
      done(dummy);
    }).on("response", async () => {
      dummy.body = stream.Readable.from(request);
      dummy.url = (request.response?.redirectUrls?.length > 0 ? request.response.redirectUrls.at(-1) : new URL((typeof re === "string"||re instanceof URL) ? re.toString() : re.url.toString())).toString();
      dummy.statusCode = request.response.statusCode;
      dummy.statusMessage = request.response.statusMessage;
      dummy.headers = request.response?.headers||{};
      done(dummy);
    });
  });
}

export async function streamJSON(src: stream.Readable) {
  let data: Buffer[] = []
  await finished(src.on("data", d => data.push(d)));
  try {
    return JSON.parse(Buffer.concat(data).toString("utf8"));
  } finally {
    data = null;
  }
}

export async function jsonDummyRequest<T = any>(re: validURL|requestOptions, options?: Omit<requestOptions, "url">) {
  if (!(typeof re === "string"||re instanceof URL||re?.url)) throw new TypeError("Invalid request URL");
  if (typeof re === "string"||re instanceof URL) re = { ...options, url: re };
  else re = { ...options, ...re };
  if (!re.url) throw new TypeError("Invalid request URL");

  // Set Query
  if (typeof re.url === "string") if (!(re.url.startsWith("http"))) re.url = `http://${re.url}`;
  const URLFixed = new URL(String(re.url));
  if (re.query) for (const key in re.query) URLFixed.searchParams.set(key, String(re.query[key]));
  const dummy = new dummyRequestResponse();

  try {
    const req = await got<T>(URLFixed, {
      encoding: "utf8",
      throwHttpErrors: false,
      headers: re.headers || {},
      method: re.method || "GET",
      http2: !(re.disableHTTP2),
      ...(() => {
          if (!ignoreBody.includes(re.method||"GET") && re.body) {
          if (!re.body) {}
          else if (re.body instanceof stream.Writable) throw new Error("Invalid body");
          else if (!(re.body instanceof stream.Readable)) return {json: re.body};
          else if (typeof re.body === "string"||Buffer.isBuffer(re.body)) return {body: re.body};
          else return {body: re.body};
        }
        return {};
      })()
    });
    dummy.url = (req?.redirectUrls?.length > 0 ? req.redirectUrls.at(-1) : new URL((typeof re === "string"||re instanceof URL) ? re.toString() : re.url.toString())).toString();
    dummy.body = JSON.parse(String(req.body));
    dummy.statusCode = req.statusCode;
    dummy.statusMessage = req.statusMessage;
    dummy.headers = req.headers;
  } catch (err) {
    dummy.statusMessage = err?.message || String(err);
  }
  return dummy;
}

/**
 * Create reqest same to fetch but return stream response
 *
 * @returns stream.Readable with headers
 */
export async function streamRequest(re: validURL|requestOptions, options?: Omit<requestOptions, "url">): Promise<reqStream> {
  const request: reqStream = streamRoot(re, options, true) as any;
  (await new Promise<void>((done, reject) => request.on("error", (err: HTTPError) => {
    const errorC = new httpCoreError();
    errorC.httpCode = err.response?.statusCode;
    errorC.message = err.message;
    errorC.url = err.response?.url;
    errorC.headers = err.response?.headers;
    errorC.rawBody = err.response?.body as any;
    try {
      errorC.body = JSON.parse(String(errorC.rawBody));
      delete errorC.rawBody;
    } catch {}
    reject(errorC);
  }).on("response", done)));
  request["headers"] = {};
  for (const head of ([request["response"]["headers"], request["response"]["trailers"]])) {
    if (!head) continue;
    for (const keyName in head) if (typeof head[keyName] === "string" || Array.isArray(head[keyName])) request["headers"][keyName] = head[keyName];
  }
  return request;
}

/**
 * Create request and return buffer response
 *
 * @returns
 */
export async function bufferRequest(...args: Parameters<typeof streamRequest>) {
  const request = await streamRequest(...args);
  const buffers: Buffer[] = [];
  await new Promise<void>((done, reject) => request.pipe(new stream.Writable({
    final(callback) {
      done();
      callback();
    },
    destroy(error, callback) {
      if (error) reject(error);
      callback(error);
    },
    write(chunk, encoding, callback) {
      if (encoding !== "binary") chunk = Buffer.from(chunk, encoding);
      buffers.push(chunk);
      callback();
    }
  })));
  return {
    headers: request.headers,
    ip: request.ip,
    url: request.redirectUrls?.at(-1),
    body: Buffer.concat(buffers),
    statusCode: request.response?.statusCode,
    statusMessage: request.response?.statusMessage,
  };
}
export async function bufferRequestBody(...args: Parameters<typeof bufferRequest>) {
  return (await bufferRequest(...args)).body;
}

/**
 * fetch json response
 * @returns
 */
export async function jsonRequest<T = any>(...args: Parameters<typeof bufferRequest>) {
  const request = await bufferRequest(...args);
  return {
    headers: request.headers,
    ip: request.ip,
    url: request.url,
    body: JSON.parse(request.body.toString()) as T,
  };
}

export async function jsonRequestBody<T = any>(...args: Parameters<typeof bufferRequest>) {
  return (await jsonRequest<T>(...args)).body;
}

export type clientIP<protocolType extends "ipv4"|"ipv6" = "ipv4"> = {
  ip: string,
  type: protocolType,
  subtype: string,
  via: string,
  padding: string,
  asn: string,
  asnlist: string,
  asn_name: string,
  country: string,
  protocol: "HTTP/2.0"|"HTTP/1.1"|"HTTP/1.0"
};

/**
 * Get client remote address
 */
export async function getExternalIP(): Promise<{ipv4?: string, ipv6?: string, rawRequest?: {ipv4?: clientIP<"ipv4">, ipv6?: clientIP<"ipv6">}}> {
  const [ipv6, ipv4] = await Promise.all([
    await jsonRequest<clientIP<"ipv6">>("https://ipv6.lookup.test-ipv6.com/ip/").then(data => data.body).catch(() => null as clientIP<"ipv6">),
    await jsonRequest<clientIP<"ipv4">>("https://ipv4.lookup.test-ipv6.com/ip/").then(data => data.body).catch(() => null as clientIP<"ipv4">)
  ]);
  if (!ipv4 && !ipv6) return {};
  else if (!ipv4) return {ipv6: ipv6.ip, rawRequest: {ipv6}};
  else if (!ipv6) return {ipv4: ipv4.ip, rawRequest: {ipv4}};
  return {
    ipv4: ipv4.ip,
    ipv6: ipv6.ip,
    rawRequest: {ipv4, ipv6}
  };
}

/** Get urls from HTML page */
export async function htmlURLs(...args: Parameters<typeof bufferRequest>) {
  const requestResponse = await bufferRequest(...args);
  const { serialize, window } = new JSDOM(requestResponse.body, {url: requestResponse.url.toString()});
  return {
    ...requestResponse,
    body: Array.from(window.document.querySelectorAll("*")).map(doc => (doc["href"]||doc["src"]) as string|undefined).filter(data => !!data?.trim()).sort(),
    document: window.document,
    serialize,
    window,
  };
}
