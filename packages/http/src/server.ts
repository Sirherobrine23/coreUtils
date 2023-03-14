import { AddressInfo } from "node:net";
import stream from "node:stream";
import crypto from "node:crypto";
import http2 from "node:http2"
import https from "node:https";
import http from "node:http";
import path from "node:path";
import yaml from "yaml";

const WEBSOCKET_MAGIC_STRING_KEY = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const SEVEN_BITS_INTEGER_MARKER = 125;
const SIXTEEN_BITS_INTEGER_MARKER = 126;
// const SIXTYFOUR_BITS_INTEGER_MARKER = 127;

const MAXIMUM_SIXTEEN_BITS_INTEGER = 2 ** 16; // 0 to 65536
const MASK_KEY_BYTES_LENGTH = 4;
const OPCODE_TEXT = 0x01; // 1 bit in binary 1

// parseInt('10000000', 2)
const FIRST_BIT = 128;
export interface response extends http.ServerResponse<request> {
  status(code: number): this;
  streamPipe(data: stream.Readable): this;
  sendText(data: string): this;
  json(data: any): this;
  yaml(data: any): this;
};

export interface request extends http.IncomingMessage {
  req: this;
  res: response;
  response: response;

  path: string;
  query: {[queryName: string]: string};
  body: any;
};

export interface wssRequest extends http.IncomingMessage {}
export interface wssSocket extends stream.Duplex {
  sendMessage(msg: string): void;

