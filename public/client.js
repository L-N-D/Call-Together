// let ws;
// let localStream;
// let peerConnections = {};
// let candidateQueue = {};
// let room = {
//   id: "",
//   status: "standby",
//   members: [],
// };
// let me = {
//   id: "",
//   name: "",
//   status: "standby",
// };

// // Ice server config
// const iceConfig = {
//   iceServers: [
//     { urls: "stun:stun.cloudflare.com:3478" },
//     {
//       urls: [
//         "turn:turn.cloudflare.com:3478?transport=udp",
//         "turn:turn.cloudflare.com:3478?transport=tcp",
//         "turns:turn.cloudflare.com:5349?transport=tcp",
//       ],
//       username:
//         "g0a73b75d2beff34aa7355964343d55c45a63606c3b06c758e4f3aa4e0f2b99c",
//       credential:
//         "b37517e10764ab8724daa89c0c296d76ccb200ec445355007a1c2323da601623",
//     },
//   ],
// };

// // init wbsocket connection and request permission to access Camera and Microphone
// window.onload = async () => {
//   // init WebSocket
//   initWs();
//   // keep websocket connection alive (send ping signal every 20 second)
//   startHeartbeat();
//   // Request permission to access Camera and Microphone
//   await initLocalMedia();
// };

// async function initLocalMedia() {
//   try {
//     localStream = await navigator.mediaDevices.getUserMedia({
//       video: true,
//       audio: true,
//     });
//   } catch (err) {
//     console.warn("Full media failed, trying audio only...");
//     try {
//       localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
//     } catch {
//       try {
//         localStream = await navigator.mediaDevices.getUserMedia({
//           video: true,
//         });
//       } catch {
//         localStream = new MediaStream();
//       }
//     }
//   }

//   const localVideo = document.getElementById("localVideo");

//   if (localVideo && localStream.getVideoTracks().length > 0) {
//     localVideo.srcObject = localStream;
//   }
// }

// function initWs() {
//   const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
//   ws = new WebSocket(protocol + window.location.host);

//   ws.onopen = () => {
//     document.getElementById("connStatus").textContent = "connected";
//     // logEvent("WebSocket connected");
//   };

//   ws.onmessage = async (event) => {
//     try {
//       const msg = JSON.parse(event.data);
//       await handleResponse(msg);
//     } catch (err) {
//       console.error("Invalid JSON from server:", err);
//     }
//   };

//   ws.onclose = () => {
//     document.getElementById("connStatus").textContent = "disconnected";
//     // logEvent("WebSocket disconnected");
//     if (me.status === "calling") {
//       if (ws.readyState === WebSocket.OPEN) {
//         leaveCall();
//       }
//     }
//     me.status = "standby";
//     if (room.id) leaveRoom();
//     if (me.id) {
//       logout();
//     }
//   };
// }

// function startHeartbeat() {
//   setInterval(() => {
//     if (ws && ws.readyState === WebSocket.OPEN)
//       ws.send(JSON.stringify({ action: "ping" }));
//   }, 20000);
// }

// // ====================================================================================================
// // Handle message
// // ====================================================================================================
// async function handleResponse(msg) {
//   if (msg.status && msg.status !== 200) return alert(msg || "Server error");

//   switch (msg.action) {
//     case "register":
//       me = msg.message;
//       document.getElementById("registerDiv").style.display = "none";
//       document.getElementById("roomDiv").style.display = "block";
//       logEvent(`Registered as ${me.name}`);
//       break;

//     case "joinRoom":
//       document.getElementById("roomDiv").style.display = "none";
//       document.getElementById("callDiv").style.display = "block";
//       updateCallButtons("idle");
//       room = msg.message;
//       logEvent(`Joined Room ${room.id}`);
//       break;

//     // case "leaveRoom":
//     //   clearAllConnection(true);
//     //   break;

//     case "inviteCall":
//       handleInvite(msg.sender);
//       break;

//     case "inviteResponse":
//       handleInviteResponse(msg.accepted, msg.target);
//       break;

//     case "offer":
//       await handleOffer(msg.sender, msg.offer);
//       break;

//     case "answer":
//       await handleAnswer(msg.sender, msg.answer);
//       break;

//     case "candidate":
//       await handleCandidate(msg.sender, msg.candidate);
//       break;

