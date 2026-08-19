import http from "node:http";
import crypto from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4211);
const rooms = new Map();
const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".glb": "model/gltf-binary", ".mp3": "audio/mpeg", ".mind": "application/octet-stream",
};

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = normalize(pathname).replace(/^([/\\])+/, "");
  let file = join(root, relative || "index.html");
  if (!file.startsWith(root) || !existsSync(file)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("未找到文件");
    return;
  }
  if (statSync(file).isDirectory()) file = join(file, "index.html");
  response.writeHead(200, {
    "Content-Type": mime[extname(file).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(file).pipe(response);
});

server.on("upgrade", (request, socket) => {
  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
  if (url.pathname !== "/paleo21-ws") return socket.destroy();
  const roomCode = String(url.searchParams.get("room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  if (roomCode.length < 4) return socket.destroy();
  const key = request.headers["sec-websocket-key"];
  if (!key) return socket.destroy();
  const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);

  const room = rooms.get(roomCode) || [];
  if (room.length >= 2) {
    writeJson(socket, { type: "room-full" });
    socket.end();
    return;
  }
  const client = { socket, seat: room.length === 0 ? "player" : "opponent", buffer: Buffer.alloc(0), left: false };
  room.push(client);
  rooms.set(roomCode, room);
  writeJson(socket, { type: "welcome", room: roomCode, seat: client.seat, peerConnected: room.length === 2 });
  room.filter((entry) => entry !== client).forEach((entry) => writeJson(entry.socket, { type: "peer", state: "joined", seat: client.seat }));
  if (room.length === 2) writeJson(socket, { type: "peer", state: "joined", seat: room[0].seat });

  socket.on("data", (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    while (true) {
      const frame = readFrame(client.buffer);
      if (!frame) break;
      client.buffer = client.buffer.subarray(frame.bytes);
      if (frame.opcode === 0x8) {
        if (socket.writable) socket.write(Buffer.from([0x88, 0x00]));
        return socket.end();
      }
      if (frame.opcode !== 0x1) continue;
      let payload;
      try { payload = JSON.parse(frame.payload.toString("utf8")); } catch { continue; }
      room.filter((entry) => entry !== client).forEach((entry) => writeJson(entry.socket, { ...payload, from: client.seat }));
    }
  });
  const leave = () => {
    if (client.left) return;
    client.left = true;
    const current = rooms.get(roomCode) || [];
    const next = current.filter((entry) => entry !== client);
    if (next.length) rooms.set(roomCode, next); else rooms.delete(roomCode);
    next.forEach((entry) => writeJson(entry.socket, { type: "peer", state: "left", seat: client.seat }));
  };
  socket.once("close", leave);
  socket.once("error", leave);
});

function writeJson(socket, value) {
  if (!socket.writable) return;
  const payload = Buffer.from(JSON.stringify(value));
  let header;
  if (payload.length < 126) header = Buffer.from([0x81, payload.length]);
  else if (payload.length < 65536) {
    header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  socket.write(Buffer.concat([header, payload]));
}

function readFrame(buffer) {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 0x0f;
  const masked = Boolean(buffer[1] & 0x80);
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) { if (buffer.length < 4) return null; length = buffer.readUInt16BE(2); offset = 4; }
  else if (length === 127) { if (buffer.length < 10) return null; length = Number(buffer.readBigUInt64BE(2)); offset = 10; }
  const maskBytes = masked ? 4 : 0;
  if (buffer.length < offset + maskBytes + length) return null;
  const mask = masked ? buffer.subarray(offset, offset + 4) : null;
  offset += maskBytes;
  const payload = Buffer.from(buffer.subarray(offset, offset + length));
  if (mask) for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
  return { opcode, payload, bytes: offset + length };
}

server.listen(port, "0.0.0.0", () => {
  console.log(`冰河史前21点 AR 精修副本：http://127.0.0.1:${port}/paleo21/index.html`);
  console.log(`底板预览：http://127.0.0.1:${port}/底板-含卡槽与藏牌区.html`);
});
