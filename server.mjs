import http from "node:http";
import crypto from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4211);
const rooms = new Map();
const staleClientMs = 75000;
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
  const clientId = String(url.searchParams.get("client") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  if (roomCode.length < 4) return socket.destroy();
  const key = request.headers["sec-websocket-key"];
  if (!key) return socket.destroy();
  const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);

  const now = Date.now();
  let room = (rooms.get(roomCode) || []).filter((entry) => {
    const alive = !entry.left && !entry.socket.destroyed && entry.socket.writable && now - entry.lastSeen < staleClientMs;
    if (!alive) {
      entry.left = true;
      entry.socket.destroy();
    }
    return alive;
  });
  const replaced = clientId ? room.find((entry) => entry.clientId === clientId) : null;
  const replacedSeat = replaced?.seat || null;
  if (replaced) {
    replaced.left = true;
    replaced.socket.destroy();
    room = room.filter((entry) => entry !== replaced);
  }
  if (room.length) rooms.set(roomCode, room); else rooms.delete(roomCode);
  if (room.length >= 2) {
    writeJson(socket, { type: "room-full" });
    socket.end();
    return;
  }
  const client = {
    socket,
    clientId,
    seat: replacedSeat || (room.some((entry) => entry.seat === "player") ? "opponent" : "player"),
    buffer: Buffer.alloc(0),
    left: false,
    lastSeen: now,
  };
  socket.setKeepAlive(true, 12000);
  room.push(client);
  rooms.set(roomCode, room);
  writeJson(socket, { type: "welcome", room: roomCode, seat: client.seat, peerConnected: room.length === 2 });
  room.filter((entry) => entry !== client).forEach((entry) => writeJson(entry.socket, { type: "peer", state: "joined", seat: client.seat }));
  if (room.length === 2) writeJson(socket, { type: "peer", state: "joined", seat: room[0].seat });

  socket.on("data", (chunk) => {
    client.lastSeen = Date.now();
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
      if (payload.type === "heartbeat") {
        writeJson(socket, { type: "heartbeat", serverTime: Date.now() });
        continue;
      }
      const liveRoom = rooms.get(roomCode) || [];
      liveRoom
        .filter((entry) => entry !== client && !entry.left && entry.socket.writable)
        .forEach((entry) => writeJson(entry.socket, { ...payload, from: client.seat }));
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

const staleSweep = setInterval(() => {
  const now = Date.now();
  for (const [roomCode, room] of rooms) {
    const stale = room.filter((entry) => entry.left || entry.socket.destroyed || !entry.socket.writable || now - entry.lastSeen >= staleClientMs);
    if (!stale.length) continue;
    stale.forEach((entry) => {
      entry.left = true;
      entry.socket.destroy();
    });
    const next = room.filter((entry) => !stale.includes(entry));
    if (next.length) rooms.set(roomCode, next); else rooms.delete(roomCode);
    next.forEach((entry) => writeJson(entry.socket, { type: "peer", state: "left" }));
  }
}, 15000);
staleSweep.unref();

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
  console.log(`双游戏交付版：http://127.0.0.1:${port}/`);
});
