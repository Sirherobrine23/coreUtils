export * from "./main.js";
import * as http from "./main.js";
import * as large from "./large.js";
export { large, http };

export default {
  json: http.default,
  saveFile: large.default,
};
