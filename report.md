## 7. Kiến trúc & message signaling

### 7.1 Kiến trúc hệ thống

* **Server**: Node.js HTTPS + WebSocket

  * Lưu user/room trong `db.json`
  * Hỗ trợ: register, join/leave room, invite/join/leave call, broadcast signaling
  * Dọn dẹp phòng trống tự động
* **Client**: HTML + JS

  * Quản lý local media
  * Kết nối signaling
  * Tạo PeerConnection mesh call
  * UI video grid + overlay timer/mode
  * Hiển thị candidate type: HOST / SRFLX / RELAY

### 7.2 Message Signaling

| Action          | Mục đích                           | Sender / Receiver             |
| --------------- | ---------------------------------- | ----------------------------- |
| `register`      | Đăng ký tên user                   | client → server               |
| `joinRoom`      | Tạo hoặc join phòng                | client → server               |
| `inviteCall`    | Bắt đầu group call                 | client → server → peer        |
| `joinCall`      | Tham gia call khi đang có cuộc gọi | client → server → peer        |
| `offer`         | Gửi SDP offer cho peer             | client → server → target peer |
| `answer`        | Gửi SDP answer trả về peer         | client → server → target peer |
| `candidate`     | Gửi ICE candidate                  | client → server → target peer |
| `leaveCall`     | Rời khỏi cuộc gọi                  | client → server → peer        |
| `leaveRoom`     | Rời khỏi phòng                     | client → server               |
| `callStarted`   | Thông báo call đã bắt đầu          | server → tất cả peer          |
| `updateMembers` | Cập nhật danh sách member trên UI  | server → tất cả peer          |

### 7.3 Mesh call & TURN

* Khi 1 user start group call:

  * Server gửi `startMesh` → client tạo PeerConnection tới tất cả peer khác.
  * Client gửi `offer` → `answer` → ICE candidates → kết nối mesh.
* Overlay UI + `logEvent(getStats())` hiển thị candidate type:

  * `RELAY` → qua TURN
  * `HOST` → LAN
  * `SRFLX` → NAT/STUN
