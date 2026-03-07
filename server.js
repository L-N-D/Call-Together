import fs, { read } from "fs";
import https from "https";
import express, { json } from "express";
import { WebSocketServer } from "ws";
import path from "path";
const app = express();
import {
  readDB,
  writeDB,
  sendRespone,
  updateRoomMembers,
  broadcastClients,
} from "./utils.js";

const PORT = 2706;

let ssl;

try {
  ssl = {
    key: fs.readFileSync("./certs/key.pem"),
    cert: fs.readFileSync("./certs/cert.pem"),
  };
} catch (err) {
  console.error("SSL ERROR");
  process.exit(1);
}

const server = https.createServer(ssl, app);

app.use(express.static("public"));

const wss = new WebSocketServer({ server });

// manage online users
let clients = new Map();
let wsClients = new Map();

// ===================================================================================================
// Handle connection
// ===================================================================================================
wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  console.log(`[CONNECTION] [${ip}] New connection`);
  // console.log(ws);
  ws.send("Connected");

  // close connection
  ws.on("close", () => {
    console.log(`[CONNECTION] [${ip}] Disconnection`);
    const id = clients.get(ws);
    const users = readDB();
    users.users = users.users.filter((user) => user.id != id);
    writeDB(users);
    clients.delete(ws);
  });

  ws.on("message", (message) => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch (err) {
      console.log("[ERROR] | Parse json message fail");
    }

    if (msg) {
      console.log(msg);

      switch (msg.action) {
        case "ping": {
          ws.isAlive = true;
          break;
        }

        case "register": {
          const db = readDB();
          if (!db.users.includes(msg.name)) {
            const user = {
              id: crypto.randomUUID(),
              status: 'standby',
              name: msg.name,
            };
            db.users.push(user);
            writeDB(db);
            clients.set(ws, user.id);
            wsClients.set(user.id, ws);
            sendRespone(ws, msg.action, 200, user);
          } else {
            sendRespone(ws, msg.action, 500, "User already exist");
          }
          break;
        }

        case "createRoom": {
          const db = readDB();

          if (db.rooms.some((room) => room.id === msg.roomId)) {
            sendRespone(ws, msg.action, 500, "Room existed");
          }

          const room = {
            id: msg.roomId,
            status: 'standby', //standby | calling
            members: [],
            inCallMembers: []
          };

          db.rooms.push(room);
          writeDB(db);

          sendRespone(ws, msg.action, 200, "Room created successfully");
          break;
        }

        case "joinRoom": {
          const db = readDB();
          const roomId = msg.roomId;
          // console.log(roomId);
          const room = db.rooms.find((r) => r.id === roomId);
          if (!room) {
            sendRespone(ws, msg.action, 404, "Room not found");
            break;
          }

          room.members.push(clients.get(ws));
          writeDB(db);
          const asw = {
            id: roomId,
            status: room.status,
            members: room.members
          }
          sendRespone(ws, msg.action, 200, asw);
          updateRoomMembers(roomId, wsClients);

          break;
        }

        case "leaveRoom": {
          const db = readDB();
          const room = db.rooms.find((r) => r.id === msg.roomId);
          if (!room) {
            sendRespone(ws, msg.action, 500, "Room not found");
            break;
          }

          room.members = room.members.filter(
            (member) => member != clients.get(ws),
          );
          room.inCallMembers = room.inCallMembers.filter(m => m !== clients.get(ws));
          if (room.members.length === 0) {
            db.rooms = db.rooms.filter((r) => r.id != room.id);
          }
          writeDB(db);
          sendRespone(ws, msg.action, 200, msg.roomId);
          updateRoomMembers(msg.roomId, wsClients);
          break;
        }

        case "offer":
        case "answer":
        case "candidate": {
          const targetWs = wsClients.get(msg.target);
          if (targetWs && targetWs.readyState === targetWs.OPEN) {
            targetWs.send(JSON.stringify(msg));
          } else {
            sendRespone(ws, msg.action, 500, "Target not reachable");
          }
          break;
        }

        // When a member press endCall button,
        // they are still in the room,
        // but other members should know someone left and cleanup the peer connection to them.
        case "leaveCall": {
          const db = readDB();
          const room = db.rooms.find(r => r.id === msg.roomId);
          if (!room) {
            sendRespone(ws, msg.action, 500, "Room not found");
            break;
          }
          room.inCallMembers = room.inCallMembers.filter(u => u !== msg.userId);
          if (room.inCallMembers.length === 0) {
            room.status = 'standby';
          }
          writeDB(db);
          broadcastClients(wsClients, msg.roomId, "memberLeft", msg.userId);
          break;
        }

        case "inviteCall": { //roomId
          const db = readDB();
          const room = db.rooms.find((r) => r.id === msg.roomId);
          if (!room) {
            sendRespone(ws, msg.action, 404, "Room not found");
            break;
          }

          // Add user into inCallMember array
          const me = clients.get(ws);

          if (!room.inCallMembers.includes(me)) {
            room.inCallMembers.push(me);
          }
          room.status = 'calling';

          writeDB(db);

          // send Invite Call to all members who have not joined in the call
          room.members.forEach((memberId) => {
            // ensure dont resend the invite to the owner of the call
            if (memberId !== me && !(room.inCallMembers.includes(memberId))) {
              const targetWs = wsClients.get(memberId);
              // console.log(memberId);
              if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(
                  JSON.stringify({
                    action: "inviteCall",
                    sender: me,
                    roomId: msg.roomId,
                  }),
                );
              }
            }
          });

          // sendRespone(ws, msg.action, 200, "Join request sent");
          break;
        }

        case 'inCall': { //roomId
          const db = readDB();
          const room = db.rooms.find(r => r.id === msg.roomId);
          if (!room) { break; }
          room.inCallMembers.push(clients.get(ws));
          writeDB(db);
          break;
        }

        case 'joinRequest': { //roomId
          const db = readDB();
          const room = db.rooms.find(r => r.id === msg.roomId);
          if (!room) { break; }
          sendRespone(ws, msg.action, 200, room.inCallMembers);
          break;
        }

        case "inviteResponse": {
          const targetWs = wsClients.get(msg.target);
          const db = readDB();
          const room = db.rooms.find(r => r.id === msg.roomId);
          if (!room) { break; }
          if (msg.response) {
            const myId = clients.get(ws);
            if (!room.inCallMembers.includes(myId)) {
              room.inCallMembers.push(myId);
            }
          }
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(
              JSON.stringify({
                action: "inviteResponse",
                accepted: msg.response,
                target: clients.get(ws),
                roomId: msg.roomId,
              }),
            );
          } else {
            sendRespone(ws, msg.action, 500, "Target not reachable");
          }
          break;
        }

        case "logout": {
          const db = readDB();
          db.users = db.users.filter((user) => user.name != msg.name);
          clients.delete(ws);
          writeDB(db);
          break;
        }
      }
    } else {
      ws.send("Message is not in correct format of JSON");
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server status: [Active]");
});
