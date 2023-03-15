import { AddressInfo } from "node:net";
import EventEmitter from "node:events";
import pathRegex from "path-to-regexp";
import http2 from "node:http2";
import https from "node:https";
import http from "node:http";
import yaml from "yaml";
import path from "node:path";

export interface Request extends http.IncomingMessage {
  res: Response;
  response: Response;
  req: this;
  request: this;

  /**
   * Request path, example: "/example"
   */
  path: string;
  query: {[queryName: string]: string};
  params: {[queryName: string]: string};
}

export interface wssInterface extends EventEmitter {
  on(event: "message", fn: (data: Buffer) => void): this;
  on(event: "error", fn: (Err: Error) => void): this;
  once(event: "message", fn: (data: Buffer) => void): this;
  once(event: "error", fn: (Err: Error) => void): this;

  sendMessage(msg: string): this;
}

export interface Response extends http.ServerResponse<Request> {
  /**
   * Send JSON object and return Promise to wait connection close
   */
  json(data: any, replacerFunc?: (this: any, key: string, value: any) => any): Promise<void>;

  /**
   * Send yaml from JSON object and return Promise to wait connection close
   */
  yaml(data: any): Promise<void>;

  /**
   * Send string or Buffer with content-length
   */
  send(data: string|Buffer): this;

  /**
   * Set HTTP Status code
   */
  status(code: number): this;
}

export type RouteType = string|RegExp;
export type handler = (req: Request, res?: Response, next?: (err?: any) => void) => void|Promise<void>;

/**
 * Create Server to use API routes.
*/
class server extends EventEmitter {
  constructor() {super({captureRejections: true});}

