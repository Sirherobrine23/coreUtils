import gotMain, { Method, Headers, OptionsInit, Request } from "got";
import stream from "stream";
const ignoreBody: Method[] = ["GET", "get"];
const got = gotMain.extend({
  enableUnixSockets: false,
  resolveBodyOnly: false,
  throwHttpErrors: false,
  responseType: "buffer",
  decompress: false,
  method: "GET",
  http2: true,
});

export type validURL = string|URL;
export type requestOptions = {
  url?: validURL,
  method?: Method,
  headers?: Headers,
  query?: {[key: string]: string|number|boolean},
  body?: any,
};

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
  const URLFixed = new URL(re.url);
  if (re.query) for (const key in re.query) URLFixed.searchParams.set(key, String(re.query[key]));

  // Make request body
  const requestBody: OptionsInit & {isStream?: true} = {
    isStream: true,
    throwHttpErrors: true,
    headers: re.headers || {},
    method: re.method || "GET",
    encoding: "binary",
  };

  // Fix body to got
  if (!ignoreBody.includes(re.method||"GET") && re.body) {
    if (typeof re.body === "string"||Buffer.isBuffer(re.body)) requestBody.body = re.body;
    else if (typeof (re.body as stream.Readable).pipe === "function") requestBody.body = re.body;
    else requestBody.json = re.body;
  }

  const request = got.stream(URLFixed, requestBody);
  (await new Promise<void>((done, reject) => request.on("error", reject).on("response", done)));
  request["headers"] = {};
  const headers = request["response"]["headers"] || request["response"]["trailers"] || {};
  for (const keyName in headers) request["headers"][keyName] = headers[keyName];
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