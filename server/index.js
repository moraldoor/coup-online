import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { randomInt } from "crypto";

const app = express();
app.use(cors());
app.get("/health", (_req, res) => res.json({ ok: true, name: "COUP ONLINE" }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms = new Map();
const PORT = process.env.PORT || 3001;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 6;

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[randomInt(chars.length)];
  return code;
}
function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players: room.players.map(p => ({
      id: p.id, name: p.name, ready: p.ready, isHost: p.id === room.hostId
    }))
  };
}
function emitRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}
function cleanName(value) {
  return String(value || "").trim().slice(0, 14);
}

io.on("connection", socket => {
  socket.on("room:create", ({ name }, reply = () => {}) => {
    const playerName = cleanName(name);
    if (!playerName) return reply({ ok: false, error: "닉네임을 입력해 주세요." });

    let code;
    do { code = makeCode(); } while (rooms.has(code));
    const room = {
      code, hostId: socket.id, status: "lobby",
      players: [{ id: socket.id, name: playerName, ready: true }]
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    reply({ ok: true, room: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("room:join", ({ code, name }, reply = () => {}) => {
    const roomCode = String(code || "").trim().toUpperCase();
    const playerName = cleanName(name);
    const room = rooms.get(roomCode);
    if (!playerName) return reply({ ok: false, error: "닉네임을 입력해 주세요." });
    if (!room) return reply({ ok: false, error: "방을 찾을 수 없습니다. 방 코드를 확인해 주세요." });
    if (room.status !== "lobby") return reply({ ok: false, error: "이미 게임이 시작된 방입니다." });
    if (room.players.length >= MAX_PLAYERS) return reply({ ok: false, error: "방이 가득 찼습니다. (최대 6명)" });
    if (room.players.some(p => p.name.toLowerCase() === playerName.toLowerCase()))
      return reply({ ok: false, error: "이미 사용 중인 닉네임입니다." });

    room.players.push({ id: socket.id, name: playerName, ready: false });
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    reply({ ok: true, room: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("player:ready", ({ ready }, reply = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== "lobby") return reply({ ok: false, error: "대기방을 찾을 수 없습니다." });
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return reply({ ok: false, error: "플레이어 정보를 찾을 수 없습니다." });
    player.ready = Boolean(ready);
    emitRoom(room);
    reply({ ok: true });
  });

  socket.on("game:start", (_payload, reply = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return reply({ ok: false, error: "방을 찾을 수 없습니다." });
    if (room.hostId !== socket.id) return reply({ ok: false, error: "방장만 게임을 시작할 수 있습니다." });
    if (room.players.length < MIN_PLAYERS) return reply({ ok: false, error: "게임을 시작하려면 최소 3명이 필요합니다." });
    if (room.players.length > MAX_PLAYERS) return reply({ ok: false, error: "최대 인원은 6명입니다." });
    if (!room.players.every(p => p.ready)) return reply({ ok: false, error: "모든 플레이어가 준비를 완료해야 합니다." });

    room.status = "starting";
    emitRoom(room);
    io.to(room.code).emit("game:starting", { message: "게임 준비 단계가 완료되었습니다. 다음 개발 단계에서 실제 게임 규칙이 연결됩니다." });
    reply({ ok: true });
  });

  socket.on("room:leave", () => leaveRoom(socket));
  socket.on("disconnect", () => leaveRoom(socket));
});

function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.data.roomCode = null;
  if (!room) return;
  room.players = room.players.filter(p => p.id !== socket.id);
  socket.leave(code);
  if (room.players.length === 0) {
    rooms.delete(code);
    return;
  }
  if (room.hostId === socket.id) room.hostId = room.players[0].id;
  emitRoom(room);
}

httpServer.listen(PORT, () => {
  console.log(`COUP ONLINE server listening on http://localhost:${PORT}`);
});