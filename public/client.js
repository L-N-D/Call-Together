let ws;
let localStream;
let peerConnections = {};
let candidateQueue = {};
let timers = {};
let me = { id: "", name: "", status: "standby" };
let room = { id: "", status: "standby", members: [] };

const iceConfig = {
  iceServers: [
    { urls: "stun:stun.cloudflare.com:3478" },
    {
      urls: [
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turn:turn.cloudflare.com:3478?transport=tcp",
        "turns:turn.cloudflare.com:5349?transport=tcp",
      ],
      username: "g0a73b75d2beff34aa7355964343d55c45a63606c3b06c758e4f3aa4e0f2b99c",
      credential: "b37517e10764ab8724daa89c0c296d76ccb200ec445355007a1c2323da601623",
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
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const localVideo = document.getElementById("localVideo");
    if (localVideo) localVideo.srcObject = localStream;
  } catch (err) {
    logEvent("Lỗi truy cập media: " + err.message);
  }
}

function initWs() {
  const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
  ws = new WebSocket(protocol + window.location.host);
  ws.onopen = () => { document.getElementById("connStatus").textContent = "connected"; };
  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);
      await handleResponse(msg);
    } catch (err) { console.error("JSON Error:", err); }
  };
  ws.onclose = () => {
    document.getElementById("connStatus").textContent = "disconnected";
    clearAllConnection(true);
  };
}

async function handleResponse(msg) {
  if (msg.status && msg.status !== 200) return alert(msg.message || "Server error");

  switch (msg.action) {
    case "register":
      me = msg.message;
      document.getElementById("registerDiv").style.display = "none";
      document.getElementById("roomDiv").style.display = "block";
      logEvent(`Đã đăng ký: ${me.name}`);
      break;

    case "joinRoom":
      room = msg.message;
      document.getElementById("roomDiv").style.display = "none";
      document.getElementById("callDiv").style.display = "block";
      updateCallButtons("idle");
      logEvent(`Vào phòng: ${room.id}`);
      if (room.status === "calling") logEvent("⚠️ Phòng đang có cuộc gọi diễn ra.");
      break;

    case "startMesh":
      await handleStartMesh(msg.message);
      break;

    case "callStarted":
      if (me.status !== "calling" && confirm("Cuộc gọi nhóm đã bắt đầu, bạn muốn tham gia?")) {
        joinCall();
      }
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
      room.members = msg.message
      updateMemberUI(msg.message);
      break;
  }
}

function registerUser() {
  const name = document.getElementById("nameInput").value.trim();
  if (name) ws.send(JSON.stringify({ action: "register", name }));
}

function createRoom() {
  const roomId = document.getElementById("roomIdInput").value.trim();
  if (roomId) {
    ws.send(JSON.stringify({ action: "joinRoom", roomId }));
  } else {
    alert("Vui lòng nhập ID Phòng");
  }
}

function joinRoom() {
  const roomId = document.getElementById("roomIdInput").value.trim();
  if (roomId) {
    ws.send(JSON.stringify({ action: "joinRoom", roomId }));
  } else {
    alert("Vui lòng nhập ID Phòng");
  }
}

function startGroupCall() {
  me.status = "calling";
  updateCallButtons("inCall");
  ws.send(JSON.stringify({ action: "inviteCall", roomId: room.id }));
  logEvent(`Cuộc gọi bắt đầu lúc ${new Date().toLocaleTimeString()}`);
}

function joinCall() {
  me.status = "calling";
  updateCallButtons("inCall");
  ws.send(JSON.stringify({ action: "joinCall", roomId: room.id }));
  logEvent(`Tham gia cuộc gọi lúc ${new Date().toLocaleTimeString()}`);
}

function leaveCall() {
  ws.send(JSON.stringify({ action: "leaveCall", roomId: room.id, userId: me.id }));
  logEvent(`Cuộc gọi kết thúc lúc ${new Date().toLocaleTimeString()}`);
  clearAllConnection(false);
  updateCallButtons("idle");
}

function leaveRoom() {
  ws.send(JSON.stringify({ action: "leaveRoom", roomId: room.id }));
  clearAllConnection(true);
  room = { id: "", status: "standby", members: [] };
}

