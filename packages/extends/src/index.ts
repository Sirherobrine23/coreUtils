import * as promiseChildProcess from "./child_process.js";
import * as extendsCrypto from "./crypto.js";
import * as extendsStream from "./stream.js";
import * as extendsFS from "./fs.js";

export * from "./fs.js";
export { promiseChildProcess, extendsCrypto, extendsStream, extendsFS };
export default Object.assign({}, extendsFS, {
  promiseChildProcess,
  extendsCrypto,
  extendsStream,
  extendsFS
});