  public jsonSpaces = 2;
  #genericRoutes: ({
    is?: "route"|"middle",
    method?: string,
    call: handler[],
    path: RegExp,
    params?: string[],
  })[] = [];

  #fixPath(route: RouteType) {
    const reg: {reg?: RegExp, params: string[]} = {params: []};
    if (route instanceof RegExp) reg.reg = route;
    else {
      route = path.posix.resolve(route);
      if (route.indexOf(":") !== -1) reg.params = route.split("/").filter(r => r.startsWith(":")).map(r => r.slice(1));
      reg.reg = pathRegex.pathToRegexp(route);
    }
    return reg;
  }

  all(path: RouteType, ...handlers: handler[]) {
    const fixedPath = this.#fixPath(path);
    this.#genericRoutes.push({
      call: handlers,
      path: fixedPath.reg,
      params: fixedPath.params
    });
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  get(path: RouteType, ...handlers: handler[]) {
    const fixedPath = this.#fixPath(path);
    this.#genericRoutes.push({
      method: "GET",
      call: handlers,
      path: fixedPath.reg,
      params: fixedPath.params
    });
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  post(path: RouteType, ...handlers: handler[]) {
    const fixedPath = this.#fixPath(path);
    this.#genericRoutes.push({
      method: "POST",
      call: handlers,
      path: fixedPath.reg,
      params: fixedPath.params
    });
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  put(path: RouteType, ...handlers: handler[]) {
    const fixedPath = this.#fixPath(path);
    this.#genericRoutes.push({
      method: "PUT",
      call: handlers,
      path: fixedPath.reg,
      params: fixedPath.params
    });
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  delete(path: RouteType, ...handlers: handler[]) {
    const fixedPath = this.#fixPath(path);
    this.#genericRoutes.push({
      method: "DELETE",
      call: handlers,
      path: fixedPath.reg,
      params: fixedPath.params
    });
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  patch(path: RouteType, ...handlers: handler[]) {
    const fixedPath = this.#fixPath(path);
    this.#genericRoutes.push({
      method: "PATCH",
      call: handlers,
      path: fixedPath.reg,
      params: fixedPath.params
    });
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  options(path: RouteType, ...handlers: handler[]) {
    const fixedPath = this.#fixPath(path);
    this.#genericRoutes.push({
      method: "OPTIONS",
      call: handlers,
      path: fixedPath.reg,
      params: fixedPath.params
    });
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  head(path: RouteType, ...handlers: handler[]) {
    const fixedPath = this.#fixPath(path);
    this.#genericRoutes.push({
      method: "HEAD",
      call: handlers,
      path: fixedPath.reg,
      params: fixedPath.params
    });
    return this;
  }

  async #callRequest(rawRequest: http.IncomingMessage|http2.Http2ServerRequest|Request, rawResponse: http.ServerResponse|http2.Http2ServerResponse|Response) {
    // Update Response object
    const res: Response = rawResponse as any;
    res.status ??= (code) => {res.statusCode = code; return res;}
    res.send ??= (data) => res.writeHead(res.statusCode ?? 200, {"content-length": String(Buffer.byteLength(data))}).end(data);
    res.json ??= async (data, replacerFunc = null) => new Promise<void>((done, reject) => res.once("error", reject).setHeader("content-type", "application/json").send(JSON.stringify(data, replacerFunc, this.jsonSpaces)).once("close", () => done()));
    res.yaml ??= async (data) => new Promise<void>((done, reject) => res.on("error", reject).setHeader("content-type", "text/yaml, text/x-yaml").send(yaml.stringify(data)).on("close", () => done()));

    const req: Request = rawRequest as any;
    req.params = {};
    req.path ??= (() => {
      if (!req.url) return "/";
      const d = new URL(req.url, "http://local.com");
      return path.posix.resolve("/", d.pathname);
    })();
    req.query ??= (() => {
      if (!req.url) return {};
      const d = new URL(req.url, "http://local.com");
      return Array.from(d.searchParams.keys()).reduce((acc, key) => {
        acc[key] = d.searchParams.get(key);
        return acc;
      }, {});
    })();

    req.res = req.response = res;
    req.request = req.req = req;

    const routes = this.#genericRoutes.filter(r => ((r.is || "route") === "route") && (!r.method ? true : rawRequest.method === r.method)).filter(call => call.path.test(String(req.path)));
    let call = routes.shift();
    let writable = true;
    let emit404 = true;
    while (!!call && !res.closed && writable) {
      req.params = {};
      if (call.params?.length > 0) {
        const match = call.path.exec(req.path);
        call.params.forEach((value, index) => req.params[value] = match[index+1]);
      }
      for (const callFunc of call.call) {
        if (res.closed) break;
        emit404 = false;
        const next = new Promise<boolean>((done) => {
          const next = (err?: any) => {
            if (this["closeEvent"]) {
              writable = false;
              return done(false);
            } else if (!err) return done(true);

            if (res.closed) super.emit("error", err);
            else {
              res.status(500).json({
                error: String(err?.message || err),
                stack: err?.stack
              });
            }
            writable = false;
            return done(false);
          }
          req.once("close", () => next.call({closeEvent: true}));
          return Promise.resolve().then(() => res.writable ? callFunc(req, res, next) : next.call({closeEvent: true})).catch(next);
        });
        if (await next) continue;
        break;
      }
      call = routes.shift();
    }

    if (!res.closed && emit404) res.status(404).json({error: "endpoint not registred"});
  }

  servers: (http.Server|null)[] = [];
  serverAddress: (string | AddressInfo)[] = [];

  /**
   * Listen HTTP2 server or HTTP2 Secure Server
   */
  listen(is: "http2", secureServer?: boolean, ...args: Parameters<http2.Http2Server["listen"]>): http2.Http2Server;

  /**
   * Listen HTTPs server to Secure Connections
   */
  listen(is: "https", options: https.ServerOptions, ...args: Parameters<https.Server["listen"]>): https.Server;

  /**
   * Listen HTTP Server
   */
  listen(is: "http", ...args: Parameters<http.Server["listen"]>): http.Server;
  /**
   * Listen HTTP Server
   */
  listen(): http.Server;
  listen(is?: "http"|"https"|"http2", ...args: any[]) {
    let server: http.Server|https.Server|http2.Http2Server;
    if (is === "http2") server = (args.shift() ? http2.createSecureServer : http2.createServer)();
    else if (is === "https") server = https.createServer(args.shift());
    else server = http.createServer();

    server.on("error", err => this.emit("error", err));
    server.on("request", (...args) => this.#callRequest(...args));
    // server.on("upgrade", (...args) => this.#callUpgrade(...args));
    server.on("listening", () => this.serverAddress.push(server.address()));
    server.listen(...args);
    return server;
  }
}

/**
 * Create similiar Express http server
 */
export function createRoute() {return new server();}