async function handleStartMesh(peers) {
  logEvent(`Đang thiết lập Mesh tới ${peers.length} thành viên...`);
  for (const peerId of peers) {
    if (peerId !== me.id && !peerConnections[peerId]) {
      const pc = configPeerConnection(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.send(JSON.stringify({ action: "offer", offer, target: peerId, sender: me.id }));
    }
  }
}

async function handleOffer(sender, offer) {
  const pc = configPeerConnection(sender);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  if (candidateQueue[sender]) {
    for (const c of candidateQueue[sender]) await pc.addIceCandidate(new RTCIceCandidate(c));
    delete candidateQueue[sender];
  }
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  ws.send(JSON.stringify({ action: "answer", answer, target: sender, sender: me.id }));
  if (me.status !== "calling") {
    me.status = "calling";
    updateCallButtons("inCall");
  }
}

async function handleAnswer(target, answer) {
  const pc = peerConnections[target];
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleCandidate(sender, candidate) {
  const pc = peerConnections[sender];
  if (pc && pc.remoteDescription) {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } else {
    if (!candidateQueue[sender]) candidateQueue[sender] = [];
    candidateQueue[sender].push(candidate);
  }
}

function configPeerConnection(targetId) {
  const pc = new RTCPeerConnection(iceConfig);
  const timeout = setTimeout(() => {
    if (pc.iceConnectionState !== "connected" && pc.iceConnectionState !== "completed") {
      logEvent(`Peer ${targetId}: P2P thất bại, đang thử TURN Relay...`);
    }
  }, 12000);
  pc.oniceconnectionstatechange = () => {
    logEvent(`[ICE ${targetId}]: ${pc.iceConnectionState}`);
    if (pc.iceConnectionState === "connected") {
      clearTimeout(timeout);
      startPeerTimer(targetId);
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") logConnectionStats(pc, targetId);
    if (["failed", "closed", "disconnected"].includes(pc.connectionState)) removePeer(targetId);
  };
  pc.onicecandidate = (e) => {
    if (e.candidate) ws.send(JSON.stringify({ action: "candidate", candidate: e.candidate, target: targetId, sender: me.id }));
  };
  pc.ontrack = (event) => {
    let wrap = document.getElementById(`wrap-${targetId}`);
    if (!wrap) {
      const displayName = getPeerName(targetId);
      wrap = document.createElement("div");
      wrap.className = "video-wrapper";
      wrap.id = `wrap-${targetId}`;
      wrap.innerHTML = `
        <video id="video-${targetId}" autoplay playsinline></video>
        <div class="video-label">Peer: ${displayName}</div>
        <div class="stats-overlay">
          <span id="timer-${targetId}">00:00</span> | <span id="mode-${targetId}">...</span>
        </div>
      `;
      document.getElementById("videos").appendChild(wrap);
    }
    const video = document.getElementById(`video-${targetId}`);
    if (video.srcObject !== event.streams[0]) video.srcObject = event.streams[0];
  };
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  peerConnections[targetId] = pc;
  return pc;
}

async function logConnectionStats(pc, targetId) {
  try {
    const stats = await pc.getStats();
    stats.forEach(report => {
      if (report.candidateType) {
        const modeEl = document.getElementById(`mode-${targetId}`);
        if (modeEl) modeEl.textContent = report.candidateType.toUpperCase();
        logEvent(`[STATS] Peer ${targetId} dùng: ${report.candidateType}`);
      }
    });
  } catch (e) { console.error(e); }
}

function startPeerTimer(targetId) {
  let seconds = 0;
  if (timers[targetId]) clearInterval(timers[targetId]);
  timers[targetId] = setInterval(() => {
    seconds++;
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    const el = document.getElementById(`timer-${targetId}`);
    if (el) el.textContent = `${m}:${s}`;
  }, 1000);
}

function removePeer(id) {
  if (peerConnections[id]) peerConnections[id].close();
  delete peerConnections[id];
  delete candidateQueue[id];
  if (timers[id]) clearInterval(timers[id]);
  document.getElementById(`wrap-${id}`)?.remove();
}

function clearAllConnection(isLeaveRoom) {
  Object.keys(peerConnections).forEach((id) => {
    if (peerConnections[id]) peerConnections[id].close();
    if (timers && timers[id]) clearInterval(timers[id]);
    const remoteWrap = document.getElementById(`wrap-${id}`);
    if (remoteWrap) remoteWrap.remove();
  });
  peerConnections = {};
  candidateQueue = {};
  if (typeof timers !== 'undefined') timers = {};
  me.status = "standby";
  const videosDiv = document.getElementById("videos");
  if (videosDiv) {
    videosDiv.innerHTML = `
      <div class="video-wrapper" id="localVideoContainer">
        <video id="localVideo" autoplay muted playsinline></video>
        <div class="video-label">Bạn (Local)</div>
      </div>
    `;
    const localVideo = document.getElementById("localVideo");
    if (localVideo && localStream) localVideo.srcObject = localStream;
  }
  updateMemberUI([]);
  if (isLeaveRoom) {
    document.getElementById("callDiv").style.display = "none";
    document.getElementById("roomDiv").style.display = "block";
  }
}

function updateMemberUI(list) {
  const ul = document.getElementById("membersList");
  ul.innerHTML = list.map(u => `<li>${u.id === me.id ? "<b>Bạn</b>" : u.name}</li>`).join("");
}

function logEvent(msg) {
  const logs = document.getElementById("logs");
  const p = document.createElement("p");
  p.innerHTML = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logs.appendChild(p);
  logs.scrollTop = logs.scrollHeight;
}

function startHeartbeat() {
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: "ping" }));
  }, 20000);
}

function updateCallButtons(state) {
  const joinBtn = document.getElementById("joinCallBtn");
  const endBtn = document.getElementById("endCallBtn");
  const leaveBtn = document.getElementById("leaveRoomBtn");
  if (state === "inCall") {
    joinBtn.style.display = "none"; endBtn.style.display = "inline-block"; leaveBtn.style.display = "none";
  } else {
    joinBtn.style.display = "inline-block"; endBtn.style.display = "none"; leaveBtn.style.display = "inline-block";
  }
}

function getPeerName(id) {
  const found = room.members.find(m => m.id === id);
  return found ? found.name : id.slice(0, 5);
}
