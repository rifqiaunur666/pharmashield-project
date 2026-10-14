<div align="center">

<img src="frontend/public/logo.png" alt="PharmaShield Logo" width="120" />

# 🛡️ PharmaShield

**Sistem Keamanan & Pengingat Obat Berbasis AI untuk Pasien & Lansia**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python)](https://python.org)
[![Gemini AI](https://img.shields.io/badge/Google_Gemini_AI-Integrated-4285F4?style=flat-square&logo=google)](https://aistudio.google.com)
[![WhatsApp Bot](https://img.shields.io/badge/WhatsApp_Bot-Fonnte-25D366?style=flat-square&logo=whatsapp)](https://fonnte.com)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

## 📋 Daftar Isi

- [Tentang Project](#-tentang-project)
- [Fitur Utama](#-fitur-utama)
- [Arsitektur Sistem](#-arsitektur-sistem)
- [User Flow](#-user-flow)
  - [Flow 1 — Autentikasi (Login & Register)](#flow-1--autentikasi-login--register)
  - [Flow 2 — Scan Kemasan Obat (AI Scanner)](#flow-2--scan-kemasan-obat-ai-scanner)
  - [Flow 3 — Pengingat Minum Obat (WhatsApp Bot)](#flow-3--pengingat-minum-obat-whatsapp-bot)
  - [Flow 4 — Cek Interaksi Obat](#flow-4--cek-interaksi-obat)
  - [Flow 5 — Riwayat & Analitik](#flow-5--riwayat--analitik)
  - [Flow 6 — AI Chatbot Farmasi](#flow-6--ai-chatbot-farmasi)
  - [State Machine Reminder Engine](#state-machine-reminder-engine)
- [Struktur Project](#-struktur-project)
- [Tech Stack](#-tech-stack)
- [Prasyarat](#-prasyarat)
- [Cara Menjalankan Lokal (Step by Step)](#-cara-menjalankan-lokal-step-by-step)
  - [1. Clone Repository](#1-clone-repository)
  - [2. Setup Backend (FastAPI)](#2-setup-backend-fastapi)
  - [3. Setup Frontend (Next.js)](#3-setup-frontend-nextjs)
  - [4. Jalankan Aplikasi](#4-jalankan-aplikasi)
  - [5. Verifikasi Berjalan](#5-verifikasi-berjalan)
- [Environment Variables Lengkap](#-environment-variables-lengkap)
- [Menjalankan dengan Docker](#-menjalankan-dengan-docker)
- [API Endpoints](#-api-endpoints)
- [WhatsApp Bot & Notifikasi](#-whatsapp-bot--notifikasi)
- [Deployment (Railway + Vercel)](#-deployment-railway--vercel)
- [Testing](#-testing)
- [Troubleshooting](#-troubleshooting)
- [Kontribusi](#-kontribusi)

---

## 🎯 Tentang Project

**PharmaShield** adalah platform kesehatan digital yang dirancang khusus untuk membantu pasien dan keluarga lansia dalam:

1. **📸 Memindai kemasan obat** — AI Vision + OCR mengekstrak nama obat, tanggal kedaluwarsa, dan status keamanan secara otomatis.
2. **⏰ Pengingat minum obat otomatis** — Bot WhatsApp mengirimkan notifikasi ke nomor pasien sesuai jadwal yang didaftarkan, dari nomor bot **+6289520344305**.
3. **🤖 AI Chatbot Farmasi** — Tanya jawab seputar obat-obatan bertenaga Google Gemini.
4. **💊 Katalog Interaksi Obat** — Database interaksi antar obat untuk keselamatan penggunaan.
5. **📊 Riwayat & Analitik** — Histori pemindaian dan statistik penggunaan obat.

---

## ✨ Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| 🔍 **AI Vision Scanner** | Scan kemasan obat via foto — ekstrak nama, exp date, status otomatis |
| 📅 **Pengingat Otomatis** | Bot WA kirim notifikasi H-10 menit & tepat waktu minum obat |
| 💬 **Interactive Bot** | Pasien konfirmasi sudah/belum minum via tombol reply WhatsApp |
| 🔄 **Dynamic Rescheduling** | Jadwal otomatis disesuaikan jika pasien terlambat minum |
| 🤖 **AI Chatbot** | Tanya jawab farmasi berbasis Google Gemini AI |
| 💊 **Cek Interaksi Obat** | Deteksi kombinasi obat berpotensi berbahaya |
| 📋 **Katalog Obat** | 1000+ data obat Indonesia dari Alodokter |
| 🔐 **Autentikasi** | Login user dengan JWT token |
| 🌙 **Dark UI** | Antarmuka modern dark-mode |
| 📱 **Responsive** | Optimal di desktop, tablet, dan mobile |

---

## 🏗️ Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────┐
│                        USER / PASIEN                        │
└──────────────────────────┬──────────────────────────────────┘
                           │  Browser
              ┌────────────▼────────────┐
              │   Next.js Frontend      │
              │   localhost:3000        │
              │   (atau Vercel)         │
              └────────────┬────────────┘
                           │ HTTP REST API
              ┌────────────▼────────────┐
              │   FastAPI Backend       │
              │   localhost:8000        │
              │   (atau Railway)        │
              │                         │
              │  ┌─────────────────┐    │
              │  │ Reminder Engine │    │
              │  │ Scheduler (30s) │    │
              │  └───────┬─────────┘    │
              └──────────┼──────────────┘
                         │
         ┌───────────────┼────────────────┐
         │               │                │
   ┌─────▼──────┐  ┌─────▼──────┐  ┌────▼──────┐
   │ Fonnte WA  │  │ Gemini AI  │  │   OCR     │
   │ Bot API    │  │ Vision API │  │ Tesseract │
   └─────┬──────┘  └────────────┘  └───────────┘
         │
   ┌─────▼──────────────┐
   │  WhatsApp Pasien   │
   │  (nomor terdaftar) │
   └────────────────────┘
```

```

---

## 🗺️ User Flow

Berikut adalah diagram alur pengguna untuk setiap fitur utama PharmaShield, dibuat berdasarkan kode sumber aktual.

---

### Flow 1 — Autentikasi (Login & Register)

```mermaid
flowchart TD
    A([🌐 Buka Aplikasi]) --> B{Sudah login?}
    B -- Ya --> C[🏠 Halaman Dashboard]
    B -- Tidak --> D[Tampil Tombol Login / Daftar]
    D --> E{Pilih aksi}
    E -- Daftar --> F[Isi Nama, Email, Password]
    F --> G[Konfirmasi Password]
    G --> H{Password cocok?}
    H -- Tidak --> F
    H -- Ya --> I[POST /api/auth/register]
    I --> J{Berhasil?}
    J -- Tidak --> K[Tampil pesan error]
    K --> F
    J -- Ya --> L[✅ Akun dibuat, auto login]
    L --> C
    E -- Login --> M[Isi Email & Password]
    M --> N[POST /api/auth/login]
    N --> O{Token valid?}
    O -- Tidak --> P[❌ Tampil error kredensial]
    P --> M
    O -- Ya --> Q[Simpan JWT Token]
    Q --> C
    E -- Lupa sandi --> R[Isi Email]
    R --> S[POST /api/auth/forgot-password]
    S --> T[✉️ Info tautan pemulihan dikirim]
    C --> U[Fitur lengkap terbuka]
```

---

### Flow 2 — Scan Kemasan Obat (AI Scanner)

```mermaid
flowchart TD
    A([🏠 Dashboard / Halaman Utama]) --> B{Mode input}
    B -- Upload foto --> C[Pilih file gambar kemasan]
    B -- Kamera --> D[Buka kamera browser]
    D --> E[Ambil foto kemasan]
    E --> C
    C --> F[Preview gambar]
    F --> G{Gambar OK?}
    G -- Retake --> B
    G -- Ya --> H[POST /api/scan-medicine\nkirim file ke backend]
    H --> I[OCR Engine\nTesseract + RapidOCR]
    I --> J[Ekstrak teks dari kemasan]
    J --> K[Fuzzy Matching\ncocokkan nama obat ke database]
    K --> L[Safety Evaluator\nhitung sisa hari kedaluwarsa]
    L --> M{Status keamanan}
    M -- Aman --> N[🟢 AMAN\nSisa hari tertera]
    M -- Hampir exp --> O[🟡 PERHATIAN\nSegera habiskan]
    M -- Kedaluwarsa --> P[🔴 BERBAHAYA\nJangan dikonsumsi]
    M -- Tidak terbaca --> Q[⚪ DATA TIDAK TERBACA]
    N & O & P & Q --> R[Tampilkan MedicineResultCard\nnama obat, exp date, rekomendasi]
    R --> S[Simpan ke riwayat /api/history]
    S --> T{Kirim notif WA?}
    T -- Ya --> U[POST /api/wa/send-alert\nFonnte API]
    U --> V[📱 WhatsApp dikirim ke nomor target]
    T -- Tidak --> W[✅ Selesai]
    V --> W
    R --> X{Gemini AI Vision tersedia?}
    X -- Ya --> Y[POST /api/ai/scan-vision\nanalisis lebih dalam]
    Y --> Z[Tampilkan AI Confidence Score Panel]
```

---

### Flow 3 — Pengingat Minum Obat (WhatsApp Bot)

```mermaid
flowchart TD
    A([⏰ Halaman Pengingat]) --> B{Token Fonnte terpasang?}
    B -- Belum --> C[🔑 Klik Masukkan Token WA]
    C --> D[Input Device Token dari fonnte.com]
    D --> E[POST /api/reminders/update-credentials]
    E --> F[✅ Token tersimpan]
    F --> B
    B -- Sudah --> G[Dashboard Pengingat Aktif]
    G --> H{Aksi pengguna}

    H -- Daftarkan pasien --> I[Isi Nama & Nomor WA\natau Scan QR Kontak]
    I --> J[POST /api/reminders/patients]
    J --> K[✅ Pasien terdaftar]

    H -- Tambah jadwal obat --> L[Pilih pasien\nIsi nama obat, dosis, jam minum]
    L --> M[POST /api/reminders/schedules]
    M --> N[📤 Kirim WA konfirmasi jadwal\nke nomor pasien]
    N --> O[✅ Jadwal aktif]

    O --> P[[🔄 Scheduler berjalan setiap 30 detik]]
    P --> Q{10 menit sebelum jadwal?}
    Q -- Ya --> R[📱 Kirim WA Persiapan\nH-10 menit ke pasien]
    Q --> S{Tepat waktu jadwal?}
    S -- Ya --> T[📱 Kirim WA + Tombol Reply\nYa Sudah Minum / Belum]
    T --> U{Respons pasien}
    U -- Ya Sudah Minum --> V[✅ Log COMPLETED\nJadwal berikutnya dibuat]
    U -- Belum --> W[⏳ Tunggu 10 menit]
    W --> X[📱 Kirim Follow-up WA\nApakah sudah minum?]
    X --> Y{Respons follow-up}
    Y -- Ya Sudah --> V
    Y -- Belum Lagi --> Z[🔄 DELAYED\nDynamic Rescheduling]
    Z --> AA[Jadwal baru = waktu aktual + interval dokter]
    U -- Timeout --> Z
```

---

### Flow 4 — Cek Interaksi Obat

```mermaid
flowchart TD
    A([💊 Halaman Interaksi Obat]) --> B[Ketik nama obat pertama]
    B --> C[Autocomplete dari katalog\n1000+ obat Indonesia]
    C --> D[Pilih / tambah obat ke daftar]
    D --> E{Sudah 2+ obat?}
    E -- Belum --> B
    E -- Ya --> F[Klik Periksa Interaksi]
    F --> G[POST /api/interactions/check\nkirim array nama obat]
    G --> H[Drug Interaction Service\ncek database interaksi]
    H --> I{Ada interaksi?}
    I -- Tidak ada --> J[✅ Aman dikonsumsi bersamaan]
    I -- Ada --> K{Tingkat keparahan}
    K -- Minor --> L[🟡 Interaksi Ringan\nPerlu perhatian]
    K -- Moderate --> M[🟠 Interaksi Sedang\nKonsultasi dokter]
    K -- Severe --> N[🔴 Interaksi Berat\nJangan dikombinasikan]
    J & L & M & N --> O[Tampilkan detail & rekomendasi]
    O --> P{Hapus obat & coba lain?}
    P -- Ya --> B
    P -- Tidak --> Q[✅ Selesai]
```

---

### Flow 5 — Riwayat & Analitik

```mermaid
flowchart TD
    A([📋 Halaman Riwayat]) --> B{User login?}
    B -- Tidak --> C[❌ Tampil pesan belum login]
    B -- Ya --> D[GET /api/history\nambil semua riwayat scan]
    D --> E[Tampil tabel riwayat\nnama obat, status, tanggal scan]
    E --> F{Filter / Cari}
    F -- Filter status --> G[Filter: Aman / Perhatian / Berbahaya]
    F -- Cari nama --> H[Search by nama obat]
    G & H --> E
    E --> I{Aksi item}
    I -- Hapus satu --> J[DELETE /api/history/id]
    I -- Hapus semua --> K[Konfirmasi dialog\nHapus semua?]
    K -- Ya --> L[DELETE /api/history/clear-all]
    J & L --> D

    M([📊 Halaman Analitik]) --> N[GET /api/history\nambil semua data]
    N --> O[Hitung statistik:\nTotal scan, Aman, Perhatian, Berbahaya]
    O --> P[Tampil Radial Chart\nDistribusi status keamanan]
    P --> Q[Tampil Distribusi BPOM\nBebas / Bebas Terbatas / Keras]
    Q --> R[Tampil Tren Penyakit Umum\nIndonesia dari katalog]
```

---

### Flow 6 — AI Chatbot Farmasi

```mermaid
flowchart TD
    A([🤖 Buka AI Chatbot]) --> B[Sidebar chatbot muncul]
    B --> C[User ketik pertanyaan\ntentang obat / kesehatan]
    C --> D[POST /api/ai/chat\nkirim pesan + history konteks]
    D --> E[Gemini 1.5 Flash API]
    E --> F{Response berhasil?}
    F -- Tidak --> G[❌ Tampil pesan error koneksi]
    G --> C
    F -- Ya --> H[Tampilkan jawaban AI\ndi bubble chat]
    H --> I{Pertanyaan lanjutan?}
    I -- Ya --> C
    I -- Tidak --> J[Riwayat chat tersimpan\ndi sesi browser]

    K([📸 Scan via AI Vision]) --> L[Upload gambar kemasan obat]
    L --> M[POST /api/ai/scan-vision\nkirim gambar ke Gemini Vision]
    M --> N[Gemini analisis gambar]
    N --> O[Tampilkan hasil analisis\nnama obat, komposisi, saran]
    O --> P[Confidence Score Panel\ntingkat kepercayaan hasil]
```

---

### State Machine Reminder Engine

Diagram transisi status internal pada setiap log pengingat obat:

```mermaid
stateDiagram-v2
    [*] --> PENDING : Jadwal dibuat

    PENDING --> REMINDED_10M : H-10 menit\nKirim WA persiapan
    REMINDED_10M --> DUE_0M : Tepat waktu jadwal\nKirim WA + tombol reply

    DUE_0M --> COMPLETED : Pasien klik\nYa Sudah Minum
    DUE_0M --> DELAYED : Pasien klik Belum\natau timeout 15 menit

    DELAYED --> COMPLETED : Follow-up dibalas\nYa Sudah
    DELAYED --> RESCHEDULED : Follow-up dibalas Belum\natau timeout lanjutan

    RESCHEDULED --> PENDING : Jadwal baru dibuat\nwaktu aktual + interval dokter

    COMPLETED --> [*] : Dosis tercatat ✅
    SKIPPED --> [*] : Dosis dilewati ⚠️

    PENDING --> SKIPPED : Melewati batas\nwaktu tanpa respons
```

---

## 📁 Struktur Project

```
pharmashield-project/
│
├── 📂 backend/                        # FastAPI Backend (Python)
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
│   │   │   ├── scheduler_worker.py    # Background scheduler (30s tick)
│   │   │   ├── ai_service.py          # Gemini AI chatbot
│   │   │   ├── ocr_service.py         # OCR + image preprocessing
│   │   │   ├── safety_evaluator.py    # Expiry & safety check
│   │   │   ├── matching_service.py    # Fuzzy medicine matching
│   │   │   ├── drug_interaction_service.py  # Drug interaction check
│   │   │   ├── auth_service.py        # JWT authentication
│   │   │   └── personalized_safety.py # Personalized safety AI
│   │   ├── config.py                  # Centralized settings (.env loader)
│   │   └── main.py                    # FastAPI app entry + lifespan
│   ├── 📂 data/                       # JSON persistence storage
│   │   ├── scan_history.json          # Riwayat scan
│   │   ├── users.json                 # Data user
│   │   └── reminders_engine.json      # Pasien & jadwal obat
│   ├── 📂 database/                   # Medicines database
│   │   ├── medicines.db               # SQLite
│   │   └── medicines_alodokter_1000.json  # 1000+ obat Indonesia
│   ├── 📂 tests/                      # Unit & Integration tests
│   ├── 📂 uploads/                    # Temporary scan uploads
│   ├── .env                           # ⚠️ Secret! Jangan di-commit
│   ├── requirements.txt               # Python dependencies
│   └── run.py                         # Entry point server
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
│   │   └── 📂 lib/                    # Utilities & API clients
│   ├── .env.local                     # ⚠️ Secret! Jangan di-commit
│   ├── .env.example                   # Template env variables
│   └── package.json
│
├── Dockerfile                         # Docker build config
├── Procfile                           # Railway / Heroku runner
├── railway.json                       # Railway deployment config
├── vercel.json                        # Vercel API proxy config
└── README.md                          # 📖 File ini
```

---

## 🛠️ Tech Stack

### Backend
| Layer | Teknologi | Versi |
|-------|-----------|-------|
| Web Framework | FastAPI | ≥ 0.110 |
| Language | Python | ≥ 3.10 |
| OCR Engine | Tesseract + RapidOCR (ONNX) | Latest |
| Image Processing | OpenCV Headless + Pillow | Latest |
| AI / Vision | Google Gemini 1.5 Flash | Latest |
| String Matching | RapidFuzz + Levenshtein | Latest |
| HTTP Client | httpx (async) + requests | Latest |
| Auth | JWT (python-jose) + bcrypt | Latest |

### Frontend
| Layer | Teknologi | Versi |
|-------|-----------|-------|
| Framework | Next.js | 14 |
| Language | JavaScript / JSX | ES2022 |
| Styling | Tailwind CSS | 3 |
| Icons | Lucide React | Latest |
| HTTP Client | Axios | Latest |

---

## ✅ Prasyarat

Install semua tools berikut **sebelum** memulai:

### 1. Python ≥ 3.10
```bash
# Cek versi
python --version
# atau
python3 --version
```
Download: https://www.python.org/downloads/

### 2. Node.js ≥ 18
```bash
# Cek versi
node --version
npm --version
```
Download: https://nodejs.org/

### 3. Git
```bash
git --version
```
Download: https://git-scm.com/

### 4. Tesseract OCR
Dibutuhkan untuk fitur scan kemasan obat.

**Windows:**
```bash
winget install UB-Mannheim.TesseractOCR
# Path default: C:\Program Files\Tesseract-OCR\tesseract.exe
```
Atau download installer: https://github.com/UB-Mannheim/tesseract/wiki

**Ubuntu / Debian:**
```bash
sudo apt update
sudo apt install tesseract-ocr tesseract-ocr-ind -y
```

**macOS:**
```bash
brew install tesseract
```

Verifikasi instalasi:
```bash
tesseract --version
```

---

## 🚀 Cara Menjalankan Lokal (Step by Step)

### 1. Clone Repository

```bash
git clone https://github.com/rifqiaunur666/pharmashield-project.git
cd pharmashield-project
```

---

### 2. Setup Backend (FastAPI)

#### 2a. Masuk ke folder backend
```bash
cd backend
```

#### 2b. Buat Virtual Environment

**Windows (PowerShell / CMD):**
```bash
python -m venv venv
venv\Scripts\activate
```

**macOS / Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

> Jika berhasil, terminal akan menampilkan prefix `(venv)` di awal baris.

#### 2c. Install Dependencies Python
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

> ⏳ Proses ini membutuhkan waktu 2–5 menit karena menginstall library OCR dan AI.

#### 2d. Buat File `.env` Backend

Buat file baru bernama `.env` di dalam folder `backend/`:

```bash
# Windows
copy NUL .env
# atau buka dengan Notepad / VS Code
notepad .env
```

```bash
# macOS / Linux
touch .env
nano .env
# atau
code .env
```

Isi dengan konfigurasi berikut:

```env
# ─────────────────────────────────────────────────────────────
# WAJIB DIISI untuk fitur WhatsApp Bot
# ─────────────────────────────────────────────────────────────

# Token device WhatsApp dari fonnte.com
# Cara dapat: Daftar di fonnte.com → Sambungkan WA → Salin Device Token
FONNTE_TOKEN=ISI_TOKEN_FONNTE_KAMU_DISINI

# Nomor bot pengirim (nomor WA yang terhubung di Fonnte)
FONNTE_SENDER_NUMBER=6289520344305

# Nomor default penerima alert scan obat (format internasional, tanpa +)
WA_TARGET_NUMBER=6285374497583

# ─────────────────────────────────────────────────────────────
# WAJIB DIISI untuk fitur AI Scanner & Chatbot
# ─────────────────────────────────────────────────────────────

# API Key Google Gemini AI (GRATIS)
# Cara dapat: https://aistudio.google.com/app/apikey → klik "Get API Key"
GEMINI_API_KEY=ISI_API_KEY_GEMINI_KAMU_DISINI

# ─────────────────────────────────────────────────────────────
# Konfigurasi Server (bisa dibiarkan default)
# ─────────────────────────────────────────────────────────────
APP_ENV=development
PORT=8000
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Path Tesseract OCR (sesuaikan jika berbeda)
# Windows default:
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
# Linux/macOS:
# TESSERACT_CMD=/usr/bin/tesseract
```

---

### 3. Setup Frontend (Next.js)

Buka **terminal baru** (jangan tutup terminal backend), lalu:

#### 3a. Masuk ke folder frontend
```bash
# Dari root project
cd frontend
```

#### 3b. Install Dependencies Node.js
```bash
npm install
```

> ⏳ Proses ini membutuhkan waktu 1–3 menit.

#### 3c. Buat File `.env.local` Frontend

```bash
# Windows
copy NUL .env.local
notepad .env.local
```

```bash
# macOS / Linux
touch .env.local
nano .env.local
```

Isi dengan:

```env
# URL backend FastAPI (jangan ada trailing slash)
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

---

### 4. Jalankan Aplikasi

Kamu membutuhkan **2 terminal** yang berjalan bersamaan.

#### Terminal 1 — Jalankan Backend

```bash
# Pastikan sudah di folder backend dan venv aktif
cd backend

# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Jalankan server development (dengan auto-reload)
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Output yang diharapkan:
```
INFO:     Started server process [xxxx]
INFO:     Waiting for application startup.
INFO:     [SchedulerWorker] High-precision background reminder worker started.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

#### Terminal 2 — Jalankan Frontend

```bash
# Pastikan sudah di folder frontend
cd frontend

# Jalankan development server
npm run dev
```

Output yang diharapkan:
```
  ▲ Next.js 14.x.x
  - Local:        http://localhost:3000
  - Network:      http://192.168.x.x:3000

✓ Ready in 2.5s
```

---

### 5. Verifikasi Berjalan

Buka browser dan akses URL berikut:

| URL | Keterangan |
|-----|-----------|
| http://localhost:3000 | ✅ Aplikasi PharmaShield (Frontend) |
| http://localhost:8000 | ✅ Backend API Health Check |
| http://localhost:8000/docs | ✅ Swagger UI — Dokumentasi API Interaktif |
| http://localhost:8000/redoc | ✅ ReDoc — Dokumentasi API Alternatif |

**Test API secara manual:**
```bash
# Cek health backend
curl http://localhost:8000/health

# Response yang diharapkan:
# {"status":"ok","service":"PharmaShield API","version":"2.0.0",...}
```

---

## 🔧 Environment Variables Lengkap

### Backend (`backend/.env`)

| Variable | Wajib | Default | Keterangan |
|----------|-------|---------|-----------|
| `FONNTE_TOKEN` | ✅ Ya | — | Device token dari [fonnte.com](https://fonnte.com) |
| `FONNTE_SENDER_NUMBER` | — | `6289520344305` | Nomor bot pengirim WA |
| `WA_TARGET_NUMBER` | — | — | Nomor default penerima alert scan |
| `GEMINI_API_KEY` | ✅ Ya | — | API Key dari [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `APP_ENV` | — | `development` | `development` / `production` |
| `PORT` | — | `8000` | Port server backend |
| `CORS_ORIGINS` | — | `http://localhost:3000,...` | Origin yang diizinkan (pisah koma) |
| `TESSERACT_CMD` | — | Auto-detect | Path ke binary Tesseract |

### Frontend (`frontend/.env.local`)

| Variable | Wajib | Default | Keterangan |
|----------|-------|---------|-----------|
| `NEXT_PUBLIC_API_URL` | ✅ Ya | `http://127.0.0.1:8000` | URL backend FastAPI |

---

## 🐳 Menjalankan dengan Docker

Alternatif jika tidak ingin setup manual (membutuhkan [Docker Desktop](https://www.docker.com/products/docker-desktop/)):

### Build & Jalankan Backend saja

```bash
# Dari root project
docker build -t pharmashield-backend .

# Jalankan dengan env variables
docker run -p 8000:8000 \
  -e FONNTE_TOKEN=token_kamu \
  -e GEMINI_API_KEY=key_kamu \
  -e APP_ENV=development \
  pharmashield-backend
```

### Menggunakan Docker Compose (Backend + Frontend)

```bash
# Dari root project
docker compose up --build

# Atau jalankan di background
docker compose up -d --build

# Stop
docker compose down
```

Akses aplikasi di http://localhost:3000

---

## 🌐 API Endpoints

### 📸 Scan & Medicine

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/scan-medicine` | Upload foto kemasan obat untuk dianalisis |
| `GET` | `/api/history` | Ambil riwayat pemindaian |
| `DELETE` | `/api/history/{id}` | Hapus item riwayat |
| `GET` | `/api/stats` | Statistik penggunaan |

### ⏰ Reminder & WhatsApp Bot

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/api/reminders/patients` | Daftar semua pasien |
| `POST` | `/api/reminders/patients` | Daftarkan pasien baru |
| `DELETE` | `/api/reminders/patients/{id}` | Hapus pasien |
| `POST` | `/api/reminders/schedules` | Tambah jadwal minum obat |
| `GET` | `/api/reminders/schedules` | Daftar jadwal aktif |
| `DELETE` | `/api/reminders/schedules/{id}` | Hapus jadwal |
| `POST` | `/api/reminders/simulate-tick` | Simulasi trigger scheduler |
| `GET` | `/api/reminders/gateway-status` | Status koneksi bot WA |
| `POST` | `/api/reminders/update-credentials` | Update token gateway |
| `GET` | `/api/reminders/logs` | Riwayat pengiriman notifikasi |

### 🤖 AI Chatbot

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/ai/chat` | Chat dengan AI farmasi (Gemini) |
| `POST` | `/api/ai/scan-vision` | Analisis gambar via Gemini Vision |
| `GET` | `/api/ai/status` | Status koneksi Gemini AI |

### 🔐 Autentikasi

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/auth/register` | Register akun baru |
| `POST` | `/api/auth/login` | Login & dapatkan JWT token |
| `GET` | `/api/auth/me` | Info user yang sedang login |

> 💡 Dokumentasi API interaktif lengkap tersedia di **http://localhost:8000/docs** saat backend berjalan.

---

## 📱 WhatsApp Bot & Notifikasi

PharmaShield menggunakan **[Fonnte](https://fonnte.com)** sebagai gateway WhatsApp.

### Cara Kerja Otomatis

```
Scheduler berjalan setiap 30 detik
         ↓
Cek semua jadwal minum obat terdaftar
         ↓
H-10 menit sebelum jadwal
→ Kirim pesan persiapan ke pasien
         ↓
Tepat waktu jadwal (H-0)
→ Kirim pesan + tombol [Ya, Sudah Minum] / [Belum]
         ↓
Jika pasien membalas [Belum]
→ Kirim follow-up reminder 10 menit kemudian
         ↓
Jika pasien membalas [Ya, Sudah] / melewati batas waktu
→ Dynamic rescheduling: jadwal berikutnya disesuaikan otomatis
```

### Cara Setup Token Fonnte

1. Daftar di **[fonnte.com](https://fonnte.com)**
2. Klik **"Tambah Device"** → sambungkan nomor WhatsApp dengan scan QR
3. Salin **Device Token** dari dashboard Fonnte
4. Di aplikasi PharmaShield → halaman **Pengingat** → klik **"🔑 Masukkan Token WhatsApp"**
5. Paste token → Simpan

> **Bot Pengirim:** `+6289520344305` — Semua notifikasi dikirim dari nomor ini.

---

## ☁️ Deployment (Railway + Vercel)

### Backend → Railway

1. Buat akun di [railway.app](https://railway.app)
2. Klik **"New Project"** → **"Deploy from GitHub Repo"**
3. Pilih repo `pharmashield-project`
4. Di tab **"Variables"**, tambahkan semua env dari `backend/.env`:
   ```
   FONNTE_TOKEN=...
   GEMINI_API_KEY=...
   APP_ENV=production
   PORT=8080
   ```
5. Railway akan otomatis build & deploy menggunakan `Dockerfile` dan `Procfile`
6. Salin URL Railway yang diberikan (format: `https://xxx.up.railway.app`)

### Frontend → Vercel

1. Buat akun di [vercel.com](https://vercel.com)
2. Klik **"Add New Project"** → import dari GitHub
3. Set **Root Directory** → `frontend`
4. Di tab **"Environment Variables"**, tambahkan:
   ```
   NEXT_PUBLIC_API_URL=https://URL_RAILWAY_KAMU.up.railway.app
   ```
5. Klik **Deploy**

### Update URL Railway di Kode

Setelah dapat URL Railway, update file `frontend/next.config.js`:

```js
// Ganti baris ini:
destination: 'https://pharmashield-project-production.up.railway.app/api/:path*'
// Dengan URL Railway kamu:
destination: 'https://URL_RAILWAY_KAMU.up.railway.app/api/:path*'
```

---

## 🧪 Testing

```bash
# Masuk ke folder backend
cd backend

# Aktifkan virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Jalankan semua test
pytest tests/ -v

# Jalankan test tertentu
pytest tests/test_reminder_engine.py -v
pytest tests/test_pharmashield.py -v

# Jalankan dengan coverage report
pytest tests/ -v --tb=short
```

---

## 🔧 Troubleshooting

### ❌ `ModuleNotFoundError: No module named 'app'`
```bash
# Pastikan menjalankan dari folder backend, bukan root project
cd backend
uvicorn app.main:app --reload --port 8000
```

### ❌ `TesseractNotFoundError`
```bash
# Windows: Tambahkan path Tesseract ke .env
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe

# Linux/macOS: Cek path instalasi
which tesseract
# Lalu set di .env:
TESSERACT_CMD=/usr/bin/tesseract
```

### ❌ `CORS Error` di browser
```bash
# Pastikan CORS_ORIGINS di backend/.env mencakup URL frontend kamu
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### ❌ WhatsApp bot tidak mengirim pesan
- Pastikan `FONNTE_TOKEN` sudah diisi dengan **Device Token** (bukan Account Token)
- Cek status device di dashboard Fonnte — harus **Connected**
- Pastikan nomor target dalam format internasional: `628xxxxxxxxx` (tanpa `+`)

### ❌ AI Chatbot / Scanner tidak bekerja
- Pastikan `GEMINI_API_KEY` sudah diisi dengan benar
- Cek kuota API di [Google AI Studio](https://aistudio.google.com)
- Tier gratis: 60 request/menit, 1.500 request/hari

### ❌ `npm install` gagal
```bash
# Hapus node_modules dan install ulang
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### ❌ Port 8000 sudah digunakan
```bash
# Ganti port di backend/.env
PORT=8001

# Jalankan dengan port baru
uvicorn app.main:app --reload --port 8001

# Update frontend/.env.local
NEXT_PUBLIC_API_URL=http://127.0.0.1:8001
```

---

## 🤝 Kontribusi

Kami sangat menyambut kontribusi! Berikut panduan untuk kolaborator:

### Alur Kerja Git

```
main                    ← Branch production, selalu stabil
  └── develop           ← Branch development utama (opsional)
        ├── feature/xxx ← Fitur baru
        ├── fix/xxx     ← Bug fix
        └── docs/xxx    ← Update dokumentasi
```

### Langkah Kontribusi

1. **Fork** repository ini di GitHub

2. **Clone** fork kamu:
   ```bash
   git clone https://github.com/USERNAME_KAMU/pharmashield-project.git
   cd pharmashield-project
   ```

3. **Buat branch** baru:
   ```bash
   git checkout -b feature/nama-fitur-kamu
   # Contoh:
   git checkout -b feature/multi-dosis-reminder
   git checkout -b fix/parser-tanggal-kedaluwarsa
   ```

4. **Kerjakan perubahan**, lalu commit:
   ```bash
   git add .
   git commit -m "feat: tambah fitur pengingat multi-dosis"
   ```

5. **Push** branch ke GitHub:
   ```bash
   git push origin feature/nama-fitur-kamu
   ```

6. **Buat Pull Request** di GitHub → pilih base branch `main`

### Konvensi Commit Message

Format: `<type>: <deskripsi singkat>`

| Type | Kapan digunakan |
|------|----------------|
| `feat:` | Menambah fitur baru |
| `fix:` | Memperbaiki bug |
| `docs:` | Mengubah dokumentasi |
| `style:` | Perubahan tampilan / CSS |
| `refactor:` | Refactoring kode (tanpa ubah fitur) |
| `test:` | Menambah atau mengubah test |
| `chore:` | Update dependency, config, dll |

Contoh:
```
feat: tambah notifikasi WhatsApp multi-bahasa
fix: perbaiki parsing tanggal exp format MM/YYYY
docs: tambah panduan setup Docker di README
refactor: pisah reminder engine menjadi modul terpisah
```

### Aturan Coding

- **Python**: Ikuti PEP 8, gunakan type hints untuk semua fungsi
- **JavaScript/JSX**: Gunakan functional components & React Hooks
- **Komentar**: Bahasa Indonesia untuk komentar bisnis logic
- **Jangan commit**: `.env`, `node_modules/`, `venv/`, `.venv/`, `__pycache__/`, `uploads/*`

---

## 👥 Kolaborator

| Nama | GitHub | Peran |
|------|--------|-------|
| Rifqi Aunur | [@rifqiaunur666](https://github.com/rifqiaunur666) | Lead Developer |

> 💬 Ingin bergabung sebagai kolaborator? Buka **Issue** di GitHub atau hubungi langsung!

---

## 📄 Lisensi

Project ini menggunakan lisensi **MIT** — bebas digunakan, dimodifikasi, dan didistribusikan dengan menyertakan kredit.

---

## 🔗 Link Penting

| Resource | URL |
|----------|-----|
| 🌐 Demo Live | _Coming soon_ |
| 📚 API Docs | http://localhost:8000/docs |
| 🐙 GitHub Repo | https://github.com/rifqiaunur666/pharmashield-project |
| 🤖 Fonnte Dashboard | https://fonnte.com |
| 🧠 Gemini AI Studio | https://aistudio.google.com |
| 🚂 Railway | https://railway.app |
| ▲ Vercel | https://vercel.com |
| 🔤 Tesseract OCR | https://github.com/UB-Mannheim/tesseract/wiki |

---

<div align="center">

Dibuat dengan ❤️ untuk membantu lansia & keluarga Indonesia 🇮🇩

**PharmaShield — Obat Aman, Keluarga Sehat**

⭐ Jika project ini bermanfaat, jangan lupa beri **Star** di GitHub!

</div>
