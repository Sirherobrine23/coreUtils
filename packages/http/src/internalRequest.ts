import stream from "node:stream";
import http2 from "node:http2";
import https from "node:https";
import http from "node:http";

const http2Consts = Object.keys(http2.constants).map(k => http2.constants[k]);

export type methods = "GET"|"POST"|"PUT"|"DELETE"|"PATCH";
export type options = {
  header?: Map<string, (string|boolean|number)[]|string|boolean|number>,
  http2?: boolean,
  method?: methods|Lowercase<methods>,
  body?: any
};

export class requestStream extends stream.Readable {
  redirects: URL[] = [];
  headers: {[headName: string]: string|string[]} = {}

  on(event: "data", fn: (data: Buffer) => void): this;
  on(event: "response", fn: () => void): this;
  on(event: "redirect", fn: (url: URL) => void): this;
  on(event: "close", listener: () => void): this;
  on(event: "end", listener: () => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: "pause", listener: () => void): this;
  on(event: "readable", listener: () => void): this;
  on(event: "resume", listener: () => void): this;
  on(event: string, fn: (...args: any[]) => void) {
    super.on(event, fn);
    return this;
  };

  once(event: "data", fn: (data: Buffer) => void): this;
  once(event: "response", fn: () => void): this;
  once(event: "redirect", fn: (url: URL) => void): this;
  once(event: "close", listener: () => void): this;
  once(event: "end", listener: () => void): this;
  once(event: "error", listener: (err: Error) => void): this;
  once(event: "pause", listener: () => void): this;
  once(event: "readable", listener: () => void): this;
  once(event: "resume", listener: () => void): this;
  once(event: string, fn: (...args: any[]) => void) {
    super.once(event, fn);
    return this;
  };
}

export async function request(url: string|URL, options?: options): Promise<requestStream> {
  if (typeof url === "string") url = new URL(url);
  if (!(["https:", "http:"]).includes(url.protocol)) throw new TypeError("Invalid protocol");
  options ??= {};
  options.method = (options.method || "GET").toUpperCase() as methods;
  if (Boolean(options.http2)) if (!http2) throw new Error("HTTP2 not supported");
  const reqHeader: {[k: string]: any} = {
    "user-agent": "sirherobrine23_http",
  };
  if (!!options.header) Array.from(options.header.keys()).forEach(key => {
    let value = options.header.get(key);
    if (Array.isArray(value)) value = value.map(String);
    else value = String(value);
    reqHeader[key.toLowerCase()] = value;
  });
  const internalStream = new requestStream({read(){}});
  if (Boolean(options.http2)) {
    const client = http2.connect(url);
    const req = client.request({
      ...reqHeader,
      [http2.constants.HTTP2_HEADER_METHOD]: options.method,
    });
    if (options.body) {
      if (options.body instanceof stream.Readable) {
        options.body.pipe(req).once("close", () => req.end());
      } else {
        if (typeof options.body === "object" && reqHeader["content-type"] === "application/json") req.once("connect", () => req.write(JSON.stringify(options.body)));
        else if (typeof options.body === "string") req.once("connect", () => req.write(options.body));
        else {
          req.end();
          throw new Error("Invalid body object");
        }
        req.end();
      }
    } else req.end();
    const headers = await new Promise<http2.IncomingHttpHeaders & http2.IncomingHttpStatusHeader>((done, reject) => req.once("error", reject).once("response", (header) => {done(header); req.removeListener("error", reject);}));
    const statusCode = headers[":status"];
    if (([301, 302]).includes(statusCode)) {
      internalStream.push(null);
      const location = new URL(String(headers.location || headers.Location));
      const newReq = await request(location, options);
      newReq.redirects.push(url);
      return newReq;
    }
    for (const name in headers) {
      if (http2Consts.includes(name)) continue;
      internalStream.headers[name] = headers[name];
    }
    internalStream.emit("response");
    req.on("data", data => internalStream.push(data));
  } else {
    const req = (url.protocol === "https:" ? https.request : http.request)(url, {
      method: options.method,
      headers: reqHeader
    });
    if (options.body) {
      if (options.body instanceof stream.Readable) options.body.pipe(req);
      else if (typeof options.body === "object" && reqHeader["content-type"] === "application/json") req.once("connect", () => req.write(JSON.stringify(options.body)));
      else if (typeof options.body === "string") req.once("connect", () => req.write(options.body));
      else {
        req.end();
        throw new Error("Invalid body object");
      }
    }
    const res = await new Promise<http.IncomingMessage>((done, reject) => req.on("response", res => done(res ?? req as any)).once("error", reject));
    const statusCode = Number(res?.statusCode ?? NaN);
    if (([301, 302]).includes(statusCode)) {
      internalStream.push(null);
      const location = new URL(String(res.headers.location || res.headers.Location));
      const newReq = await request(location, options);
      return newReq;
    }
    for (const name in res.headers) {
      if (http2Consts.includes(name)) continue;
      internalStream.headers[name] = res.headers[name];
    }
    internalStream.emit("response");
    res.on("data", data => internalStream.push(data)).once("close", () => internalStream.push(null));
  }
  return internalStream;
}

const req = await request("http://google.com", {
  http2: false,
  method: "get"
});

req.on("response", () => console.log(req.redirects, req.headers));
req.on("data", d => console.log(d.toString()));