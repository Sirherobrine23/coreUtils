import { AddressInfo } from "node:net";
import EventEmitter from "node:events";
// import pathRegex from "path-to-regexp";
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

  /** Request Protocol */
  protocol: "http"|"https"|"http2";

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

export type handler = (this: server, req: Request, res?: Response, next?: (err?: any) => void) => void|Promise<void>;
export type errorHandler = (this: server, error: Error, req: Request, res: Response, next: (err?: any) => void) => void|Promise<void>;

/**
 * Create Server to use API routes.
*/
class server extends EventEmitter {
  constructor() {super({captureRejections: true});}

  on(event: "error", fn: (err: Error) => void): this;
  on(event: "listen", fn: (data: {address: string|AddressInfo, protocol: Request["protocol"]}) => void): this;
  on(event: string, fn: (...args: any[]) => void) {
    super.on(event, fn);
    return this;
  };

  once(event: "error", fn: (err: Error) => void): this;
  once(event: "listen", fn: (data: {address: string|AddressInfo, protocol: Request["protocol"]}) => void): this;
  once(event: string, fn: (...args: any[]) => void) {
    super.once(event, fn);
    return this;
  };

  public jsonSpaces = 2;

  #registerRoute(method: string, requestPath: string, ...fn: handler[]) {
    method = method.toUpperCase();
    const posixFix = (!requestPath) ? "/*" : path.posix.resolve("/", requestPath);
    if (!(this.route_registred[posixFix])) this.route_registred[posixFix] = [];
    this.route_registred.push(({
      is: "route",
      method,
      path: posixFix,
      fn: fn.filter(k => (typeof k === "function" && (k.length >= 1 && k.length <= 4))),
    }));
  }

  /**
   * Create handler for all methods
   */
  all(path: string, ...handlers: handler[]) {
    this.#registerRoute("ALL", path, ...handlers);
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  get(path: string, ...handlers: handler[]) {
    this.#registerRoute("GET", path, ...handlers);
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  post(path: string, ...handlers: handler[]) {
    this.#registerRoute("POST", path, ...handlers);
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  put(path: string, ...handlers: handler[]) {
    this.#registerRoute("PUT", path, ...handlers);
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  delete(path: string, ...handlers: handler[]) {
    this.#registerRoute("DELETE", path, ...handlers);
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  patch(path: string, ...handlers: handler[]) {
    this.#registerRoute("PATCH", path, ...handlers);
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  options(path: string, ...handlers: handler[]) {
    this.#registerRoute("OPTIONS", path, ...handlers);
    return this;
  }

  /**
   *
   * @param path - endoint path, example: "/google"
   * @param handlers - callbacks to request
   */
  head(path: string, ...handlers: handler[]) {
    this.#registerRoute("HEAD", path, ...handlers);
    return this;
  }

  /**
   * Extends with middlerares or second instace from server
   */
  use(hpath: string|(server|handler|errorHandler), ...middle: (server|handler|errorHandler)[]): this {
    let pathRoot: string;
    const gMiddle: (server|handler|errorHandler)[] = [];
    if (typeof hpath === "string") pathRoot = hpath;
    else gMiddle.push(hpath);
    gMiddle.push(...middle);
    this.route_registred.push({
      is: "middle",
      ...(pathRoot ? {
        path: path.posix.resolve("/", pathRoot),
      } : {}),
      middle: gMiddle.filter(k => k instanceof server || (typeof k === "function" && (k.length >= 1 && k.length <= 4))),
    })
    return this;
  }

  route_registred: ({
    is: "middle",
    path?: string,
    middle: (server|handler|errorHandler)[]
  } | {
    is: "route",
    method: string,
    path: string
    fn: handler[]
  })[] = [];

  async #callRequest(rawRequest: http.IncomingMessage|http2.Http2ServerRequest|Request, rawResponse: http.ServerResponse|http2.Http2ServerResponse|Response) {
    // Update Response object
    const res: Response = rawResponse as any;
    res.status ??= (code) => {res.statusCode = code; return res;}
    // patch send
    let lockHead = false;
    res.send ??= (data) => {
      if (!lockHead) {
        res.writeHead(res.statusCode ?? 200, {"content-length": String(Buffer.byteLength(data))});
        res.setHeader = (...args: any) => res;
        lockHead = true;
        res.end(data);
      }
      return res;
    };

    res.json ??= async (data, replacerFunc = null) => new Promise<void>((done, reject) => res.once("error", reject).setHeader("content-type", "application/json").send(JSON.stringify(data, replacerFunc, this.jsonSpaces)).once("close", () => done()));
    res.yaml ??= async (data) => new Promise<void>((done, reject) => res.on("error", reject).setHeader("content-type", "text/yaml, text/x-yaml").send(yaml.stringify(data)).on("close", () => done()));

    const req: Request = rawRequest as any;
    req.params ??= {};

    const { host } = req.headers || {};

    req.path ??= (() => {
      if (!req.url) return "/";
      const d = new URL(req.url, "http://"+(host || "localhost.com"));
      return path.posix.resolve("/", decodeURIComponent(d.pathname));
    })();

    req.query ??= (() => {
      if (!req.url) return {};
      const d = new URL(req.url, "http://"+(host || "localhost.com"));
      return Array.from(d.searchParams.keys()).reduce((acc, key) => {
        acc[key] = d.searchParams.get(key);
        return acc;
      }, {});
    })();

    // Inject Request and Response
    req.res = req.response = res;
    req.request = req.req = req;

    const splitedRequestPath = String(req.path).split("/");
    const routes = this.route_registred.map(route => {
      const ret: {params: {pararm: string, value: string}[], route: typeof route} = {params: [], route};
      if (!((route.is === "middle") || (route.method === req.method || route.method === "ALL"))) return null;

      // return if middle and not include path
      if (route.is === "middle") if (!route.path) return ret;

      const splitedRegistredPath = route.path.split("/");
      for (const kIndex in splitedRequestPath) {
        if (splitedRegistredPath[kIndex] === undefined) {
          if (route.is === "middle") break;
          return null;
        } else if (splitedRegistredPath[kIndex].startsWith(":")) {
          ret.params.push({
            pararm: splitedRegistredPath[kIndex].slice(1),
            value: splitedRequestPath[kIndex],
          });
        } else if (splitedRegistredPath[kIndex] !== splitedRequestPath[kIndex]) {
          if (splitedRegistredPath[kIndex] === "*") break;
          return null;
        }
      }
      return ret;
    }).filter(Boolean);

    let call = routes.shift();
    let writable = true;
    let emit404 = true;
    const initParms = Object(req.params);
    const pathBackup = String(req.path);
    while (!!call && !res.closed && writable) {
      const params = {};
      call.params.forEach(d => params[d.pararm] = d.value);
      req.params = Object.assign(initParms, params);
      for (const route of (call.route.is === "route" ? call.route.fn : call.route.middle)) {
        if (res.closed) break;
        req.path = pathBackup;

        if (call.route.is === "middle") if (call.route.path) req.path = path.posix.resolve("/", req.path.split("/").slice(call.route.path.split("/").length).join("/"));
        if (route instanceof server) {
          req["skip404"] = true;
          await route.#callRequest(req, res);
          req["skip404"] = false;
          continue;
        }

        emit404 = false;
        const next = new Promise<boolean>(async (done) => {
          const next = async (err?: any) => {
            if (this["closeEvent"]) {
              writable = false;
              return done(false);
            } else if (!err) return done(true);

            const middleCall = this.route_registred.filter((r) => r.is === "middle" && !!r.middle.find(r => typeof r === "function" && r.length >= 4));
            if (middleCall.length > 0) {
              const errCall = async (callocate: typeof middleCall) => {
                for (const b of callocate) {
                  if (res.closed) break;
                  if (b.is !== "middle") continue;
                  for (const c of b.middle) {
                    if (res.closed) break;
                    if (c instanceof server) continue;
                    if (c.length >= 4) return Promise.resolve().then(() => c.call(this, err, req, res, next)).catch(err => this.emit("error", err));
                  }
                }
              }
              await errCall(middleCall).catch(err => this.emit("error", err)).then(() => done(false));
            } else {
              if (res.closed) super.emit("error", err);
              else {
                res.status(500).json({
                  error: String(err?.message || err),
                  stack: err?.stack
                });
              }
            }

            writable = false;
            return done(false);
          }
          req.once("close", () => next.call({closeEvent: true}));
          return Promise.resolve().then(() => !res.closed ? route.call(this, req, res, next) : next.call({closeEvent: true})).catch(next);
        });
        req.path = pathBackup;
        if (await next) continue;
        break;
      }
      call = routes.shift();
    }

    if (req["skip404"]) return;
    if (!res.closed && emit404) res.status(404).json({
      error: "endpoint not registred",
      path: req.path,
      routes: this.route_registred
    });
  }

  servers: (http.Server|https.Server|http2.Http2Server)[] = [];
  serverAddress: (string | AddressInfo)[] = [];

  /** Close all listens */
  async close() {
    return Promise.all(this.servers.map(server => new Promise<void>((done, reject) => server.close(err => !!err ? reject(err) : done()))));
  }

  /**
   * Listen HTTP2 server or HTTP2 Secure Server
   */
  listen(is: "http2", secureServer?: boolean, ...args: Parameters<http2.Http2Server["listen"]>): this;
  /**
   * Listen HTTPs server to Secure Connections
   */
  listen(is: "https", options: https.ServerOptions, ...args: Parameters<https.Server["listen"]>): this;
  /**
   * Listen HTTP Server
   */
  listen(is: "http", ...args: Parameters<http.Server["listen"]>): this;
  /**
   * Listen HTTP Server
   */
  listen(): this;
  listen(is?: Request["protocol"], ...args: any[]) {
    let server: http.Server|https.Server|http2.Http2Server;
    if (is === "http2") server = (args.shift() ? http2.createSecureServer : http2.createServer)();
    else if (is === "https") server = https.createServer(args.shift());
    else {
      server = http.createServer();
      is = "http";
    }

    server.on("error", err => this.emit("error", err));
    // server.on("upgrade", (...args) => this.#callUpgrade(...args));
    server.on("request", (req, res) => {
      req["protocol"] = is;
      this.#callRequest(req, res);
    });
    server.on("listening", () => {
      const address = server.address();
      this.serverAddress.push(address);
      this.emit("listen", {address, protocol: is});
    });
    server.listen(...args);
    this.servers.push(server);
    return this;
  }
}

interface createRoute {
  Route: typeof createRoute
}

/**
 * Create similiar Express http server
 */
function createRoute() {
  return new server();
}
createRoute.Route = createRoute;
export {createRoute};