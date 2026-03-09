import { createElement } from "react";

function configPeerConnection(target) {

  if (peerConnections[target]) {
    return peerConnections[target];
  }

  const pc = new RTCPeerConnection(iceConfig);

  pc.ontrack = (event) => {
    let video = document.getElementById(`remoteVideo-${target}`);

    if (!video) {
      video = createElement('video');
      video.id = `remoteVideo-${target}`;
      video.autoplay = true;
      video.playsInline = true;
      document.body.appendChild(video);
    }

    video.srcObject = event.streams[0];
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({
        action: 'candidate',
        candidate: event.candidate,
        target: target,
        sender: me.id
      }));
    }
  }

  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;

    if (st === 'failed' || st === 'disconnected' || st === 'closed') {
      // không gửi endCall ở đây để tránh spam, server thường sẽ tự xử lý theo luồng endCall
      // nhưng UI vẫn dọn
    }
  }

  if (localStream && localStream.getTracks().length > 0) {
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  } else {
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });
  }

  peerConnections[target] = pc;
  return pc;
}

async function startGroupCall() {

  // update UI btn
  updateCallButtons('inCall');
  me.status = 'calling';

  // send Call invite to all members in this room
  ws.send(JSON.stringify({action: 'inviteCall', roomId: room.id}))

}

async function handleInviteResponse(accepted, target) {

  if (!accepted) {
    // try {
    //   peerConnections[target].close();
    // } catch (err) { };
    // delete peerConnections[target];
    return;
  }

  const pc = configPeerConnection(target);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  ws.send(JSON.stringify({
    action: 'offer',
    offer,
    target: target,
    sender: me.id
  }))

}

function handleInvite(sender) {
  const name = room.members.find(m => m.id === sender)?.name || 'Unknown';

  let accept = true;
  if (me.status !== 'calling') {
    accept = confirm(`${name} invite you to join Group Call`);
  }

  if (accept) {
    me.status = 'calling';
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

async function handleOffer(sender, offer) {

  const pc = configPeerConnection(sender);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  ws.send(JSON.stringify({
    action: 'answer',
    target: sender,
    sender: me.id,
    answer,
  }));

  if (me.status !== 'calling') {
    me.status = 'calling';
  }

}

async function handleAnswer(target, answer) {
  const pc = peerConnections[target];

  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }
}

function cleanUpConnection() {
  if (me.status !== 'calling') {
    return;
  }

  for (let target in peerConnections) {
    try { peerConnections[target].close(); } catch {}
    delete peerConnections[target];
  }
}
