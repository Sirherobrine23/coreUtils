import { AddressInfo } from "node:net";
import stream from "node:stream";
import http2 from "node:http2"
import https from "node:https";
import http from "node:http";
import path from "node:path";

export interface response extends http.ServerResponse<request> {
  status(code: number): this;
  streamPipe(data: stream.Readable): this & Promise<void>;
  sendText(data: string): this & Promise<void>;
  json(data: any): this & Promise<void>;
  yaml(data: any): this & Promise<void>;
};

export interface request extends http.IncomingMessage {
  req: this;
  res: response;
  response: response;

  path: string;
  query: {[queryName: string]: string};
  body: any;
};

export type handler = (req: request, res?: response) => void|any;

export type requestMethod = "WSS"|"ALL"|"GET"|"POST"|"PUT"|"PATCH"|"HEAD"|"DELETE";
export default createServer;
export class createServer {
  public address: (string | AddressInfo)[] = [];
  #closeArray: (() => void)[];
  public routes: (createServer|{
    reqMethod: requestMethod,
    path?: RegExp,
    call: handler[]
  })[] = [];

  /**
   * User response error page
   *
   * @param err - Error
   * @param req - Request object
   * @param res - Response object
   * @returns end here
   */
  public errorHandler: (err: any, ...args: Parameters<handler>) => void = (err, {res}) => {
    if (err instanceof Error) {
      res.json({
        status: 500,
        error: err.message,
        full: {
          stack: err.stack,
          stackBreak: !err.stack ? undefined : err.stack.split("\n"),
          cause: err.cause,
          causeBreak: !err.cause ? undefined : String(err.cause).split("\n"),
        }
      })
      return;
    }
    res.json({
      status: 500,
      error: err,
    });
  }

  public page404: (...args: Parameters<handler>) => void = ({res}) => {
    res.status(404).json({error: "page not exist!"});
  }

  public add(method: requestMethod|Lowercase<requestMethod>|createServer, path?: string|RegExp|handler, ...fn: handler[]): this {
    if (method instanceof createServer) {
      this.routes.push(method);
      return this;
    }
    method = method.toUpperCase() as requestMethod;
    if (!(["WSS", "ALL", "GET", "POST", "PUT", "PATCH", "HEAD", "DELETE"]).includes(method)) throw new TypeError("Invalid method");
    if (method === "WSS") throw new Error("Disabled");
    if (typeof path === "function") {
      fn = [path, ...fn];
      path = undefined;
    } else if (typeof path === "string") {
      if (!path.startsWith("^")) path = `^${path}`;
      if (!path.endsWith("$")) path = `${path}$`;
      console.log(path = RegExp(path));
    }
    this.routes.push({
      reqMethod: method,
      path: path as any,
      call: fn
    });
    return this;
  }

  /**
   * Space to JSON response
   */
  public jsonSpace = 2;

  public async callHandler(reqOld: http.IncomingMessage|http2.Http2ServerRequest, resOld: http.ServerResponse<http.IncomingMessage>|http2.Http2ServerResponse) {
    const res: response = resOld as any;
    res.status = (code) => {
      res.statusCode = code;
      return res;
    }
    res.streamPipe ??= (stream) => Object.assign(res, Promise.resolve(stream).then(str => str.pipe(res.writeHead(res.statusCode ?? 200, {}))).then(() => {}));
    res.sendText ??= (data) => Object.assign(res, Promise.resolve(data).then(data => res.writeHead(res.statusCode ?? 200, {"content-length": Buffer.byteLength(data)}).end(data)).then(() => {}));
    res.json ??= (data) => Object.assign(res, Promise.resolve(data).then(data => res.setHeader("content-type", "application/json").sendText(JSON.stringify(data, (_, value) => {
      if (typeof value === "bigint") return value.toString();
      return value;
    }, this.jsonSpace))).then(() => {}));

    // Patch to request
    const req: request = reqOld as any;
    const requestPath = new URL(reqOld.url, "http://localhost");
    req.path ??= path.posix.resolve("/", requestPath.pathname);
    req.query ??= Array.from(requestPath.searchParams.keys()).reduce((acc, key) => {
      acc[key] = requestPath.searchParams.get(key);
      return acc;
    }, {});

    req.res = req.response = res;
    req.req = req;
    req["run404"] = true;

    console.debug("Request from %O", req.path, req.method);

    for (const route of this.routes) {
      if (!res.writable) break;
      if (route instanceof createServer) await route.callHandler(req, res);
      else {
        if (!(["WSS", "ALL"]).includes(route.reqMethod)) if (route.reqMethod !== req.method) continue;
        if (route.path) if (!route.path.test(req.path)) continue;
        req["run404"] = false;
        for (const handler of route.call) {
          const resData = await Promise.resolve().then(() => handler(req, res)).then(() => null).catch(err => err);
          if (!res.writable) break;
          if (resData !== null) {
            if (res.writable) {
              try {
                this.errorHandler(resData, req, res);
              } catch {}
            }
            break;
          }
        }
      }
    }
    if (req["run404"]) this.page404(req, res);
  }

  public close() {
    this.#closeArray.forEach(k => k());
  }

  public httpListen(...args: Parameters<http.Server["listen"]>) {
    const server = http.createServer((req, res) => this.callHandler(req, res)).listen(...args);
    server.once("listening", () => this.address.push(server.address()));
    this.#closeArray.push(() => {server.close()});
    return server;
  }
  public httpsListen(options: https.ServerOptions, ...args: Parameters<https.Server["listen"]>) {
    const server = https.createServer(options, (req, res) => this.callHandler(req, res)).listen(...args);
    server.once("listening", () => this.address.push(server.address()));
    this.#closeArray.push(() => {server.close()});
    return server;
  }
  public http2Listen(options: http2.SecureServerOptions & {secureServer?: boolean}, ...args: Parameters<(http2.Http2SecureServer|http2.Http2Server)["listen"]>) {
    const server = (options.secureServer ? http2.createSecureServer(options, (req, res) => this.callHandler(req, res)) : http2.createServer((req, res) => this.callHandler(req, res))).listen(...args);
    server.once("listening", () => this.address.push(server.address()));
    this.#closeArray.push(() => {server.close()});
    return server;
  }
}