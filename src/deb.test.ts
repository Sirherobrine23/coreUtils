import { packDeb, getControl, parseRelease, parseSource } from "./deb.js";
import { streamRequest, bufferFetch } from "./request/simples.js";
import path from "node:path";
const sourceListSimples = Buffer.from("232053656520687474703a2f2f68656c702e7562756e74752e636f6d2f636f6d6d756e6974792f557067726164654e6f74657320666f7220686f7720746f207570677261646520746f0a23206e657765722076657273696f6e73206f662074686520646973747269627574696f6e2e0a64656220687474703a2f2f617263686976652e7562756e74752e636f6d2f7562756e74752f206a616d6d79206d61696e20726573747269637465640a23206465622d73726320687474703a2f2f617263686976652e7562756e74752e636f6d2f7562756e74752f206a616d6d79206d61696e20726573747269637465640a0a2323204d616a6f72206275672066697820757064617465732070726f6475636564206166746572207468652066696e616c2072656c65617365206f66207468650a232320646973747269627574696f6e2e0a64656220687474703a2f2f617263686976652e7562756e74752e636f6d2f7562756e74752f206a616d6d792d75706461746573206d61696e20726573747269637465640a23206465622d73726320687474703a2f2f617263686976652e7562756e74752e636f6d2f7562756e74752f206a616d6d792d75706461746573206d61696e20726573747269637465640a0a2323204e2e422e20736f6674776172652066726f6d2074686973207265706f7369746f727920697320454e544952454c5920554e535550504f5254454420627920746865205562756e74750a2323207465616d2e20416c736f2c20706c65617365206e6f7465207468617420736f66747761726520696e20756e6976657273652057494c4c204e4f54207265636569766520616e790a232320726576696577206f7220757064617465732066726f6d20746865205562756e7475207365637572697479207465616d2e0a64656220687474703a2f2f617263686976652e7562756e74752e636f6d2f7562756e74752f206a616d6d7920756e6976657273650a23206465622d73726320687474703a2f2f617263686976652e7562756e74752e636f6d2f7562756e74752f206a616d6d7920756e6976657273650a64656220687474703a2f2f617263686976652e7562756e74752e636f6d2f7562756e74752f206a616d6d792d7570646174657320756e6976657273650a23206465622d73726320687474703a2f2f617263686976652e7562756e74752e636f6d2f7562756e74752f206a616d6d792d7570646174657320756e6976657273650a0a2323204e2e422e20736f6674776172652066726f6d2074686973207265706f7369746f727920697320454e544952454c5920554e535550504f5254454420627920746865205562756e74750a2323207465616d2c20616e64206d6179206e6f7420626520756e64657220612066726565206c6963656e63652e20506c65617365207361746973667920796f757273656c6620617320746f0a232320796f75722072696768747320746f207573652074686520736f6674776172652e20416c736f2c20706c65617365206e6f7465207468617420736f66747761726520696e0a2323206d756c746976657273652057494c4c204e4f54207265636569766520616e7920726576696577206f7220757064617465732066726f6d20746865205562756e74750a2323207365637572697479207465616d2e0a64656220687474703a2f2f617263686976652e7562756e74752e636f6d2f7562756e74752f206a616d6d79206d756c746976657273650a23206465622d73726320687474703a2f2f617263686976652e7562756e74752e636f6d2f7562756e74752f206a616d6d79206d756c746976657273650a64656220687474703a2f2f617263686976652e7562756e74752e636f6d2f7562756e74752f206a616d6d792d75706461746573206d756c746976657273650a23206465622d73726320687474703a2f2f617263686976652e7562756e74752e636f6d2f7562756e74752f206a616d6d792d75706461746573206d756c746976657273650a0a2323204e2e422e20736f6674776172652066726f6d2074686973207265706f7369746f7279206d6179206e6f742068617665206265656e207465737465642061730a232320657874656e736976656c79206173207468617420636f6e7461696e656420696e20746865206d61696e2072656c656173652c20616c74686f75676820697420696e636c756465730a2323206e657765722076657273696f6e73206f6620736f6d65206170706c69636174696f6e73207768696368206d61792070726f766964652075736566756c2066656174757265732e0a232320416c736f2c20706c65617365206e6f7465207468617420736f66747761726520696e206261636b706f7274732057494c4c204e4f54207265636569766520616e79207265766965770a2323206f7220757064617465732066726f6d20746865205562756e7475207365637572697479207465616d2e0a64656220687474703a2f2f617263686976652e7562756e74752e636f6d2f7562756e74752f206a616d6d792d6261636b706f727473206d61696e207265737472696374656420756e697665727365206d756c746976657273650a23206465622d73726320687474703a2f2f617263686976652e7562756e74752e636f6d2f7562756e74752f206a616d6d792d6261636b706f727473206d61696e207265737472696374656420756e697665727365206d756c746976657273650a0a64656220687474703a2f2f73656375726974792e7562756e74752e636f6d2f7562756e74752f206a616d6d792d7365637572697479206d61696e20726573747269637465640a23206465622d73726320687474703a2f2f73656375726974792e7562756e74752e636f6d2f7562756e74752f206a616d6d792d7365637572697479206d61696e20726573747269637465640a64656220687474703a2f2f73656375726974792e7562756e74752e636f6d2f7562756e74752f206a616d6d792d736563757269747920756e6976657273650a23206465622d73726320687474703a2f2f73656375726974792e7562756e74752e636f6d2f7562756e74752f206a616d6d792d736563757269747920756e6976657273650a64656220687474703a2f2f73656375726974792e7562756e74752e636f6d2f7562756e74752f206a616d6d792d7365637572697479206d756c746976657273650a23206465622d73726320687474703a2f2f73656375726974792e7562756e74752e636f6d2f7562756e74752f206a616d6d792d7365637572697479206d756c746976657273650a", "hex");
const sourceListOptions = Buffer.from("646562205b7369676e65642d62793d2f7573722f73686172652f6b657972696e67732f6e6f6465736f757263652e6770675d2068747470733a2f2f6465622e6e6f6465736f757263652e636f6d2f6e6f64655f31392e78206a616d6d79206d61696e0a6465622d737263205b7369676e65642d62793d2f7573722f73686172652f6b657972696e67732f6e6f6465736f757263652e6770675d2068747470733a2f2f6465622e6e6f6465736f757263652e636f6d2f6e6f64655f31392e78206a616d6d79206d61696e0a", "hex")

describe("Debian package", function() {
  this.timeout(Infinity);
  it("APT sources.list", async () => {
    const simples = parseSource(sourceListSimples), options = parseSource(sourceListOptions);
    return [simples, options];
  });
  it("APT Release", async () => parseRelease((await bufferFetch("http://ftp.debian.org/debian/dists/stable/Release")).data));
  it("Get control file", async () => getControl(await streamRequest("https://github.com/cli/cli/releases/download/v2.20.2/gh_2.20.2_linux_386.deb")));
  it("Create debian package", async () => {
    return packDeb({
      cwd: path.resolve("examples/debian_pack"),
      outputFile: path.resolve("examples/pack.deb"),
      compress: "gzip",
      getStream: false,
    });
  });
});