  on(event: "message", fn: (data: string) => void): this;
  on(event: "close", listener: () => void): this;
  on(event: "data", listener: (chunk: any) => void): this;
  on(event: "end", listener: () => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: "pause", listener: () => void): this;
  on(event: "readable", listener: () => void): this;
  on(event: "resume", listener: () => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;

  once(event: "message", fn: (data: string) => void): this;
  once(event: "close", listener: () => void): this;
  once(event: "data", listener: (chunk: any) => void): this;
  once(event: "end", listener: () => void): this;
  once(event: "error", listener: (err: Error) => void): this;
  once(event: "pause", listener: () => void): this;
  once(event: "readable", listener: () => void): this;
  once(event: "resume", listener: () => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;

}

export type handler = (req: request, res?: response) => void|any;
export type wssHandler = (wssRequest: wssRequest, wssSocket: wssSocket) => void|any;

export type requestMethod = "WSS"|"ALL"|"GET"|"POST"|"PUT"|"PATCH"|"HEAD"|"DELETE";
export default class createServer {
  public address: (string | AddressInfo)[] = [];
  public routes: (createServer|{
    reqMethod: requestMethod,
    path?: RegExp,
    call: (handler|wssHandler)[]
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

  public add(method: "WSS"|"wss", path?: string|RegExp|wssHandler, ...fn: (wssHandler)[]): this;
  public add(method: requestMethod|Lowercase<requestMethod>|createServer, path?: string|RegExp|handler, ...fn: (handler)[]): this;
  public add(method: requestMethod|Lowercase<requestMethod>|createServer, path?: string|RegExp|handler|wssHandler, ...fn: (handler|wssHandler)[]): this {
    if (method instanceof createServer) {this.routes.push(method); return this;}
    if (!(["WSS", "ALL", "GET", "POST", "PUT", "PATCH", "HEAD", "DELETE"]).includes(method = method.toUpperCase() as requestMethod)) throw new TypeError("Invalid method");
    if (typeof path === "function") {
      fn = [path, ...fn];
      path = undefined;
    } else if (typeof path === "string") {
      if (!path.startsWith("^")) path = `^${path}`;
      if (!path.endsWith("$")) path = `${path}$`;
      path = RegExp(path);
    }
    this.routes.push({
      reqMethod: method,
      path: path as any,
      call: fn as handler[]
    });
    return this;
  }

  /**
   * Space to JSON response
   */
  public jsonSpace = 2;

  public async callHandler(reqOld: http.IncomingMessage|http2.Http2ServerRequest, resOld: http.ServerResponse<http.IncomingMessage>|http2.Http2ServerResponse) {
    const res: response = resOld as any;
    res.status ??= (code) => {res.statusCode = code; return res;}
    res.streamPipe ??= (stream) => {
      Promise.resolve(stream).then(str => str.pipe(res.writeHead(res.statusCode ?? 200, {}))).then(() => {});
      return res;
    };
    res.sendText ??= (data) => {
      res.writeHead(res.statusCode ?? 200, {
        "content-length": Buffer.byteLength(data)
      });
      return res.end(data);
    };
    res.json ??= (data) => {
      res.setHeader("content-type", "application/json").sendText(JSON.stringify(data, (_, value) => {
        if (typeof value === "bigint") return value.toString();
        return value;
      }, this.jsonSpace));
      return res;
    };
    res.yaml ??= (data) => {
      res.setHeader("content-type", "text/vnd.yaml, text/yaml, text/x-yaml").sendText(yaml.stringify(data));
      return res;
    }

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
        if (route.reqMethod === "WSS") continue;
        else if (route.reqMethod !== "ALL") if (route.reqMethod !== req.method) continue;
        if (route.path) if (!route.path.test(req.path)) continue;
        req["run404"] = false;
        for (const handler of route.call) {
          const resData = await Promise.resolve().then(() => handler(req, res as any)).then(() => null).catch(err => err);
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



  // patchs from https://github.com/ErickWendel/websockets-with-nodejs-from-scratch
  async upgradeHandler(req: http.IncomingMessage, socket: stream.Duplex, head: Buffer) {
    const { "sec-websocket-key": webClientSocketKey } = req.headers;
    console.log(`${webClientSocketKey} connected!`)
    socket.write(([
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${crypto.createHash("sha1").update(webClientSocketKey + WEBSOCKET_MAGIC_STRING_KEY).digest("base64")}`,
      ""
    ]).map(line => line.concat("\r\n")).join(""));

    function sendMessage(messageString: string) {
      const msg = Buffer.from(messageString);
      const messageSize = msg.length
      let dataFrameBuffer: Buffer;

      // 0x80 === 128 in binary
      // '0x' +  Math.abs(128).toString(16) == 0x80
      const firstByte = 0x80 | OPCODE_TEXT // single frame + text
      if (messageSize <= SEVEN_BITS_INTEGER_MARKER) {
        const bytes = [firstByte]
        dataFrameBuffer = Buffer.from(bytes.concat(messageSize))
      } else if (messageSize <= MAXIMUM_SIXTEEN_BITS_INTEGER ) {
        const offsetFourBytes = 4
        const target = Buffer.allocUnsafe(offsetFourBytes)
        target[0] = firstByte
        target[1] = SIXTEEN_BITS_INTEGER_MARKER | 0x0 // just to know the mask

        target.writeUint16BE(messageSize, 2) // content lenght is 2 bytes
        dataFrameBuffer = target

        // alloc 4 bytes
        // [0] - 128 + 1 - 10000001  fin + opcode
        // [1] - 126 + 0 - payload length marker + mask indicator
        // [2] 0 - content length
        // [3] 113 - content length
        // [ 4 - ..] - the message itself
      } else throw new Error("message too long buddy :(");
      const totalLength = dataFrameBuffer.byteLength + messageSize;
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (const localBuffer of ([dataFrameBuffer, msg])) {
        target.set(localBuffer, offset);
        offset += localBuffer.length;
      }
      socket.write(target);
    }

    socket.on("readable", () => {
      // consume optcode (first byte)
      // 1 - 1 byte - 8bits
      socket.read(1);

      const [markerAndPayloadLengh] = socket.read(1)
      // Because the first bit is always 1 for client-to-server messages
      // you can subtract one bit (128 or '10000000')
      // from this byte to get rid of the MASK bit
      const lengthIndicatorInBits = markerAndPayloadLengh - FIRST_BIT;

      let messageLength = 0;
      if (lengthIndicatorInBits <= SEVEN_BITS_INTEGER_MARKER) messageLength = lengthIndicatorInBits;
      else if (lengthIndicatorInBits === SIXTEEN_BITS_INTEGER_MARKER) {
        // unsigned, big-endian 16-bit integer [0 - 65K] - 2 ** 16
        messageLength = socket.read(2).readUint16BE(0)
      } else {
        // 0, 0, 0, 0, 0, 1, 0, 0
        // socket.read(8);
        // messageLength = lengthIndicatorInBits;
        // throw new Error(`your message is too long! we don't handle 64-bit messages`);
        socket.end(`your message is too long! we don't handle 64-bit messages`);
        return;
      }

      let maskKey = socket.read(MASK_KEY_BYTES_LENGTH);
      let encoded = socket.read(messageLength);

      // Unmask
      let decoded = Buffer.from(encoded || []);
      // because the maskKey has only 4 bytes
      // index % 4 === 0, 1, 2, 3 = index bits needed to decode the message

      // XOR  ^
      // returns 1 if both are different
      // returns 0 if both are equal

      // (71).toString(2).padStart(8, "0") = 0 1 0 0 0 1 1 1
      // (53).toString(2).padStart(8, "0") = 0 0 1 1 0 1 0 1
      //                                     0 1 1 1 0 0 1 0

      // (71 ^ 53).toString(2).padStart(8, "0") = '01110010'
      // String.fromCharCode(parseInt('01110010', 2))
      for (let index = 0; index < encoded?.length; index++) decoded[index] = encoded[index] ^ maskKey[index % MASK_KEY_BYTES_LENGTH];

      // Decode
      socket.emit("message", decoded.toString("utf8"));
    });

    const wssReq: wssRequest = req as any;
    const wssSocket: wssSocket = socket as any;
    wssSocket.sendMessage = sendMessage;
    for (const route of this.routes) {
      if (route instanceof createServer) await route.upgradeHandler(req, socket, head);
      else {
        if (route.reqMethod !== "WSS") continue;
        for (const call of route.call) call(wssReq as any, wssSocket as any);
      }
    }
  }

  #closeArray: (() => void)[] = [];
  public close() {
    this.#closeArray.forEach(k => k());
  }

  public httpListen(...args: Parameters<http.Server["listen"]>) {
    const server = http.createServer().listen(...args);
    server.once("listening", () => this.address.push(server.address()));
    server.on("error", err => console.error(err));
    server.on("request", (req, res) => this.callHandler(req, res).catch(err => server.emit("error", err)));
    server.on("upgrade", (req, socket, head) => this.upgradeHandler(req, socket, head).catch(err => server.emit("error", err)));
    this.#closeArray.push(() => {server.close()});
    return server;
  }
  public httpsListen(options: https.ServerOptions, ...args: Parameters<https.Server["listen"]>) {
    const server = https.createServer(options).listen(...args);
    server.once("listening", () => this.address.push(server.address()));
    server.on("error", err => console.error(err));
    server.on("request", (req, res) => this.callHandler(req, res).catch(err => server.emit("error", err)));
    server.on("upgrade", (req, socket, head) => this.upgradeHandler(req, socket, head).catch(err => server.emit("error", err)));
    this.#closeArray.push(() => {server.close()});
    return server;
  }
  public http2Listen(options: http2.SecureServerOptions & {secureServer?: boolean}, ...args: Parameters<(http2.Http2SecureServer|http2.Http2Server)["listen"]>) {
    const server = (options.secureServer ? http2.createSecureServer(options) : http2.createServer()).listen(...args);
    server.once("listening", () => this.address.push(server.address()));
    server.on("error", err => console.error(err));
    server.on("request", (req, res) => this.callHandler(req, res).catch(err => server.emit("error", err)));
    server.on("upgrade", (req, socket, head) => this.upgradeHandler(req, socket, head).catch(err => server.emit("error", err)));
    this.#closeArray.push(() => {server.close()});
    return server;
  }
}

const a = new createServer();
a.httpListen(3000);
a.add("get", "/", ({req, res}) => {
  (req.query.type === "json" ? res.json : res.yaml)({
    ok: true,
    header: req.headers,
    body: req.body
  });
});

a.add("wss", (req, socket) => {
  console.log(req.url);
  socket.on("message", data => {
    console.log(data);
    socket.sendMessage(JSON.stringify({
      message: data,
      d: new Date(),
    }));
  })
});