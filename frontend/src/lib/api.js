/**
 * src/lib/api.js
 * PharmaShield — Complete API Integration Client.
 *
 * Includes:
 * - Authentication (Register, Login, Me, Update Profile, Forgot Password, Reset Password)
 * - Single-Packaging AI Drug Safety Scanner (/api/scan-medicine)
 * - History and Dashboard Aggregate Stats
 */

const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  // When accessed from Vercel or any non-local client, target Railway production backend
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1' && !host.startsWith('192.168.')) {
      return 'https://pharmashield-project-production.up.railway.app';
    }
  }
  return 'http://127.0.0.1:8000';
};

const BASE_URL = getBaseUrl();

export const API_BASE = `${BASE_URL}/api`;

const toList = (v) => (Array.isArray(v) ? v : v ? [String(v)] : []);

// ─── Token Session Storage ───────────────────────────────────────────────────

export function getAuthToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pharmashield_token');
}

export function setAuthToken(token) {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem('pharmashield_token', token);
  } else {
    localStorage.removeItem('pharmashield_token');
  }
}

export function getStoredUser() {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('pharmashield_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem('pharmashield_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('pharmashield_user');
  }
}

export function clearAuthSession() {
  setAuthToken(null);
  setStoredUser(null);
}

function getAuthHeaders() {
  const token = getAuthToken();
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ─── Normalizer ─────────────────────────────────────────────────────────────

export function normalizeResult(raw = {}) {
  const d = raw.data ?? raw;

  const id = d.scan_id ?? d.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const name = d.name ?? d.medicine_name ?? d.nama_obat ?? null;

  const expiryDate = d.expiry_date ?? d.expired_date ?? null;
  const mfgDate = d.mfg_date ?? null;

  // Status mapping: green | yellow | red | gray
  const rawStatus = String(d.status ?? d.safety_status ?? '').toLowerCase();
  let status = 'yellow';
  if (['green', 'yellow', 'red', 'gray'].includes(rawStatus)) {
    status = rawStatus;
  } else if (rawStatus === 'hijau' || rawStatus === 'aman') {
    status = 'green';
  } else if (rawStatus === 'merah' || rawStatus === 'bahaya') {
    status = 'red';
  }

  const identified = d.identified ?? Boolean(name && name !== 'Kemasan Tidak Teridentifikasi');

  return {
    id,
    scan_id: id,
    identified: Boolean(identified),
    name: name || (identified ? 'Obat Terdeteksi' : 'Kemasan Tidak Teridentifikasi'),
    medicineName: name || 'Kemasan Tidak Teridentifikasi',
    genericName: d.generic_name ?? name ?? 'Tidak terdata',
    brandNames: toList(d.brand_names ?? d.aliases),
    category: d.category ?? 'Pengobatan Umum',
    bpomClass: d.bpom_class ?? 'Pemeriksaan Fisik Diperlukan',
    dosageStrength: d.dosage_strength ?? 'Lihat label kemasan',
    dosageForm: d.dosage_form ?? 'Sediaan obat',
    purpose: d.function ?? d.purpose ?? d.fungsi ?? '',
    ingredients: toList(d.ingredients ?? d.kandungan),
    usage: d.usage ?? d.dosage ?? d.aturan_penggunaan ?? '',
    sideEffects: toList(d.side_effects ?? d.efek_samping),
    warnings: toList(d.warnings ?? d.warning ?? d.peringatan),
    contraindications: toList(d.contraindications),
    storageInfo: d.storage_info ?? 'Simpan pada tempat kering dan sejuk di bawah 30°C.',
    bpomRegistration: d.bpom_registration ?? '',
    bpomStatus: d.bpom_status ?? 'Pemeriksaan Fisik Diperlukan',
    dataSource: d.data_source ?? 'Ekstraksi OCR & Basis Data Obat ID',
    dataUpdatedAt: d.data_updated_at ?? 'Terbaru',
    disclaimer: d.disclaimer ?? 'Informasi ini bersifat edukasi dan bukan pengganti konsultasi dengan dokter atau apoteker.',
    expiryDate,
    mfgDate,
    status,
    statusId: d.status_id ?? (status === 'green' ? 'Aman' : status === 'yellow' ? 'Peringatan' : status === 'gray' ? 'Perlu Verifikasi' : 'Bahaya'),
    statusEmoji: d.status_emoji ?? (status === 'green' ? '🟢' : status === 'yellow' ? '🟡' : status === 'gray' ? '⚪' : '🔴'),
    readabilityStatus: d.readability_status ?? 'valid',
    readabilityLabel: d.readability_label ?? 'Label Terbaca',
    isSafeToConsume: Boolean(d.is_safe_to_consume),
    riskLevel: d.risk_level ?? 'Sedang',
    shelfLifeNote: d.shelf_life_note ?? '',
    recommendation: d.recommendation ?? '',
    confidencePercentage: d.confidence_percentage ?? Math.round((d.overall_confidence || 0) * 100),
    ocrConfidence: d.ocr_confidence ?? 0,
    matchConfidence: d.match_confidence ?? 0,
    overallConfidence: d.overall_confidence ?? 0,
    clinicalAssessment: d.clinical_assessment ?? null,
    notes: d.notes ?? [],
    scannedAt: d.scanned_at ?? new Date().toISOString(),
    scannedAtFormatted: d.scanned_at_formatted ?? '',
    rawText: d.raw_text ?? '',
  };
}


// ─── Authentication API Calls ────────────────────────────────────────────────

export async function registerUser({ fullName, email, password }) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: fullName,
      email,
      password,
      accept_terms: true,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || 'Pendaftaran gagal.');
  }

  if (data.user?.token) {
    setAuthToken(data.user.token);
    setStoredUser(data.user);
  }
  return data.user;
}

