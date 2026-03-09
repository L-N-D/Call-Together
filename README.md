Dưới đây là phiên bản **README.md hoàn chỉnh, chuẩn và liền mạch**, format rõ ràng, dễ đọc và copy trực tiếp:

```markdown
# WebRTC Group Call Demo

## 1. Cấu trúc project

```

/project
├─ public/           # Frontend (HTML/JS/CSS)
│   ├─ index.html
│   ├─ client.js
│   └─ styles.css
├─ server.js         # Node.js HTTPS + WebSocket signaling
├─ utils.js          # Hàm readDB/writeDB, broadcast, update room
├─ certs/            # Chứa key.pem và cert.pem
└─ README.md

````

---

## 2. Tạo SSL certificate (self-signed)

Dùng OpenSSL:

```bash
mkdir certs
cd certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem
````

* Khi điền thông tin, có thể để mặc định.
* File `key.pem` và `cert.pem` sẽ nằm trong `./certs`.

---

## 3. Chạy server signaling

Cài Node.js (>= v18):

```bash
npm install
node server.js
```

* Server chạy HTTPS + WebSocket trên `https://localhost:2706`
* Khi khởi động, database `db.json` sẽ được reset.

---

## 4. Dùng TURN của Cloudflare

* Cloudflare cung cấp STUN/TURN miễn phí cho WebRTC.
* Lấy **username** và **credential** bằng lệnh:

```bash
curl -H "Authorization: Bearer <API-TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"ttl": 86400}' \
     https://rtc.live.cloudflare.com/v1/turn/keys/<ROOM-ID>/credentials/generate-ice-servers
```

* Điền đúng username và credential vào client `iceConfig`:

```js
const iceConfig = {
  iceServers: [
    { urls: "stun:stun.cloudflare.com:3478" },
    {
      urls: [
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turn:turn.cloudflare.com:3478?transport=tcp",
        "turns:turn.cloudflare.com:5349?transport=tcp",
      ],
      username: "<YOUR-CF-USERNAME>",
      credential: "<YOUR-CF-KEY>",
    },
  ],
};
```

---

## 5. Test gọi

### 5.1 Test 2 người

1. Mở 2 trình duyệt khác nhau (hoặc 1 trình duyệt + 1 điện thoại).
2. Đăng ký tên → tạo room → cả 2 join room.
3. Nhấn **Start Call** → 2 video peer xuất hiện.
4. Dừng call → nhấn lại **Start Call** → không bị lỗi.

### 5.2 Test nhóm 3–4 người

1. Mở 3–4 client (trình duyệt khác nhau).
2. Tạo/Join cùng 1 room.
3. Nhấn **Start Call** từ 1 người → tất cả đều thấy video của nhau.
4. Kiểm tra overlay `"mode"` hiển thị `"RELAY"` nếu đang dùng TURN.

---

## 6. Kiểm tra TURN

* Overlay UI mỗi peer có `mode` hiển thị loại candidate:

  * `HOST` → kết nối LAN
  * `SRFLX` → NAT/STUN
  * `RELAY` → đi qua TURN (Cloudflare)
* Khi overlay hiện `RELAY` → minh chứng kết nối đi qua TURN.

---

## 8. Chạy trên Internet thật (Cloudflare Tunnel + self-signed certificate)

### Bước 1: Cài cloudflared
- **MacOS:**
```bash
brew install cloudflared
````

* **Linux:**

```bash
sudo apt install cloudflared
```

### Bước 2: Khởi chạy tunnel tới server local

Giả sử server chạy HTTPS trên cổng 2706:

```bash
cloudflared tunnel --url https://localhost:2706
```

* Cloudflare sẽ cung cấp 1 domain tạm thời, ví dụ:

```
https://random-id.trycloudflare.com
```

### Bước 3: Truy cập domain trên trình duyệt

* Trình duyệt sẽ cảnh báo **self-signed certificate** → chọn **Advanced → Proceed** để chấp nhận.
* Client sẽ kết nối server HTTPS + WebSocket signaling qua Cloudflare Tunnel.
* TURN/STUN vẫn hoạt động bình thường.
* Overlay UI sẽ hiển thị `"RELAY"` nếu WebRTC fallback qua TURN server.

### Lưu ý

* Chạy demo trên Internet thật giúp test TURN/RELAY thực tế (máy khác mạng LAN).
* Nếu muốn dùng domain riêng, trỏ DNS tới Cloudflare Tunnel và cài certificate hợp lệ.

```

---
