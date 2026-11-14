<div align="center">

<img src="docs/assets/logo.png" alt="Gökçe Download Manager logo" width="128" height="128">

# Gökçe Download Manager

**A fast, free, multi-connection download manager for Windows and macOS that resumes where it left off.**
Its browser extension takes over downloads from Chrome, Edge, Brave, Opera, Vivaldi and Firefox.

[![Latest release](https://img.shields.io/github/v/release/tngokce/downloadManager)](https://github.com/tngokce/downloadManager/releases/latest)
[![Build](https://github.com/tngokce/downloadManager/actions/workflows/build.yml/badge.svg)](https://github.com/tngokce/downloadManager/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey)

[Türkçe](README.md) · **English**

[**⬇️ Download**](https://github.com/tngokce/downloadManager/releases/latest) · [Install](#-installation) · [Browser extension](#-installing-the-browser-extension) · [Usage](#-usage) · [FAQ](#-faq)

</div>

---

## ✨ Features

- **Multi-connection downloads:** files are split into up to 32 parts downloaded in parallel (8 by default), with **dynamic segmentation** — a finished connection takes over half of the largest remaining part.
- **Resume anything:** pause, network drops, app restarts, crashes and power cuts — downloads continue where they stopped.
- **Automatic retries** with backoff; honours `Retry-After` and lowers the connection count when a server answers `429`/`503`.
- **Browser integration:** downloads are captured with their cookies, Referer and User-Agent, so sites that need a login work too. If the app is closed, the download simply stays in the browser.
- **Video capture:** videos and HLS (`.m3u8`) streams on a page are detected and get a **Download** button. With ffmpeg installed, HLS is saved as a single `.mp4`.
- **Queues and scheduler:** start/stop times per queue, concurrency limits, speed limits, and *sleep / shut down / quit when done*.
- **Batch downloads:** patterns such as `image[001-150].jpg`, URL lists or `.txt` import.
- **Checksums** (MD5, SHA-1, SHA-256, SHA-512), **proxy** (system, HTTP, HTTPS, SOCKS5), HTTP/HTTPS/FTP/FTPS.
- Turkish and English UI, light/dark theme, tray / menu-bar icon, clipboard monitoring, drag and drop.

No ads, no account, no telemetry. Free and open source.

---

## 💻 System requirements

| | Minimum |
| --- | --- |
| **Windows** | Windows 10 or 11, 64-bit (x64 or ARM64) |
| **macOS** | macOS 12 Monterey or later (Apple Silicon or Intel) |
| **Browser (optional)** | Chrome / Edge / Brave / Opera / Vivaldi 116+ or Firefox 121+ |

---

## 📦 Installation

Download the right file from the **Assets** section of the **[latest release](https://github.com/tngokce/downloadManager/releases/latest)**:

| Your computer | File |
| --- | --- |
| Windows (most PCs) | `Gokce-Download-Manager-X.Y.Z-Setup-x64.exe` |
| Windows on ARM | `Gokce-Download-Manager-X.Y.Z-Setup-arm64.exe` |
| Windows, no installation | `Gokce-Download-Manager-X.Y.Z-Portable.exe` |
| Mac with Apple Silicon (M1–M4) | `Gokce-Download-Manager-X.Y.Z-mac-arm64.dmg` |
| Mac with Intel | `Gokce-Download-Manager-X.Y.Z-mac-x64.dmg` |

> **Which Mac do I have?**  menu → **About This Mac**. "Chip: Apple M…" → **arm64**; "Processor: Intel…" → **x64**.

### Windows

1. Run `…-Setup-x64.exe`.
2. If **"Windows protected your PC"** (SmartScreen) appears, click **More info → Run anyway**. This happens because the app is not signed with a paid code-signing certificate.
3. Follow the installer and launch **Gökçe Download Manager** from the Start menu or desktop.

### macOS

1. Open the `.dmg` and drag **Gokce Download Manager** into **Applications** (the file name on macOS has no Turkish characters for technical reasons; the Dock and the app itself show "Gökçe Download Manager").
2. Open the app. macOS says it *"could not verify … is free of malware"* because the app is not notarized by Apple. Click **Done**.
3. Go to  → **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to the *"… was blocked"* message, then confirm. You only need to do this once.

If macOS reports the app as *damaged*, run this in Terminal and open it again:

```bash
xattr -dr com.apple.quarantine "/Applications/Gokce Download Manager.app"
```

---

## 🧩 Installing the browser extension

The extension is optional; with it, browser downloads go to the app automatically. It is not yet in the browser stores, so it is loaded manually (once).

**Chrome, Edge, Brave, Opera, Vivaldi**

1. In the app open **Settings → Browser → Open extension folder**.
2. Go to `chrome://extensions` (`edge://extensions`, `opera://extensions`).
3. Turn on **Developer mode**, click **Load unpacked** and choose the folder from step 1.
   (Alternatively unzip `gokce-download-manager-chrome-X.Y.Z.zip` from the release and pick that folder — don't delete it afterwards.)
4. Pin the extension and click it: it should say **"Connected to the app"**.

**Firefox**

1. Download `gokce-download-manager-firefox-X.Y.Z.zip` from the release.
2. Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → choose the zip.
3. In `about:addons` → Gökçe Download Manager → **Permissions**, allow **"Access your data for all websites"**.

> Firefox removes temporary add-ons when it restarts.

---

## 🚀 Usage

- **From the browser:** just download as usual — the extension hands it to the app.
- **Add URL:** `Ctrl/Cmd + N`, or paste a link into the window with `Ctrl/Cmd + V`, or drag a link onto it.
- **Right-click** a link on a web page → **Download with Gökçe Download Manager**.
- **Videos:** click the **Download** button on the video, or the extension icon.
- **Batch:** `Ctrl/Cmd + Shift + N`.
- **Expired link?** Right-click the download → **Refresh address…**, paste a fresh link; it resumes.

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + N` | Add URL |
| `Ctrl/Cmd + Shift + N` | Batch download |
| `Ctrl/Cmd + ,` | Settings |
| `Ctrl/Cmd + F` | Search |
| `Space` | Pause / resume selected |
| `Enter` | Open file |
| `Delete` (macOS `⌫`) | Remove (`Shift` also deletes the file) |

**ffmpeg (optional, for HLS → mp4):** `winget install Gyan.FFmpeg` on Windows, `brew install ffmpeg` on macOS.

---

## 🔒 Privacy and security

- No analytics, ads or tracking. Nothing is sent anywhere except to the server of the file you download.
- The extension only talks to the app on the same computer (`127.0.0.1`). That local bridge is not reachable from the network and rejects requests from web pages.
- Sandboxed renderer, strict Content-Security-Policy, sanitised file names.
- To resume authenticated downloads, their cookie/credential headers and your proxy password (if set) are stored locally in the app's data folder only:
  - Windows: `%APPDATA%\Gökçe Download Manager\`
  - macOS: `~/Library/Application Support/Gökçe Download Manager/`

Found a vulnerability? Please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

---

## ❓ FAQ

**Why do Windows / macOS warn about the app?** Removing the warning requires paid signing certificates. All source code is public here and the installers are built directly from it by GitHub Actions.

**The extension says the app is not running.** Make sure the app is open (it keeps running in the tray / menu bar) and that browser integration is enabled in Settings → Browser.

**Can it download YouTube videos?** No; YouTube's segmented stream format is not supported. DRM-protected content (Netflix, Disney+, …) is not supported either. Please only download content you are allowed to.

More help: [open an issue](https://github.com/tngokce/downloadManager/issues/new/choose).

---

## 👩‍💻 Building from source

Requires [Node.js](https://nodejs.org) 22.12+ (24 recommended).

```bash
git clone https://github.com/tngokce/downloadManager.git
cd downloadManager
npm install
npm run dev          # run in development mode
npm test             # tests
npm run dist:mac     # macOS .dmg/.zip  → release/
npm run dist:win     # Windows installer + portable → release/
npm run extension    # extension zips → extension-dist/
```

Pushing a `vX.Y.Z` tag builds macOS and Windows packages on GitHub Actions and attaches them to a GitHub Release. Detailed (Turkish) docs live in [`docs/`](docs).

## 🤝 Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## 📄 License

[MIT](LICENSE) © 2026 Tunahan Gökçe