//     case "memberLeft": //leave call
//       removePeer(msg.message);
//       break;

//     case "updateMembers":
//       updateMemberUI(msg.message);
//       break;
//   }
// }

// // ====================================================================================================
// // Features and Action functions
// // ====================================================================================================
// function registerUser() {
//   me.name = document.getElementById("nameInput").value.trim();
//   if (!me.name) return alert("Username is empty!");
//   ws.send(JSON.stringify({ action: "register", name: me.name }));
// }

// function createRoom() {
//   room.id = document.getElementById("roomIdInput").value.trim();
//   if (!room.id) return alert("Room ID is Empty!");
//   ws.send(JSON.stringify({ action: "createRoom", roomId: room.id }));
// }

// function joinRoom() {
//   room.id = document.getElementById("roomIdInput").value.trim();
//   if (!room.id) return alert("Room ID is Empty");
//   ws.send(JSON.stringify({ action: "joinRoom", roomId: room.id }));
// }

// function leaveRoom() {
//   clearAllConnection(true);
//   ws.send(JSON.stringify({ action: "leaveRoom", roomId: room.id }));
// }

// function logout() {
//   if (ws && ws.readyState === WebSocket.OPEN && me.name) {
//     ws.send(JSON.stringify({ action: "logout", name: me.name }));
//   }
//   clearAllConnection(true);
//   document.getElementById("registerDiv").style.display = "block";
//   document.getElementById("roomDiv").style.display = "none";
// }

// // ====================================================================================================
// // Handle Call and Helper functions
// // ====================================================================================================
// function startGroupCall() {
//   // update UI btn
//   updateCallButtons("inCall");
//   me.status = "calling";

//   // send Call invite to all members in this room
//   ws.send(JSON.stringify({ action: "inviteCall", roomId: room.id }));
// }

// function leaveCall() {
//   Object.values(peerConnections).forEach((pc) => pc.close());
//   peerConnections = {};
//   me.status = "standby";
//   ws.send(JSON.stringify({ action: "leaveCall", roomId: room.id }));
//   // Reset UI
//   updateCallButtons("idle");
//   document.getElementById("videos").innerHTML =
//     '<div class="video-wrapper"><video id="localVideo" autoplay muted playsinline></video><div class="video-label">Bạn (Local)</div></div>';
//   document.getElementById("localVideo").srcObject = localStream;
// }

// // when a member leaves call --> other members will remove the connection to this one
// function removePeer(client) {
//   const pc = peerConnections[client];

//   if (pc) {
//     pc.close();
//     delete peerConnections[client];
//   }
//   // const wrap = document.getElementById(`wrap-${client}`);
//   // if (wrap) wrap.remove();
//   // logEvent(`[${client}] left the room`);
// }

// // Receive an invitation --> answer
// function handleInvite(sender) {
//   const name = room.members.find((m) => m.id === sender)?.name || "Unknown";

//   let accept = true;
//   if (me.status !== "calling") {
//     accept = confirm(`${name} invite you to join Group Call`);
//   }

//   if (accept) {
//     me.status = "calling";
//     updateCallButtons("inCall");
//   }

//   ws.send(
//     JSON.stringify({
//       action: "inviteResponse",
//       target: sender,
//       response: accept,
//       roomId: room.id,
//     }),
//   );
// }

// // Receive respone of the invitation --> handle answer
// async function handleInviteResponse(accepted, target) {
//   if (!accepted) {
//     removePeer(target);
//     return;
//   }

//   console.log(accepted);
//   const pc = configPeerConnection(target);
//   const offer = await pc.createOffer();
//   await pc.setLocalDescription(offer);

//   ws.send(
//     JSON.stringify({
//       action: "offer",
//       offer,
//       target: target,
//       sender: me.id,
//     }),
//   );
// }

// async function handleOffer(sender, offer) {
//   const pc = configPeerConnection(sender);
//   await pc.setRemoteDescription(new RTCSessionDescription(offer));

//   if (candidateQueue[sender]) {
//     for (const c of candidateQueue[sender]) {
//       await pc.addIceCandidate(new RTCIceCandidate(c));
//     }
//     delete candidateQueue[sender];
//   }

//   const answer = await pc.createAnswer();
//   await pc.setLocalDescription(answer);

