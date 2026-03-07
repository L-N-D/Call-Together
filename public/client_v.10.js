let ws;
let localStream;
let peerConnections = {};
let roomMembers = [];
let userName;
let myId;
let roomId;
let room = {
  id: '',
  status: 'standby',
  members: []
}
let me = {
  id: '',
  name: '',
  status: 'standby'
}

// Ice server config
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

// init wbsocket connection and request permission to access Camera and Microphone
window.onload = async () => {
  // init WebSocket
  initWs();
  // keep websocket connection alive (send ping signal every 20 second)
  startHeartbeat();
  // Request permission to access Camera and Microphone
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    document.getElementById("localVideo").srcObject = localStream;
  } catch (err) {
    alert("Vui lòng cho phép truy cập Camera & Microphone!");
    console.error(err);
  }
};

function initWs() {
  const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
  ws = new WebSocket(protocol + window.location.host);

  ws.onopen = () => {
    document.getElementById("connStatus").textContent = "connected";
    // logEvent("WebSocket connected");
  };

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);
      await handleResponse(msg);
    } catch (err) {
      console.error("Invalid JSON from server:", err);
    }
  };

  ws.onclose = () => {
    document.getElementById("connStatus").textContent = "disconnected";
    // logEvent("WebSocket disconnected");
    if (roomId) leaveRoom();
  };
}

function startHeartbeat() {
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ action: "ping" }));
  }, 20000);
}

async function handleResponse(msg) {
  if (msg.status && msg.status !== 200)
    return alert(msg.message || "Server error");

  switch (msg.action) {
    case "register":
      // myId = msg.message;
      me = msg.message;
      document.getElementById("registerDiv").style.display = "none";
      document.getElementById("roomDiv").style.display = "block";
      logEvent(`Registered as ${me.name}`);
      break;

    case "joinRoom":
      document.getElementById("roomDiv").style.display = "none";
      document.getElementById("callDiv").style.display = "block";
      updateCallButtons("idle");
      room = msg.message;
      logEvent(`Joined Room ${roomId}`);
      break;

    case "updateMembers":
      updateMemberUI(msg.message);
      break;

    case "leaveRoom":
      cleanupAfterLeave();
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

    case "inviteCall":
      handleInviteCall(msg.sender);
      break;

    case "inviteResponse":
      if (msg.accepted) {
        logEvent(`[${msg.target}] chấp nhận kết nối`);
        initPeerConnection(msg.target);
        updatePeerStatus(msg.target, "connected");
      } else {
        logEvent(`[${msg.target}] từ chối kết nối`);
        updatePeerStatus(msg.target, "rejected");
      }
      break;

    default:
      console.log("Unknown action:", msg.action);
  }
}

// ---------------- UI & Logging ----------------
function updateMemberUI(list) {
  // roomMembers = list; // [{id, name}]
  room.members = list;
  const ul = document.getElementById("membersList");
  ul.innerHTML = list
    .map((u) => `<li data-id="${u.id}">${u.id === myId ? "You" : u.name}</li>`)
    .join("");
}

function logEvent(msg) {
  const logs = document.getElementById("logs");
  const p = document.createElement("p");
  p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logs.appendChild(p);
  logs.scrollTop = logs.scrollHeight;
}

function updateCallButtons(state) {
  const joinCallBtn = document.getElementById("joinCallBtn");
  const endCallBtn = document.getElementById("endCallBtn");
  const leaveRoomBtn = document.getElementById("leaveRoomBtn");

  switch (state) {
    case "idle": // joined room, not in call
      joinCallBtn.style.display = "inline-block";
      endCallBtn.style.display = "none";
      leaveRoomBtn.style.display = "inline-block";
      break;
    case "inCall": // during call
      joinCallBtn.style.display = "none";
      endCallBtn.style.display = "inline-block";
      leaveRoomBtn.style.display = "none";
      break;
    case "endedCall": // call ended
      joinCallBtn.style.display = "inline-block";
      endCallBtn.style.display = "none";
      leaveRoomBtn.style.display = "inline-block";
      break;
  }
}

// ---------------- Actions ----------------
function registerUser() {
  userName = document.getElementById("nameInput").value.trim();
  if (!userName) return alert("Username is empty!");
  ws.send(JSON.stringify({ action: "register", name: userName }));
}

