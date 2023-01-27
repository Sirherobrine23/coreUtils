export * as debianPackage from "./debian_package.js";
export * from "./debian_package.js";

import * as debianPackage from "./debian_package.js";
import * as apt from "./apt.js";
export default debianPackage.parseControl;
export { apt };