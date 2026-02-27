import fs, { write } from "fs";
import WebSocket from "ws";

const dbFile = "./db.json";

// Handle Database from json file
const readDB = () => {
  const data = fs.readFileSync(dbFile, "utf-8");
  return JSON.parse(data);
};

const writeDB = (data) => {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
};

const sendRespone = (ws, action, status, msg) => {
  ws.send(
    JSON.stringify({
      action: action,
      status: status,
      message: msg,
    }),
  );
};

const updateRoomMembers = (roomId, wsClients) => {
  const db = readDB();

  const room = db.rooms.find((r) => r.id === roomId);

  if (!room) {
    return;
  }

  const wsList = room.members
    .map((id) => wsClients.get(id))
    .filter((ws) => ws && ws.readyState === WebSocket.OPEN);

  const memberList = db.users
    .filter((user) => room.members.includes(user.id))
    .map((user) => ({
      id: user.id,
      name: user.name,
    }));

  console.log(memberList);

  wsList.forEach((ws) => {
    sendRespone(ws, "updateMembers", 200, memberList);
  });
};

const broadcastClients = (wsClients, roomId, action, id) => {
  const db = readDB();

  const room = db.rooms.find((r) => r.id === roomId);

  if (!room) {
    return;
  }

  const wsList = room.members
    .map((id) => wsClients.get(id))
    .filter((ws) => ws && ws.readyState === WebSocket.OPEN);

  let data;

  switch (action) {
    case 'memberLeft': {
      data = id;
      break;
    }
  }

  wsList.forEach((ws) => {
    sendRespone(ws, action, 200, data);
  });
}

export { readDB, writeDB, sendRespone, updateRoomMembers, broadcastClients};
