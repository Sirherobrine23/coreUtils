import { createHash, createHashAsync } from "./extendsCrypto.js";
import crypto from "node:crypto";
import { Readable } from "node:stream";

describe("Extends Crypto", function (){
  this.timeout(8 * 1000);
  it("Create hash callback", (done) => {
    let randomBuffer = crypto.randomBytes(Math.floor(Math.random() * 1000000));
    Readable.from(randomBuffer).pipe(createHash("all", (err, hash) => {
      if (err||!hash) return done(err||new Error("Hash is undefined"));
      if (hash.dataReceived !== randomBuffer.byteLength) return done(new Error("Data received is not equal to the buffer length"));
      randomBuffer = null as any;
      done();
    }));
  });

  it("Create hash async/Promise", async () => {
    let randomBuffer = crypto.randomBytes(Math.floor(Math.random() * 1000000));
    const hash = await createHashAsync(randomBuffer);
    if (hash.dataReceived !== randomBuffer.byteLength) throw new Error("Data received is not equal to the buffer length");
    randomBuffer = null as any;
  });
});