//   ws.send(
//     JSON.stringify({
//       action: "answer",
//       target: sender,
//       sender: me.id,
//       answer,
//     }),
//   );

//   if (me.status !== "calling") {
//     me.status = "calling";
//   }
//   updateCallButtons("inCall");
// }

// async function handleAnswer(target, answer) {
//   const pc = peerConnections[target];

//   if (pc) {
//     await pc.setRemoteDescription(new RTCSessionDescription(answer));
//     if (candidateQueue[target]) {
//       for (const c of candidateQueue[target]) {
//         await pc.addIceCandidate(new RTCIceCandidate(c));
//       }
//       delete candidateQueue[target];
//     }
//   }
// }

// async function handleCandidate(senderId, candidate) {
//   const pc = peerConnections[senderId];
//   if (!pc) return;

//   if (pc.remoteDescription) {
//     try {
//       await pc.addIceCandidate(new RTCIceCandidate(candidate));
//     } catch (err) {
//       console.error("Add ICE error:", err);
//     }
//   } else {
//     if (!candidateQueue[senderId]) {
//       candidateQueue[senderId] = [];
//     }
//     candidateQueue[senderId].push(candidate);
//   }
// }

// function configPeerConnection(target) {
//   if (peerConnections[target]) {
//     return peerConnections[target];
//   }

//   const pc = new RTCPeerConnection(iceConfig);

//   pc.ontrack = (event) => {
//     let video = document.getElementById(`remoteVideo-${target}`);

//     if (!video) {
//       const wrap = document.createElement("div");
//       wrap.className = "video-wrapper";
//       wrap.id = `wrap-${target}`;

//       video = document.createElement("video");
//       video.id = `remoteVideo-${target}`;
//       video.autoplay = true;
//       video.playsInline = true;

//       wrap.appendChild(video);

//       document.getElementById("videos").appendChild(wrap);
//     }

//     video.srcObject = event.streams[0];
//   };

//   pc.onicecandidate = (event) => {
//     if (event.candidate) {
//       ws.send(
//         JSON.stringify({
//           action: "candidate",
//           candidate: event.candidate,
//           target: target,
//           sender: me.id,
//         }),
//       );
//     }
//   };

//   pc.onconnectionstatechange = () => {
//     const st = pc.connectionState;

//     if (st === "failed" || st === "disconnected" || st === "closed") {
//       // không gửi endCall ở đây để tránh spam, server thường sẽ tự xử lý theo luồng endCall
//       // nhưng UI vẫn dọn
//       removePeer(target);
//     }
//   };

//   if (localStream && localStream.getTracks().length > 0) {
//     localStream.getTracks().forEach((track) => {
//       pc.addTrack(track, localStream);
//     });
//   } else {
//     pc.addTransceiver("video", { direction: "recvonly" });
//     pc.addTransceiver("audio", { direction: "recvonly" });
//   }

//   peerConnections[target] = pc;
//   return pc;
// }

// // ====================================================================================================
// // UI and Ultility functions
// // ====================================================================================================
// function updateMemberUI(list) {
//   // roomMembers = list; // [{id, name}]
//   room.members = list;
//   const ul = document.getElementById("membersList");
//   ul.innerHTML = list
//     .map((u) => `<li data-id="${u.id}">${u.id === me.id ? "You" : u.name}</li>`)
//     .join("");
// }

// function logEvent(msg) {
//   const logs = document.getElementById("logs");
//   const p = document.createElement("p");
//   p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
//   logs.appendChild(p);
//   logs.scrollTop = logs.scrollHeight;
// }

// function updateCallButtons(state) {
//   const joinCallBtn = document.getElementById("joinCallBtn");
//   const endCallBtn = document.getElementById("endCallBtn");
//   const leaveRoomBtn = document.getElementById("leaveRoomBtn");

//   switch (state) {
//     case "idle": // joined room, not in call
//       joinCallBtn.style.display = "inline-block";
//       endCallBtn.style.display = "none";
//       leaveRoomBtn.style.display = "inline-block";
//       break;
//     case "inCall": // during call
//       joinCallBtn.style.display = "none";
//       endCallBtn.style.display = "inline-block";
//       leaveRoomBtn.style.display = "none";
//       break;
//     case "endedCall": // call ended
//       joinCallBtn.style.display = "inline-block";
//       endCallBtn.style.display = "none";
//       leaveRoomBtn.style.display = "inline-block";
//       break;
//   }
// }

