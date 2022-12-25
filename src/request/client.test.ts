import * as client from "./client.js";

describe("Client HTTP Request", function(){
  this.timeout(Infinity);
  it("External IP", async () => client.getExternalIP());
});