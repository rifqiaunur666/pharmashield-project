<div align="center">

<img src="frontend/public/logo.png" alt="PharmaShield Logo" width="120" />

# 🛡️ PharmaShield

**Sistem Keamanan & Pengingat Obat Berbasis AI untuk Pasien & Lansia**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python)](https://python.org)
[![Gemini AI](https://img.shields.io/badge/Google_Gemini_AI-Integrated-4285F4?style=flat-square&logo=google)](https://aistudio.google.com)
[![Fonnte WA](https://img.shields.io/badge/WhatsApp_Bot-Fonnte-25D366?style=flat-square&logo=whatsapp)](https://fonnte.com)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

## 📋 Daftar Isi

- [Tentang Project](#-tentang-project)
- [Fitur Utama](#-fitur-utama)
- [Arsitektur Sistem](#-arsitektur-sistem)
- [Struktur Project](#-struktur-project)
- [Tech Stack](#-tech-stack)
- [Prasyarat](#-prasyarat)
- [Instalasi & Setup Lokal](#-instalasi--setup-lokal)
- [Environment Variables](#-environment-variables)
- [Menjalankan Aplikasi](#-menjalankan-aplikasi)
- [API Endpoints](#-api-endpoints)
- [WhatsApp Bot & Notifikasi](#-whatsapp-bot--notifikasi)
- [Deployment](#-deployment)
- [Testing](#-testing)
- [Kontribusi](#-kontribusi)
- [Kolaborator](#-kolaborator)

---

## 🎯 Tentang Project

**PharmaShield** adalah platform kesehatan digital yang dirancang khusus untuk membantu pasien dan keluarga lansia dalam:

1. **📸 Memindai kemasan obat** — Scan foto kemasan obat menggunakan AI Vision + OCR untuk mengekstrak nama obat, tanggal kedaluwarsa, dan status keamanan secara otomatis.
2. **⏰ Pengingat minum obat otomatis** — Bot WhatsApp yang mengirimkan notifikasi pengingat secara real-time ke nomor pasien sesuai jadwal yang didaftarkan.
3. **🤖 AI Chatbot Farmasi** — Chatbot bertenaga Google Gemini untuk tanya jawab seputar obat-obatan.
4. **💊 Katalog Interaksi Obat** — Database interaksi antar obat untuk keselamatan penggunaan.
5. **📊 Riwayat & Analitik** — Histori pemindaian dan statistik penggunaan obat.

---

## ✨ Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| 🔍 **AI Vision Scanner** | Scan kemasan obat via foto — ekstrak nama, exp date, status otomatis |
| 📅 **Pengingat Otomatis** | Bot WhatsApp kirim notifikasi H-10 menit & tepat waktu minum obat |
| 💬 **Interactive Bot** | Pasien bisa konfirmasi sudah/belum minum via tombol reply WhatsApp |
| 🔄 **Dynamic Rescheduling** | Jadwal otomatis disesuaikan jika pasien terlambat minum |
| 🤖 **AI Chatbot** | Tanya jawab farmasi berbasis Google Gemini AI |
| 💊 **Cek Interaksi Obat** | Deteksi kombinasi obat yang berpotensi berbahaya |
| 📋 **Katalog Obat** | 1000+ data obat Indonesia dari Alodokter |
| 🔐 **Autentikasi** | Sistem login user dengan JWT token |
| 🌙 **Dark UI** | Antarmuka modern dark-mode dengan Tailwind CSS |
| 📱 **Responsive** | Optimal di desktop, tablet, dan mobile |

---

## 🏗️ Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────┐
│                        USER / PATIENT                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │   Next.js Frontend      │
              │   (Port 3000 / Vercel)  │
              └────────────┬────────────┘
                           │ REST API
              ┌────────────▼────────────┐
              │   FastAPI Backend       │
              │   (Port 8000 / Railway) │
              │                         │
              │  ┌──────────────────┐   │
              │  │  Reminder Engine │   │
              │  │  + Scheduler     │   │
              │  └────────┬─────────┘   │
              └───────────┼─────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────▼─────┐  ┌──────▼──────┐  ┌───▼───────┐
    │ Fonnte WA │  │ Gemini AI   │  │ OCR Engine│
    │  Bot API  │  │  Vision API │  │ Tesseract │
    └─────┬─────┘  └─────────────┘  └───────────┘
          │
    ┌─────▼──────────────┐
    │  WhatsApp Pasien   │
    │  (+62895xxxxxxxx)  │
    └────────────────────┘
```

---

## 📁 Struktur Project

```
pharmashield-project/
│
├── 📂 backend/                        # FastAPI Backend
│   ├── 📂 app/
│   │   ├── 📂 api/                    # Route Handlers
│   │   │   ├── endpoints.py           # Scan & History endpoints
│   │   │   ├── reminder_endpoints.py  # Reminder CRUD & bot control
│   │   │   ├── ai_endpoints.py        # AI Chatbot endpoints
│   │   │   ├── scan.py                # OCR scan pipeline
│   │   │   └── history.py             # Scan history
│   │   ├── 📂 services/               # Business Logic
│   │   │   ├── wa_service.py          # WhatsApp alert (Fonnte)
│   │   │   ├── meta_wa_service.py     # WhatsApp Cloud API + Fonnte fallback
│   │   │   ├── reminder_service.py    # Patient & schedule engine
│   │   │   ├── scheduler_worker.py    # Background scheduler worker
│   │   │   ├── ai_service.py          # Gemini AI chatbot
│   │   │   ├── ocr_service.py         # OCR + image preprocessing
│   │   │   ├── safety_evaluator.py    # Expiry & safety check
│   │   │   ├── matching_service.py    # Fuzzy medicine matching
│   │   │   ├── drug_interaction_service.py  # Drug interaction check
│   │   │   ├── auth_service.py        # JWT authentication
│   │   │   ├── wa_qr_service.py       # WhatsApp QR contact scan
│   │   │   └── personalized_safety.py # Personalized safety AI
│   │   ├── config.py                  # Centralized settings (.env loader)
│   │   └── main.py                    # FastAPI app entry + lifespan
│   ├── 📂 data/                       # JSON persistence storage
│   │   ├── scan_history.json
│   │   ├── users.json
│   │   └── reminders_engine.json      # Patients & schedules DB
│   ├── 📂 database/                   # Medicines database
│   │   ├── medicines.db               # SQLite
│   │   ├── medicines.json             # Flat JSON catalog
│   │   └── medicines_alodokter_1000.json  # 1000+ obat Indonesia
│   ├── 📂 tests/                      # Unit & Integration tests
│   ├── 📂 uploads/                    # Temporary scan uploads
│   ├── .env                           # ⚠️ Jangan di-commit! (lihat .env.example)
│   ├── requirements.txt
│   └── run.py
│
├── 📂 frontend/                       # Next.js 14 Frontend
│   ├── 📂 src/
│   │   ├── 📂 app/                    # Next.js App Router pages
│   │   │   ├── page.jsx               # Home — AI Scanner
│   │   │   ├── reminders/page.jsx     # Pengingat Obat & Bot WA
│   │   │   ├── history/page.jsx       # Riwayat Pemindaian
│   │   │   ├── medicines/page.jsx     # Katalog Obat
│   │   │   ├── interactions/page.jsx  # Cek Interaksi Obat
│   │   │   ├── analytics/page.jsx     # Analitik & Statistik
│   │   │   └── settings/page.jsx      # Pengaturan
│   │   ├── 📂 components/             # Reusable React Components
│   │   │   ├── AIChatBot.jsx          # Chatbot sidebar
│   │   │   ├── CameraScanner.jsx      # Kamera & upload scanner
│   │   │   ├── Sidebar.jsx            # Navigation sidebar
│   │   │   ├── AuthModal.jsx          # Login/Register modal
│   │   │   └── ...
│   │   └── 📂 lib/                    # Utilities & API clients
│   │       ├── api.js                 # Axios API client
│   │       ├── AuthContext.jsx        # Auth state management
│   │       └── ...
│   ├── .env.local                     # ⚠️ Jangan di-commit!
│   ├── .env.example                   # Template env variables
│   └── package.json
│
├── Dockerfile                         # Docker build (full stack)
├── docker-compose.yml                 # Local Docker Compose
├── railway.json                       # Railway deployment config
├── vercel.json                        # Vercel deployment config
├── Procfile                           # Heroku / Railway Procfile
└── README.md                          # 📖 File ini
```

---

## 🛠️ Tech Stack

### Backend
| Layer | Teknologi |
|-------|-----------|
| Web Framework | FastAPI 0.110+ |
| Language | Python 3.10+ |
| OCR Engine | Tesseract OCR + RapidOCR (ONNX) |
| Image Processing | OpenCV Headless + Pillow |
| AI / Vision | Google Gemini 1.5 Flash |
| String Matching | RapidFuzz + Levenshtein |
| HTTP Client | httpx (async) + requests |
| Auth | JWT (python-jose) + bcrypt |
| Data Storage | JSON flat-file (reminders, history, users) |
| Medicine DB | SQLite + JSON (1000+ obat Indonesia) |

### Frontend
| Layer | Teknologi |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | JavaScript / JSX |
| Styling | Tailwind CSS 3 |
| Icons | Lucide React |
| HTTP Client | Axios |
| State | React Context API |

### Infrastruktur & Deployment
| Komponen | Platform |
|----------|----------|
| Backend Hosting | Railway |
| Frontend Hosting | Vercel |
| Container | Docker |
| WhatsApp API | Fonnte.com (Bot sender: +6289520344305) |
| AI API | Google Gemini AI Studio |

---

## ✅ Prasyarat

Pastikan tools berikut sudah terinstall di komputer kamu:

- **Python** ≥ 3.10 → [python.org](https://www.python.org/downloads/)
- **Node.js** ≥ 18 → [nodejs.org](https://nodejs.org/)
- **Git** → [git-scm.com](https://git-scm.com/)
- **Tesseract OCR** → [instalasi Tesseract](https://github.com/tesseract-ocr/tesseract#installing-tesseract)
  - Windows: `winget install UB-Mannheim.TesseractOCR`
  - Ubuntu: `sudo apt install tesseract-ocr`
  - macOS: `brew install tesseract`

---

## 🚀 Instalasi & Setup Lokal

### 1. Clone Repository

```bash
git clone https://github.com/rifqiaunur666/pharmashield-project.git
cd pharmashield-project
```

### 2. Setup Backend

```bash
cd backend

# Buat virtual environment
python -m venv venv

# Aktifkan venv
# Windows:
venv\Scripts\activate
# macOS / Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Konfigurasi Environment Backend

```bash
# Salin template (jika ada)
cp .env.example .env   # atau buat manual

# Edit .env sesuai instruksi di bawah
```

Isi file `backend/.env`:

```env
# ─── Fonnte WhatsApp API ──────────────────────────────────────
FONNTE_TOKEN=YOUR_FONNTE_DEVICE_TOKEN_HERE

# Nomor bot pengirim (device yang terhubung di Fonnte)
FONNTE_SENDER_NUMBER=6289520344305

# Nomor default penerima alert scan obat
WA_TARGET_NUMBER=6285374497583

# ─── Google Gemini AI ─────────────────────────────────────────
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE

# ─── App Settings ─────────────────────────────────────────────
APP_ENV=development
PORT=8000
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### 4. Setup Frontend

```bash
cd ../frontend

# Install dependencies
npm install

# Buat .env.local
cp .env.example .env.local
```

Isi file `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

---

## ▶️ Menjalankan Aplikasi

### Jalankan Backend (Terminal 1)

```bash
cd backend
venv\Scripts\activate   # atau source venv/bin/activate

# Development mode
uvicorn app.main:app --reload --port 8000

# Atau menggunakan run.py
python run.py
```

Backend akan tersedia di: **http://localhost:8000**
API Docs (Swagger): **http://localhost:8000/docs**

### Jalankan Frontend (Terminal 2)

```bash
cd frontend
npm run dev
```

Frontend akan tersedia di: **http://localhost:3000**

---

## 🌐 API Endpoints

### 📸 Scan & Medicine

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/scan-medicine` | Upload foto kemasan obat untuk dianalisis AI |
| `GET` | `/api/history` | Ambil riwayat pemindaian |
| `DELETE` | `/api/history/{id}` | Hapus item riwayat |
| `GET` | `/api/medicines` | Daftar katalog obat |
| `GET` | `/api/interactions` | Cek interaksi antar obat |

### ⏰ Reminder & WhatsApp Bot

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/api/reminders/patients` | Daftar semua pasien terdaftar |
| `POST` | `/api/reminders/patients` | Daftarkan pasien baru |
| `DELETE` | `/api/reminders/patients/{id}` | Hapus pasien |
| `POST` | `/api/reminders/schedules` | Tambah jadwal minum obat |
| `GET` | `/api/reminders/schedules` | Daftar jadwal aktif |
| `DELETE` | `/api/reminders/schedules/{id}` | Hapus jadwal |
| `POST` | `/api/reminders/simulate-tick` | Simulasi trigger scheduler |
| `GET` | `/api/reminders/gateway-status` | Cek status koneksi bot WA |
| `POST` | `/api/reminders/update-credentials` | Update token Fonnte/Meta |
| `GET` | `/api/reminders/logs` | Riwayat pengiriman notifikasi |

### 🤖 AI Chatbot

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/ai/chat` | Chat dengan AI farmasi (Gemini) |
| `POST` | `/api/ai/analyze-image` | Analisis gambar via Gemini Vision |

### 🔐 Autentikasi

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/auth/register` | Register akun baru |
| `POST` | `/api/auth/login` | Login & dapatkan JWT token |
| `GET` | `/api/auth/me` | Info user yang sedang login |

---

## 📱 WhatsApp Bot & Notifikasi

PharmaShield menggunakan **[Fonnte](https://fonnte.com)** sebagai gateway WhatsApp bot.

### Cara Kerja

```
Scheduler (setiap 30 detik)
    ↓
Cek jadwal yang akan jatuh tempo
    ↓
H-10 menit → Kirim pesan persiapan
    ↓
H-0 menit → Kirim pesan + tombol [Ya, Sudah Minum] / [Belum]
    ↓
Jika [Belum] → Kirim follow-up 10 menit kemudian
    ↓
Dynamic rescheduling otomatis
```

### Setup Token Fonnte

1. Daftar di [fonnte.com](https://fonnte.com)
2. Sambungkan nomor WhatsApp kamu sebagai **device**
3. Salin **Device Token** dari dashboard Fonnte
4. Masukkan token di `backend/.env` → `FONNTE_TOKEN`
5. Atau input langsung di UI → klik tombol **"🔑 Masukkan Token WhatsApp"**

> **Bot Pengirim:** +6289520344305 (nomor yang terhubung di Fonnte)

---

## 🐳 Menjalankan dengan Docker

```bash
# Build dan jalankan semua service
docker compose up --build

# Hanya backend
docker build -t pharmashield-backend ./backend
docker run -p 8000:8000 --env-file backend/.env pharmashield-backend
```

---

## ☁️ Deployment

### Backend → Railway

1. Push ke branch `main`
2. Railway auto-detect dari `railway.json` & `Procfile`
3. Set Environment Variables di Railway dashboard (sama seperti `.env`)

### Frontend → Vercel

1. Connect repo di [vercel.com](https://vercel.com)
2. Set **Root Directory** → `frontend`
3. Set Environment Variable:
   ```
   NEXT_PUBLIC_API_URL=https://your-railway-backend-url.railway.app
   ```
4. Deploy otomatis setiap push ke `main`

---

## 🧪 Testing

```bash
cd backend

# Aktifkan virtual environment
venv\Scripts\activate

# Jalankan semua test
pytest tests/ -v

# Test spesifik
pytest tests/test_reminder_engine.py -v
pytest tests/test_pharmashield.py -v
```

---

## 🤝 Kontribusi

Kami sangat menyambut kontribusi dari siapapun! Berikut panduan berkontribusi:

### Alur Kerja (Git Flow)

```
main                    # Branch production — selalu stabil
  └── develop           # Branch development utama
        ├── feature/xxx # Fitur baru
        ├── fix/xxx     # Bug fix
        └── docs/xxx    # Update dokumentasi
```

### Langkah Kontribusi

1. **Fork** repository ini
2. **Clone** fork kamu:
   ```bash
   git clone https://github.com/USERNAME/pharmashield-project.git
   ```
3. **Buat branch** baru dari `main`:
   ```bash
   git checkout -b feature/nama-fitur-kamu
   ```
4. **Kerjakan perubahan** kamu
5. **Commit** dengan pesan yang jelas (gunakan [Conventional Commits](https://www.conventionalcommits.org)):
   ```bash
   git commit -m "feat: tambah fitur pengingat multi-dosis"
   git commit -m "fix: perbaiki bug parser tanggal kedaluwarsa"
   git commit -m "docs: update README instruksi instalasi"
   ```
6. **Push** ke branch kamu:
   ```bash
   git push origin feature/nama-fitur-kamu
   ```
7. **Buat Pull Request** ke branch `main`

### Konvensi Commit

| Prefix | Penggunaan |
|--------|-----------|
| `feat:` | Fitur baru |
| `fix:` | Bug fix |
| `docs:` | Perubahan dokumentasi |
| `style:` | Perubahan tampilan / CSS |
| `refactor:` | Refactoring kode |
| `test:` | Menambah atau mengubah test |
| `chore:` | Update dependency, config, dll |

### Aturan Coding

- **Python**: Ikuti PEP 8, gunakan type hints
- **JavaScript/JSX**: Gunakan functional components & React Hooks
- **Komentar**: Tulis dalam Bahasa Indonesia untuk kode bisnis, Inggris untuk komentar teknis
- **Jangan commit**: file `.env`, `node_modules/`, `venv/`, `__pycache__/`, file upload

---

## 👥 Kolaborator

| Nama | GitHub | Peran |
|------|--------|-------|
| Rifqi Aunur | [@rifqiaunur666](https://github.com/rifqiaunur666) | Lead Developer |

> Ingin bergabung sebagai kolaborator? Buka **Issue** atau hubungi via WhatsApp bot kami! 😄

---

## 📄 Lisensi

Project ini menggunakan lisensi **MIT**. Silakan gunakan, modifikasi, dan distribusikan dengan bebas dengan mencantumkan kredit.

---

## 🔗 Link Penting

| Resource | URL |
|----------|-----|
| 🌐 Demo Live | _Coming soon_ |
| 📚 API Docs | `http://localhost:8000/docs` (lokal) |
| 🤖 Fonnte Dashboard | https://fonnte.com |
| 🧠 Gemini AI Studio | https://aistudio.google.com |
| 🚂 Railway | https://railway.app |
| ▲ Vercel | https://vercel.com |

---

<div align="center">

Dibuat dengan ❤️ untuk membantu lansia & keluarga Indonesia 🇮🇩

**PharmaShield — Obat Aman, Keluarga Sehat**

</div>
