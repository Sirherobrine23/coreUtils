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

/**
 * Create Server to use API routes.
*/
class server extends EventEmitter {
  constructor() {super({captureRejections: true});}

  public jsonSpaces = 2;

  route_registred: {[path: string]: {method: string, fn: handler[]}[]} = {};
  #registerRoute(method: string, requestPath: string, ...fn: handler[]) {
    method = method.toUpperCase();
    const posixFix = (!requestPath) ? "/*" : path.posix.resolve("/", requestPath);
    if (!(this.route_registred[posixFix])) this.route_registred[posixFix] = [];
    this.route_registred[posixFix].push(({
      method,
      fn,
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

  async #callRequest(rawRequest: http.IncomingMessage|http2.Http2ServerRequest|Request, rawResponse: http.ServerResponse|http2.Http2ServerResponse|Response) {
    // Update Response object
    const res: Response = rawResponse as any;
    res.status ??= (code) => {res.statusCode = code; return res;}
    res.send ??= (data) => res.writeHead(res.statusCode ?? 200, {"content-length": String(Buffer.byteLength(data))}).end(data);
    res.json ??= async (data, replacerFunc = null) => new Promise<void>((done, reject) => res.once("error", reject).setHeader("content-type", "application/json").send(JSON.stringify(data, replacerFunc, this.jsonSpaces)).once("close", () => done()));
    res.yaml ??= async (data) => new Promise<void>((done, reject) => res.on("error", reject).setHeader("content-type", "text/yaml, text/x-yaml").send(yaml.stringify(data)).on("close", () => done()));

    const req: Request = rawRequest as any;
    req.params = {};
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
    const routes = Object.keys(this.route_registred).map(key => {
      const fn = this.route_registred[key].filter(d => d.method === req.method || d.method === "ALL");
      if (!fn.length) return null;
      const splitedRegistredPath = key.split("/");
      const params: {pararm: string, value: string}[] = [];
      for (const kIndex in splitedRequestPath) {
        if (splitedRegistredPath[kIndex] === undefined) return null;
        else if (splitedRegistredPath[kIndex].startsWith(":")) {
          params.push({
            pararm: splitedRegistredPath[kIndex].slice(1),
            value: splitedRequestPath[kIndex],
          });
        } else if (splitedRegistredPath[kIndex] !== splitedRequestPath[kIndex]) {
          if (splitedRegistredPath[kIndex] === "*") break;
          return null;
        }
      }
      return {
        params,
        fn
      };
    }).filter(Boolean);

    let call = routes.shift();
    let writable = true;
    let emit404 = true;
    while (!!call && !res.closed && writable) {
      req.params = {};
      call.params.forEach(d => req.params[d.pararm] = d.value);
      for (const callFunc of call.fn.map(({fn}) => fn).flat()) {
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
          return Promise.resolve().then(() => res.writable ? callFunc.call(this, req, res, next) : next.call({closeEvent: true})).catch(next);
        });
        if (await next) continue;
        break;
      }
      call = routes.shift();
    }

    if (!res.closed && emit404) res.status(404).json({
      error: "endpoint not registred",
      routes: this.route_registred
    });
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
    server.on("listening", () => this.serverAddress.push(server.address()));
    server.listen(...args);
    return server;
  }
}

/**
 * Create similiar Express http server
 */
export function createRoute() {return new server();}