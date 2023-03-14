import { createServer } from "node:http";
import crypto from "node:crypto";

const WEBSOCKET_MAGIC_STRING_KEY = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const SEVEN_BITS_INTEGER_MARKER = 125;
const SIXTEEN_BITS_INTEGER_MARKER = 126;
// const SIXTYFOUR_BITS_INTEGER_MARKER = 127;

const MAXIMUM_SIXTEEN_BITS_INTEGER = 2 ** 16; // 0 to 65536
const MASK_KEY_BYTES_LENGTH = 4;
const OPCODE_TEXT = 0x01; // 1 bit in binary 1

// parseInt('10000000', 2)
const FIRST_BIT = 128;

function sendMessage(msg: Buffer, socket) {
  const messageSize = msg.length
  let dataFrameBuffer: Buffer;

  // 0x80 === 128 in binary
  // '0x' +  Math.abs(128).toString(16) == 0x80
  const firstByte = 0x80 | OPCODE_TEXT // single frame + text
  if (messageSize <= SEVEN_BITS_INTEGER_MARKER) {
    const bytes = [firstByte]
    dataFrameBuffer = Buffer.from(bytes.concat(messageSize))
  } else if (messageSize <= MAXIMUM_SIXTEEN_BITS_INTEGER ) {
    const offsetFourBytes = 4
    const target = Buffer.allocUnsafe(offsetFourBytes)
    target[0] = firstByte
    target[1] = SIXTEEN_BITS_INTEGER_MARKER | 0x0 // just to know the mask

    target.writeUint16BE(messageSize, 2) // content lenght is 2 bytes
    dataFrameBuffer = target

    // alloc 4 bytes
    // [0] - 128 + 1 - 10000001  fin + opcode
    // [1] - 126 + 0 - payload length marker + mask indicator
    // [2] 0 - content length
    // [3] 113 - content length
    // [ 4 - ..] - the message itself
  } else throw new Error("message too long buddy :(");
  const totalLength = dataFrameBuffer.byteLength + messageSize;
  const target = Buffer.allocUnsafe(totalLength);
  let offset = 0;
  for (const localBuffer of ([dataFrameBuffer, msg])) {
    target.set(localBuffer, offset);
    offset += localBuffer.length;
  }
  socket.write(target);
}

function prepareHandShakeHeaders(id) {
  return ([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${crypto.createHash("sha1").update(id + WEBSOCKET_MAGIC_STRING_KEY).digest("base64")}`,
    ""
  ]).map(line => line.concat("\r\n")).join("");
}

// error handling to keep the server on
(["uncaughtException", "unhandledRejection"]).forEach(event => process.on(event, (err) => {console.error(`something bad happened! event: ${event}, msg: ${err.stack || err}`);}));
const PORT = 3000;
const server = createServer((_request, response) => response.writeHead(200).end("hey there")).listen(PORT, () => console.log("server listening to", PORT));
server.on("upgrade", (req, socket, _head) => {
  const { "sec-websocket-key": webClientSocketKey } = req.headers;
  console.log(`${webClientSocketKey} connected!`)
  socket.write(prepareHandShakeHeaders(webClientSocketKey));
  socket.on("readable", () => {
    // consume optcode (first byte)
    // 1 - 1 byte - 8bits
    socket.read(1);

    const [markerAndPayloadLengh] = socket.read(1)
    // Because the first bit is always 1 for client-to-server messages
    // you can subtract one bit (128 or '10000000')
    // from this byte to get rid of the MASK bit
    const lengthIndicatorInBits = markerAndPayloadLengh - FIRST_BIT;

    let messageLength = 0;
    let getMore = false;
    if (lengthIndicatorInBits <= SEVEN_BITS_INTEGER_MARKER) messageLength = lengthIndicatorInBits;
    else if (lengthIndicatorInBits === SIXTEEN_BITS_INTEGER_MARKER) {
      // unsigned, big-endian 16-bit integer [0 - 65K] - 2 ** 16
      messageLength = socket.read(2).readUint16BE(0)
    } else {
      // 0, 0, 0, 0, 0, 1, 0, 0
      socket.read(8);
      messageLength = lengthIndicatorInBits;
      getMore = true;
      // else throw new Error(`your message is too long! we don't handle 64-bit messages`);
    }

    let maskKey = socket.read(MASK_KEY_BYTES_LENGTH);
    let encoded = socket.read(messageLength);
    if (getMore) {
      // encoded = Buffer.concat([encoded, socket.read(messageLength)]);
    }
    console.log(encoded.toJSON());
    // Unmask
    let decoded = Buffer.from(encoded || []);
    // because the maskKey has only 4 bytes
    // index % 4 === 0, 1, 2, 3 = index bits needed to decode the message

    // XOR  ^
    // returns 1 if both are different
    // returns 0 if both are equal

    // (71).toString(2).padStart(8, "0") = 0 1 0 0 0 1 1 1
    // (53).toString(2).padStart(8, "0") = 0 0 1 1 0 1 0 1
    //                                     0 1 1 1 0 0 1 0

    // (71 ^ 53).toString(2).padStart(8, "0") = '01110010'
    // String.fromCharCode(parseInt('01110010', 2))


    for (let index = 0; index < encoded?.length; index++) {
      const de = encoded[index] ^ maskKey[index % MASK_KEY_BYTES_LENGTH];
      if (de === 0x0) {
        decoded = decoded.subarray(0, index);
        break;
      }
      decoded[index] = de;
    }

    // Decode
    const data = decoded.toString("utf8");
    console.log("%O", data);
    const msg = JSON.stringify({
      message: data,
      at: new Date().toISOString()
    });
    sendMessage(Buffer.from(msg, "utf8"), socket);
  });
});