function createRoom() {
  roomId = document.getElementById("roomIdInput").value.trim();
  if (!roomId) return alert("Room ID is Empty!");
  ws.send(JSON.stringify({ action: "createRoom", onwer: userName, roomId }));
}

function joinRoom() {
  roomId = document.getElementById("roomIdInput").value.trim();
  if (!roomId) return alert("Room ID is Empty");
  ws.send(JSON.stringify({ action: "joinRoom", user: userName, roomId }));
}

function handleInviteCall(senderId){
  const name = roomMembers.find(u => u.id === senderId)?.name || "Unknown";

  if (me.status === 'calling') {
    var accept = true;
  } else {
    var accept = confirm(`${name} invite you to join Group Call`);
  }

  ws.send(JSON.stringify({
    action: "inviteResponse",
    target: senderId,
    respone: accept,
    roomId
  }));

  if(accept){
    initPeerConnection(senderId);
    updatePeerStatus(senderId, "connected");
  }
}

function updatePeerStatus(id, status){
  const el = document.getElementById(`status-${id}`);
  if(el) el.textContent = status;
}

function leaveRoom() {
  cleanupAfterLeave();
  ws.send(JSON.stringify({ action: "leaveRoom", user: me.name, roomId: room.id }));
}

function logout() {
  if (ws && ws.readyState === WebSocket.OPEN && userName) {
    ws.send(JSON.stringify({ action: "logout", name: me.name }));
  }
  cleanupAfterLeave();
  document.getElementById("registerDiv").style.display = "block";
  document.getElementById("roomDiv").style.display = "none";
}

// ---------------- Call ----------------
function startCall() {
  updateCallButtons("inCall");

  // gửi joinRequest tới tất cả peer trong phòng
  room.members.forEach((member) => {
    if (member.id !== me.id) {
      ws.send(
        JSON.stringify({
          action: "inviteCall",
          sender: me.id,
          target: member.id,
          roomId,
        }),
      );
      // Tạo video placeholder pending
      addVideoPlaceholder(member.id, member.name, "pending");
    }
  });
}

function endCall() {
  Object.values(peerConnections).forEach((pc) => pc.close());
  peerConnections = {};
  ws.send(JSON.stringify({ action: "memberLeft", roomId, userId: myId }));
  document.getElementById("videos").innerHTML =
    '<div class="video-wrapper"><video id="localVideo" autoplay muted playsinline></video><div class="video-label">Bạn (Local)</div></div>';
  document.getElementById("localVideo").srcObject = localStream;
  updateCallButtons("endedCall");
}

function addVideoPlaceholder(id, name, status) {
  if (document.getElementById(`vid-${id}`)) return;
  const wrap = document.createElement("div");
  wrap.className = "video-wrapper";
  wrap.id = `wrap-${id}`;
  wrap.innerHTML = `
    <video id="vid-${id}" autoplay playsinline></video>
    <div class="video-label">${name} <span class="status" id="status-${id}">${status}</span></div>
  `;
  document.getElementById("videos").appendChild(wrap);
}

