import * as googleDriver from "./googleDrive.js";
import * as oracleBucket from "./oracleBucket.js";
export {
  googleDriver,
  oracleBucket
};

export default {
  oracleBucket: Object.assign(oracleBucket.oracleBucket, oracleBucket),
  googleDriver: Object.assign(googleDriver.GoogleDriver, googleDriver),
};