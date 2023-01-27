export * from "./crypto.js";
export * from "./fs.js";
export * as extendsCrypto from "./crypto.js";
export * as extendsFS from "./fs.js";

// Default export
import * as extendsCrypto from "./crypto.js";
import * as extendsFS from "./fs.js";
export default {
  extendsCrypto,
  extendsFS
}