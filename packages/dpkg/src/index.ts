import * as apt from "./apt.js";
import * as dpkg from "./dpkg.js";

export default Object.assign({}, dpkg, { apt, dpkg });
export * from "./dpkg.js";
export { apt, dpkg };