// function clearAllConnection(reset) {
//   Object.values(peerConnections).forEach((pc) => pc.close());
//   peerConnections = {};

//   if (reset) {
//     document.getElementById("videos").innerHTML =
//       '<div class="video-wrapper"><video id="localVideo" autoplay muted playsinline></video><div class="video-label">Bạn (Local)</div></div>';
//     document.getElementById("localVideo").srcObject = localStream;
//     updateMemberUI([]);
//     document.getElementById("callDiv").style.display = "none";
//     document.getElementById("roomDiv").style.display = "block";
//     updateCallButtons("idle");
//   }
// }

let ws;
let localStream;
let previewStream;
let peerConnections = {};
let candidateQueue = {};

let room = {
  id: "",
  status: "standby",
  members: [],
};

let me = {
  id: "",
  name: "",
  status: "standby",
};

const iceConfig = {
  iceServers: [
    { urls: "stun:stun.cloudflare.com:3478" },
    {
      urls: [
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turn:turn.cloudflare.com:3478?transport=tcp",
        "turns:turn.cloudflare.com:5349?transport=tcp",
      ],
      username:
        "g0a73b75d2beff34aa7355964343d55c45a63606c3b06c758e4f3aa4e0f2b99c",
      credential:
        "b37517e10764ab8724daa89c0c296d76ccb200ec445355007a1c2323da601623",
    },
  ],
};

window.onload = async () => {
  initWs();
  startHeartbeat();
  await initLocalMedia();
};

async function initLocalMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
  } catch {
    localStream = new MediaStream();
  }

  const localVideo = document.getElementById("localVideo");

  if (localVideo && localStream.getVideoTracks().length > 0) {
    previewStream = new MediaStream();

    localStream.getTracks().forEach((track) => {
      previewStream.addTrack(track);
    });

    localVideo.srcObject = previewStream;
    localVideo.muted = true;

    await localVideo.play().catch(() => {});
  }
}

function initWs() {
  const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
  ws = new WebSocket(protocol + window.location.host);

  ws.onopen = () => {
    document.getElementById("connStatus").textContent = "connected";
  };

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);
    await handleResponse(msg);
  };

  ws.onclose = () => {
    document.getElementById("connStatus").textContent = "disconnected";
  };
}

function startHeartbeat() {
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "ping" }));
    }
  }, 20000);
}

async function handleResponse(msg) {
  switch (msg.action) {
    case "register":
      me = msg.message;
      document.getElementById("registerDiv").style.display = "none";
      document.getElementById("roomDiv").style.display = "block";
      break;

    case "joinRoom":
      document.getElementById("roomDiv").style.display = "none";
      document.getElementById("callDiv").style.display = "block";
      room = msg.message;
      updateCallButtons("idle");
      break;

    case "inviteCall":
      handleInvite(msg.sender);
      break;

    case "inviteResponse":
      handleInviteResponse(msg.accepted, msg.target);
      break;

    case "offer":
      await handleOffer(msg.sender, msg.offer);
      break;

    case "answer":
      await handleAnswer(msg.sender, msg.answer);
      break;

    case "candidate":
      await handleCandidate(msg.sender, msg.candidate);
      break;

    case "memberLeft":
      removePeer(msg.message);
      break;

    case "updateMembers":
      updateMemberUI(msg.message);
      break;
  }
}

function registerUser() {
  me.name = document.getElementById("nameInput").value.trim();
  ws.send(JSON.stringify({ action: "register", name: me.name }));
}

function createRoom() {
  room.id = document.getElementById("roomIdInput").value.trim();
  ws.send(JSON.stringify({ action: "createRoom", roomId: room.id }));
}

function joinRoom() {
  room.id = document.getElementById("roomIdInput").value.trim();
  ws.send(JSON.stringify({ action: "joinRoom", roomId: room.id }));
}

function leaveRoom() {
  clearAllConnection(true);
  ws.send(JSON.stringify({ action: "leaveRoom", roomId: room.id }));
}