export async function loginUser({ email, password }) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || 'Login gagal.');
  }

  if (data.user?.token) {
    setAuthToken(data.user.token);
    setStoredUser(data.user);
  }
  return data.user;
}

export async function fetchCurrentUser() {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) {
      if (res.status === 401) clearAuthSession();
      return null;
    }
    const user = await res.json();
    setStoredUser(user);
    return user;
  } catch {
    return getStoredUser();
  }
}

export async function updateMedicalProfile(profileData) {
  const res = await fetch(`${API_BASE}/auth/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(profileData),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || 'Gagal memperbarui profil medis.');
  }

  // Update stored user cached profile
  const cur = getStoredUser();
  if (cur) {
    cur.medical_profile = data.medical_profile;
    setStoredUser(cur);
  }
  return data.medical_profile;
}

export async function requestPasswordReset(email) {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return await res.json();
}

export async function confirmPasswordReset(resetToken, newPassword) {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reset_token: resetToken, new_password: newPassword }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || 'Gagal mengatur ulang kata sandi.');
  }
  return data;
}

// ─── Single-Packaging Image Scanner API Call ────────────────────────────────

export async function scanMedicineImage(imageBlob, patientProfile = null) {
  if (!imageBlob) throw new Error('Silakan pilih 1 foto kemasan obat.');

  const formData = new FormData();
  formData.append('file', imageBlob, 'scan_packaging.jpg');

  if (patientProfile) {
    formData.append('patient_profile_json', JSON.stringify(patientProfile));
  }

  let response;
  try {
    response = await fetch(`${API_BASE}/scan-medicine`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });
  } catch (netErr) {
    throw new Error(`Tidak dapat terhubung ke server backend di ${API_BASE}. Pastikan server aktif.`);
  }

  if (!response.ok) {
    let errText = 'Terjadi kesalahan saat memproses pemindaian.';
    try {
      const errJson = await response.json();
      errText = errJson.detail || errJson.message || errText;
    } catch {
      errText = await response.text().catch(() => errText);
    }
    throw new Error(`Server Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return normalizeResult(data);
}

// Compatibility alias taking single or array input
export async function scanMedicineImages(images = [], patientProfile = null) {
  const targetBlob = Array.isArray(images) ? images[0] : images;
  return scanMedicineImage(targetBlob, patientProfile);
}

export async function searchMedicines(query = '') {
  try {
    const res = await fetch(`${API_BASE}/medicines?q=${encodeURIComponent(query)}`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return { total: 0, medicines: [] };
    return await res.json();
  } catch {
    return { total: 0, medicines: [] };
  }
}

export async function checkDrugInteractions(drugs = []) {
  const res = await fetch(`${API_BASE}/interactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ drugs }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.message || 'Gagal memeriksa interaksi obat.');
  }
  return data;
}


// ─── History & Stats ────────────────────────────────────────────────────────

export async function fetchHistory() {
  let response;
  try {
    response = await fetch(`${API_BASE}/history`, {
      headers: getAuthHeaders(),
      cache: 'no-store',
    });
  } catch (netErr) {
    throw new Error(`Gagal memuat riwayat: ${netErr.message}`);
  }

  if (!response.ok) {
    throw new Error(`Gagal memuat riwayat: HTTP ${response.status}`);
  }

  const data = await response.json();
  const rawList = Array.isArray(data) ? data : data.items ?? [];
  const items = rawList.map(normalizeResult);

  return {
    total: data.total ?? items.length,
    safe: data.safe ?? items.filter((i) => i.status === 'green').length,
    warning: data.warning ?? items.filter((i) => i.status === 'yellow').length,
    danger: data.danger ?? items.filter((i) => i.status === 'red' || i.status === 'gray').length,
    items,
  };
}

export async function fetchStats() {
  try {
    const res = await fetch(`${API_BASE}/stats`, { headers: getAuthHeaders(), cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function deleteHistoryItem(scanId) {
  try {
    const res = await fetch(`${API_BASE}/history/${encodeURIComponent(scanId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function clearAllHistory() {
  try {
    const res = await fetch(`${API_BASE}/history`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}