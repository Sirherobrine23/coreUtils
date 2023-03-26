import gotMain, { Method, Headers, OptionsInit, Request, HTTPError } from "got";
import { JSDOM } from "jsdom";
import stream from "node:stream";

const ignoreBody: Method[] = ["GET", "get"];
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
  rawBody: string;
  body: any;
  headers: {[k: string]: string|string[]};
}

/**
 * Create reqest same to fetch but return stream response
 *
 * @returns stream.Readable with headers
 */
export async function streamRequest(re: validURL|requestOptions, options?: Omit<requestOptions, "url">): Promise<Request & {headers: Headers}> {
  if (!(typeof re === "string"||re instanceof URL||re?.url)) throw new TypeError("Invalid request URL");
  if (typeof re === "string"||re instanceof URL) re = { ...options, url: re };
  else re = { ...options, ...re };
  if (!re.url) throw new TypeError("Invalid request URL");

  // Set Query
  if (typeof re.url === "string") if (!(re.url.startsWith("http"))) re.url = `http://${re.url}`;
  const URLFixed = new URL(String(re.url));
  if (re.query) for (const key in re.query) URLFixed.searchParams.set(key, String(re.query[key]));

  // Make request body
  const requestBody: OptionsInit & {isStream?: true} = {
    isStream: true,
    throwHttpErrors: true,
    headers: re.headers || {},
    method: re.method || "GET",
    encoding: "binary",
    http2: !(re.disableHTTP2 ?? false)
  };

  // Fix body to got
  if (!ignoreBody.includes(re.method||"GET") && re.body) {
    if (typeof re.body === "string"||Buffer.isBuffer(re.body)) requestBody.body = re.body;
    else if (re.body instanceof stream.Readable || typeof (re.body as stream.Readable).pipe === "function") requestBody.body = re.body;
    else requestBody.json = re.body;
  }

  const request = got.stream(URLFixed, requestBody);
  (await new Promise<void>((done, reject) => request.on("error", (err: HTTPError) => {
    const errorC = new httpCoreError();
    errorC.httpCode = err.response?.statusCode;
    errorC.message = err.message;
    errorC.headers = err.response?.headers;
    errorC.rawBody = err.response?.body as any;
    try {
      errorC.body = JSON.parse(String(errorC.rawBody));
    } catch {}
    reject(errorC);
  }).on("response", done)));
  request["headers"] = {};
  for (const head of ([request["response"]["headers"], request["response"]["trailers"]])) {
    if (!head) continue;
    for (const keyName in head) if (typeof head[keyName] === "string" || Array.isArray(head[keyName])) request["headers"][keyName] = head[keyName];
  }
  if (request.redirectUrls || (request.redirectUrls?.length ?? 0) <= 0) request.redirectUrls = [URLFixed]
  return request as any;
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
  };
}

export default jsonRequest;

/**
 * fetch json response
 * @returns
 */
export async function jsonRequest<T = any>(...args: Parameters<typeof streamRequest>) {
  const request = await bufferRequest(...args);
  return {
    headers: request.headers,
    ip: request.ip,
    url: request.url,
    body: JSON.parse(request.body.toString()) as T,
  };
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

export async function getExternalIP(): Promise<{ipv4?: string, ipv6?: string, rawRequest?: {ipv4?: clientIP<"ipv4">, ipv6?: clientIP<"ipv6">}}> {
  const [ipv6, ipv4] = await Promise.all([
    await jsonRequest<clientIP<"ipv6">>("https://ipv6.lookup.test-ipv6.com/ip/").then(data => data.body).catch(() => undefined),
    await jsonRequest<clientIP<"ipv4">>("https://ipv4.lookup.test-ipv6.com/ip/").then(data => data.body).catch(() => undefined)
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

export async function getURLs(re: validURL|requestOptions, options?: Omit<requestOptions, "url">) {
  const requestResponse = await bufferRequest(re, options);
  const { serialize, window } = new JSDOM(requestResponse.body, {url: requestResponse.url.toString()});
  return {
    ...requestResponse,
    body: Array.from(window.document.querySelectorAll("*")).map(ele => (ele["href"]||ele["src"]) as string|undefined).filter(data => !!data?.trim()).sort(),
    document: window.document,
    serialize,
    window,
  };
}