function startGroupCall() {
  updateCallButtons("inCall");
  me.status = "calling";

  ws.send(JSON.stringify({ action: "inviteCall", roomId: room.id }));
}

function leaveCall() {
  Object.values(peerConnections).forEach((pc) => pc.close());
  peerConnections = {};

  document.querySelectorAll("[id^='wrap-']").forEach((el) => el.remove());

  updateCallButtons("idle");
  me.status = "standby";

  ws.send(JSON.stringify({ action: "leaveCall", roomId: room.id }));
}

function removePeer(client) {
  const pc = peerConnections[client];

  if (pc) {
    pc.close();
    delete peerConnections[client];
  }

  const wrap = document.getElementById(`wrap-${client}`);
  if (wrap) wrap.remove();
}

function handleInvite(sender) {
  const name = room.members.find((m) => m.id === sender)?.name || "Unknown";

  const accept = confirm(`${name} invite you to join Group Call`);

  if (accept) {
    me.status = "calling";
    updateCallButtons("inCall");
  }

  ws.send(
    JSON.stringify({
      action: "inviteResponse",
      target: sender,
      response: accept,
      roomId: room.id,
    }),
  );
}

async function handleInviteResponse(accepted, target) {
  if (!accepted) return;

  const pc = configPeerConnection(target);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  ws.send(
    JSON.stringify({
      action: "offer",
      offer,
      target,
      sender: me.id,
    }),
  );
}

async function handleOffer(sender, offer) {
  const pc = configPeerConnection(sender);

  await pc.setRemoteDescription(new RTCSessionDescription(offer));

  if (candidateQueue[sender]) {
    for (const c of candidateQueue[sender]) {
      await pc.addIceCandidate(new RTCIceCandidate(c));
    }
    delete candidateQueue[sender];
  }

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  ws.send(
    JSON.stringify({
      action: "answer",
      target: sender,
      sender: me.id,
      answer,
    }),
  );
}

async function handleAnswer(sender, answer) {
  const pc = peerConnections[sender];

  if (!pc) return;

  await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleCandidate(senderId, candidate) {
  const pc = peerConnections[senderId];
  if (!pc) return;

  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch {}
}

function configPeerConnection(target) {
  if (peerConnections[target]) {
    return peerConnections[target];
  }

  const pc = new RTCPeerConnection(iceConfig);

  pc.ontrack = (event) => {
    let video = document.getElementById(`remoteVideo-${target}`);

    if (!video) {
      const wrap = document.createElement("div");
      wrap.className = "video-wrapper";
      wrap.id = `wrap-${target}`;

      video = document.createElement("video");
      video.id = `remoteVideo-${target}`;
      video.autoplay = true;
      video.playsInline = true;

      wrap.appendChild(video);
      document.getElementById("videos").appendChild(wrap);
    }

    video.srcObject = event.streams[0];
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(
        JSON.stringify({
          action: "candidate",
          candidate: event.candidate,
          target,
          sender: me.id,
        }),
      );
    }
  };

  if (localStream) {
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  }

  peerConnections[target] = pc;

  return pc;
}

function updateMemberUI(list) {
  room.members = list;

  const ul = document.getElementById("membersList");

  ul.innerHTML = list
    .map((u) => `<li>${u.id === me.id ? "You" : u.name}</li>`)
    .join("");
}

function updateCallButtons(state) {
  const joinCallBtn = document.getElementById("joinCallBtn");
  const endCallBtn = document.getElementById("endCallBtn");
  const leaveRoomBtn = document.getElementById("leaveRoomBtn");

  if (state === "idle") {
    joinCallBtn.style.display = "inline-block";
    endCallBtn.style.display = "none";
    leaveRoomBtn.style.display = "inline-block";
  }

  if (state === "inCall") {
    joinCallBtn.style.display = "none";
    endCallBtn.style.display = "inline-block";
    leaveRoomBtn.style.display = "none";
  }
}

function clearAllConnection(reset) {
  Object.values(peerConnections).forEach((pc) => pc.close());
  peerConnections = {};

  document.querySelectorAll("[id^='wrap-']").forEach((el) => el.remove());

  if (reset) {
    updateMemberUI([]);
    document.getElementById("callDiv").style.display = "none";
    document.getElementById("roomDiv").style.display = "block";
  }
}