// ---------------- P2P ----------------
function initPeerConnection(targetId) {
  const pc = new RTCPeerConnection(iceConfig);
  peerConnections[targetId] = pc;

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  function ensureVideoElement() {
    let video = document.getElementById(`vid-${targetId}`);
    if (!video) {
      const wrap = document.createElement("div");
      wrap.className = "video-wrapper";
      wrap.id = `wrap-${targetId}`;

      const name =
        roomMembers.find((u) => u.id === targetId)?.name || "Unknown";

      wrap.innerHTML = `
        <video id="vid-${targetId}" autoplay playsinline></video>
        <div class="video-label">
          ${name}
          <span class="status" id="status-${targetId}">new</span>
        </div>
      `;

      document.getElementById("videos").appendChild(wrap);
      video = document.getElementById(`vid-${targetId}`);
    }
    return video;
  }

  function updateStatus(state) {
    const statusEl = document.getElementById(`status-${targetId}`);
    if (statusEl) statusEl.textContent = state;
  }

  pc.onicecandidate = (e) => {
    if (e.candidate && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          action: "candidate",
          target: targetId,
          sender: myId,
          candidate: e.candidate,
          roomId,
        }),
      );
    }
  };

  pc.ontrack = (e) => {
    const video = ensureVideoElement();
    video.srcObject = e.streams[0];
  };

  pc.oniceconnectionstatechange = () => {
    logEvent(`[${targetId}] ICE state: ${pc.iceConnectionState}`);

    if (pc.iceConnectionState === "failed") {
      logEvent(`[${targetId}] P2P failed, trying TURN…`);
      restartIce();
    }
  };

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    updateStatus(state);
    logEvent(`[${targetId}] Peer connection state: ${state}`);

    if (state === "connected") {
      clearTimeout(fallbackTimer);
    }
  };

  const fallbackTimer = setTimeout(() => {
    if (pc.connectionState !== "connected") {
      logEvent(`[${targetId}] P2P timeout (15s), trying TURN…`);
      restartIce();
    }
  }, 15000);

  async function restartIce() {
    try {
      await pc.restartIce();

      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);

      ws.send(
        JSON.stringify({
          action: "offer",
          target: targetId,
          sender: myId,
          offer,
          roomId,
        }),
      );
    } catch (err) {
      console.error("ICE restart failed:", err);
    }
  }

  const statsInterval = setInterval(async () => {
    if (pc.connectionState === "closed") {
      clearInterval(statsInterval);
      return;
    }

    const stats = await pc.getStats();
    stats.forEach((r) => {
      if (r.type === "candidate-pair" && r.state === "succeeded") {
        logEvent(
          `[${targetId}] Selected candidate: ${r.localCandidateType} → ${r.remoteCandidateType}`,
        );
      }
    });
  }, 5000);

  pc.createOffer()
    .then((offer) => pc.setLocalDescription(offer))
    .then(() => {
      ws.send(
        JSON.stringify({
          action: "offer",
          target: targetId,
          sender: myId,
          offer: pc.localDescription,
          roomId,
        }),
      );
    })
    .catch(console.error);

  return pc;
}

async function handleOffer(senderId, offer) {
  const pc = new RTCPeerConnection(iceConfig);
  peerConnections[senderId] = pc;

  if (!localStream) {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    document.getElementById("localVideo").srcObject = localStream;
  }
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.onicecandidate = (e) => {
    if (e.candidate)
      ws.send(
        JSON.stringify({
          action: "candidate",
          target: senderId,
          sender: myId,
          candidate: e.candidate,
          roomId,
        }),
      );
  };
  pc.ontrack = (e) => {
    let video = document.getElementById(`vid-${senderId}`);
    if (!video) {
      const wrap = document.createElement("div");
      wrap.className = "video-wrapper";
      wrap.id = `wrap-${senderId}`;
      const name =
        roomMembers.find((u) => u.id === senderId)?.name || "Unknown";
      wrap.innerHTML = `<video id="vid-${senderId}" autoplay playsinline></video><div class="video-label">${name}</div>`;
      document.getElementById("videos").appendChild(wrap);
      video = document.getElementById(`vid-${senderId}`);
    }
    video.srcObject = e.streams[0];
  };

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  ws.send(
    JSON.stringify({
      action: "answer",
      target: senderId,
      sender: myId,
      answer,
      roomId,
    }),
  );
}

async function handleAnswer(senderId, answer) {
  await peerConnections[senderId]?.setRemoteDescription(
    new RTCSessionDescription(answer),
  );
}

async function handleCandidate(senderId, candidate) {
  await peerConnections[senderId]?.addIceCandidate(
    new RTCIceCandidate(candidate),
  );
}

// ---------------- Cleanup ----------------
function removePeer(id) {
  if (peerConnections[id]) peerConnections[id].close();
  delete peerConnections[id];
  const wrap = document.getElementById(`wrap-${id}`);
  if (wrap) wrap.remove();
  logEvent(`[${id}] left the room`);
}

function cleanupAfterLeave() {
  Object.values(peerConnections).forEach((pc) => pc.close());
  peerConnections = {};
  document.getElementById("videos").innerHTML =
    '<div class="video-wrapper"><video id="localVideo" autoplay muted playsinline></video><div class="video-label">Bạn (Local)</div></div>';
  document.getElementById("localVideo").srcObject = localStream;
  updateMemberUI([]);
  document.getElementById("callDiv").style.display = "none";
  document.getElementById("roomDiv").style.display = "block";
  updateCallButtons("idle");
  roomId = null;
}
