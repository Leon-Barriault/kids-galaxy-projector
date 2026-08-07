# Kids Galaxy Projector 🌍🚀

A complete, kid-friendly system where children draw a planet on an Android tablet and watch it appear live in a projected 3D galaxy on a Raspberry Pi connected to a projector.

**Target age**: 4–10 years  
**Hardware**: Android tablet + Raspberry Pi 4/5 + HDMI projector  
**Network**: Local only (the Pi creates its own Wi-Fi hotspot)

---

## Project Structure

```
kids-galaxy-projector/
├── android/                 # Native Android app (Kotlin + Jetpack Compose)
├── pi-server/               # FastAPI backend + Three.js galaxy visualization
│   ├── main.py
│   ├── requirements.txt
│   ├── static/              # Galaxy web page (index.html + galaxy.js)
│   └── uploads/             # Received planet textures (created at runtime)
└── scripts/
    ├── setup_hotspot.sh     # One-command Wi-Fi hotspot setup
    └── start_kiosk.sh       # Chromium kiosk launcher for the projector
```

---

## 1. Raspberry Pi Setup

### 1.1 Create the Hotspot (NetworkManager – recommended method in 2026)

```bash
sudo bash scripts/setup_hotspot.sh
```

Or manually:

```bash
sudo apt update && sudo apt full-upgrade -y
sudo nmcli device wifi hotspot ifname wlan0 ssid "KidsGalaxy" password "DrawPlanet1"
sudo nmcli connection modify Hotspot connection.autoconnect yes
```

The Pi usually receives the IP **`10.42.0.1`**.

### 1.2 Install and run the server

```bash
cd pi-server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 1.3 Projector / Kiosk mode

```bash
sudo apt install chromium-browser unclutter -y
bash scripts/start_kiosk.sh
```

---

## 2. Android App

1. Open the `android/` folder in **Android Studio** (latest stable recommended).
2. Let Gradle sync.
3. (Optional) Change the server URL in `MainActivity.kt` if your Pi uses a different IP.
4. Build and install on a tablet.

**Default server URL**: `http://10.42.0.1:8000/`

Connect the tablet to the **KidsGalaxy** Wi-Fi network before launching the app.

---

## 3. Security Features

- Maximum upload size: 5 MB
- Only PNG and JPEG accepted (content-type + magic-byte validation)
- Image re-encoded with Pillow (metadata stripped)
- Filename sanitization + UUID-based storage
- Path-traversal protection
- Simple per-IP rate limiting
- Designed for local network only (no public exposure)
- API docs endpoints disabled

---

## 4. Kid-Friendly Design

- Large touch targets and thick default brush
- Limited bright color palette
- Big “Launch into the Galaxy!” button
- Celebration dialog when the planet is accepted
- Simple, encouraging language
- Undo + Clear
- Live 3D planet arrival animation on the projector

---

## License

MIT License – free for personal and commercial use.

---

**Repository**: https://github.com/Leon-Barriault/kids-galaxy-projector
