import { jsonRequest, requestOptions } from "@sirherobrine23/http";
import { parseImage } from "../image/index.js";

export interface Token {
  token: string,
  access_token?: string,
  expires_in?: number,
  issued_at?: string
}

function encodeBase64(str: string) {
  return Buffer.from(str, "utf8").toString("base64");
}

export class Auth {
  public username?: string;
  public password?: string;
  public token?: string;
  public host: string;
  public accessToken?: Token;

  async getToken(repository: parseImage, action: "pull"|"push" = "pull"): Promise<Token> {
    if (!(repository instanceof parseImage)) throw new TypeError("Require image Repository");
    this.host ??= repository.authBase ?? repository.registry;
    if (!action) action = "pull";
    const reqURL = new URL("http://"+this.host);
    const options: Omit<requestOptions, "url"> = {headers: {}, query: {}};
    if (repository.authService) options.query.service = repository.authService;
    options.query.scope = `repository:${repository.getRepo().toLowerCase()}:${action === "push" ? "push" : "pull"}`;

    if (typeof this.token === "string" && !!(this.token.trim())) options.headers.Authorization = options.headers["WWW-Authenticate"] = `Token ${this.token}`;
    else if (typeof this.username === "string" && typeof this.password === "string") {
      const { username, password } = this;
      options.headers["WWW-Authenticate"] = "Basic "+encodeBase64(`${username}:${password}`);
    }

    const errorBody = [];
    for (const protocol of (["https:", "http:"])) {
      for (const reqPath of (["/auth/token", "/token"])) {
        reqURL.protocol = protocol;
        reqURL.pathname = reqPath;
        try {
          const { body } = await jsonRequest(reqURL, options);
          return (this.accessToken = body);
        } catch (err) {
          if (err?.rawBody) errorBody.push(err.rawBody);
        }
      }
    }
    throw new Error(String(errorBody.at(-1) ?? "Cannot get token"));
  }
}