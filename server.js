import fs from "fs";
import https from "https";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import { readDB, writeDB, sendRespone, updateRoomMembers, broadcastClients } from "./utils.js";

const app = express();
const PORT = 2706;

const resetDBOnStart = () => {
  try {
    const db = readDB();
    db.users = [];
    db.rooms.forEach(room => {
      room.members = [];
      room.inCallMembers = [];
      room.status = 'standby';
    });
    writeDB(db);
    console.log("[SYSTEM] Database has been cleared and reset.");
  } catch (err) {
    writeDB({ users: [], rooms: [] });
  }
};
resetDBOnStart();

let ssl;
try {
  ssl = {
    key: fs.readFileSync("./certs/key.pem"),
    cert: fs.readFileSync("./certs/cert.pem"),
  };
} catch (err) {
  console.error("SSL ERROR: Vui lòng kiểm tra lại chứng chỉ trong ./certs");
  process.exit(1);
}

const server = https.createServer(ssl, app);
app.use(express.static("public"));
const wss = new WebSocketServer({ server });

let clients = new Map();
let wsClients = new Map();

const cleanupEmptyRooms = (db) => {
    const initialRoomCount = db.rooms.length;
    db.rooms = db.rooms.filter(room => room.members && room.members.length > 0);
    if (db.rooms.length < initialRoomCount) {
      console.log(`[CLEANUP] Đã xóa các phòng trống. Số lượng phòng hiện tại: ${db.rooms.length}`);
    }
};

wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  ws.on("close", () => {
    const userId = clients.get(ws);
    if (userId) {
      const db = readDB();
      db.rooms.forEach(room => {
        if (room.members.includes(userId)) {
          room.members = room.members.filter(id => id !== userId);
          room.inCallMembers = room.inCallMembers.filter(id => id !== userId);
          if (room.inCallMembers.length === 0) room.status = 'standby';
          broadcastClients(wsClients, room.id, "memberLeft", userId);
          updateRoomMembers(room.id, wsClients);
        }
      });
      cleanupEmptyRooms(db);
      db.users = db.users.filter(u => u.id !== userId);
      writeDB(db);
      clients.delete(ws);
      wsClients.delete(userId);
    }
  });

  ws.on("message", (message) => {
    let msg;
    try { msg = JSON.parse(message); } catch (e) { return; }

    switch (msg.action) {
      case "register":
        const db = readDB();
        const user = { id: crypto.randomUUID(), name: msg.name, status: 'standby' };
        db.users.push(user);
        writeDB(db);
        clients.set(ws, user.id);
        wsClients.set(user.id, ws);
        sendRespone(ws, "register", 200, user);
        break;

      case "joinRoom": {
        const database = readDB();
        let room = database.rooms.find(r => r.id === msg.roomId);
        const uid = clients.get(ws);
        if (!room) {
          room = { id: msg.roomId, members: [], inCallMembers: [], status: 'standby' };
          database.rooms.push(room);
          console.log(`[ROOM] Created new room: ${msg.roomId}`);
        }
        if (!room.members.includes(uid)) room.members.push(uid);
        writeDB(database);
        sendRespone(ws, "joinRoom", 200, room);
        updateRoomMembers(msg.roomId, wsClients);
        break;
      }

      case "inviteCall":
        const dbCall = readDB();
        const rCall = dbCall.rooms.find(r => r.id === msg.roomId);
        if (!rCall) break;
        const senderId = clients.get(ws);
        rCall.status = "calling";
        if (!rCall.inCallMembers.includes(senderId)) rCall.inCallMembers.push(senderId);
        writeDB(dbCall);
        rCall.members.forEach(mId => {
          const target = wsClients.get(mId);
          if (target && mId !== senderId) {
            target.send(JSON.stringify({ action: "callStarted", roomId: rCall.id }));
          }
        });
        sendRespone(ws, "startMesh", 200, rCall.members.filter(id => id !== senderId));
        break;

      case "joinCall":
        const dbJoin = readDB();
        const rJoin = dbJoin.rooms.find(r => r.id === msg.roomId);
        const myId = clients.get(ws);
        if (rJoin && !rJoin.inCallMembers.includes(myId)) rJoin.inCallMembers.push(myId);
        writeDB(dbJoin);
        sendRespone(ws, "startMesh", 200, rJoin.inCallMembers.filter(id => id !== myId));
        break;

      case "offer":
      case "answer":
      case "candidate":
        const targetWs = wsClients.get(msg.target);
        if (targetWs) targetWs.send(JSON.stringify(msg));
        break;

      case "leaveCall": {
        const dbL = readDB();
        const roomL = dbL.rooms.find(r => r.id === msg.roomId);
        if (roomL) {
          roomL.inCallMembers = roomL.inCallMembers.filter(id => id !== msg.userId);
          if (roomL.inCallMembers.length === 0) roomL.status = 'standby';
          writeDB(dbL);
          broadcastClients(wsClients, msg.roomId, "memberLeft", msg.userId);
          updateRoomMembers(msg.roomId, wsClients);
        }
        break;
      }

      case "leaveRoom": {
        const db = readDB();
        const userId = clients.get(ws);
        const room = db.rooms.find(r => r.id === msg.roomId);
        if (room) {
          room.members = room.members.filter(id => id !== userId);
          room.inCallMembers = room.inCallMembers.filter(id => id !== userId);
          broadcastClients(wsClients, room.id, "memberLeft", userId);
          cleanupEmptyRooms(db);
          writeDB(db);
          updateRoomMembers(room.id, wsClients);
        }
        break;
      }
    }
  });
});

server.listen(PORT, "0.0.0.0", () => console.log(`Server Active: https://localhost:${PORT}`));
