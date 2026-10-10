/**
 * src/lib/api.js
 * PharmaShield — Frontend API integration client.
 * Prepend /api/... cleanly to NEXT_PUBLIC_API_URL (http://127.0.0.1:8000).
 */

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');

export const API_BASE = `${BASE_URL}/api`;

const toList = (v) => (Array.isArray(v) ? v : v ? [String(v)] : []);

/**
 * Normalizes backend response into standard frontend shape.
 * @param {object} raw - Backend response object
 */
export function normalizeResult(raw = {}) {
  const d = raw.data ?? raw;

  const id = d.scan_id ?? d.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const name = d.name ?? d.medicine_name ?? d.nama_obat ?? null;

  const expiryDate = d.expiry_date ?? d.expired_date ?? d.tanggal_kedaluwarsa ?? null;
  const mfgDate = d.mfg_date ?? d.tanggal_produksi ?? null;

  let expired = d.is_expired ?? d.expired;
  if (expired == null && expiryDate) {
    const t = Date.parse(expiryDate);
    if (!Number.isNaN(t)) expired = t < Date.now();
  }

  // Status mapping
  const STATUS_ALIAS = {
    hijau: 'green',
    kuning: 'yellow',
    merah: 'red',
    aman: 'green',
    peringatan: 'yellow',
    bahaya: 'red',
    danger: 'red',
  };
  let status = String(d.status ?? d.safety_status ?? '').toLowerCase();
  status = STATUS_ALIAS[status] ?? status;
  if (!['green', 'yellow', 'red'].includes(status)) {
    status = expired ? 'red' : 'yellow';
  }

  const identified = d.identified ?? Boolean(name && name !== 'Kemasan Tidak Teridentifikasi');

  const statusId = d.status_id ?? (status === 'green' ? 'Aman' : status === 'yellow' ? 'Peringatan' : 'Bahaya');
  const statusEmoji = d.status_emoji ?? (status === 'green' ? '🟢' : status === 'yellow' ? '🟡' : '🔴');

  return {
    id,
    scan_id: id,
    identified: Boolean(identified),
    name: name || (identified ? 'Obat Terdeteksi' : 'Kemasan Tidak Teridentifikasi'),
    purpose: d.function ?? d.purpose ?? d.fungsi ?? '',
    ingredients: toList(d.ingredients ?? d.kandungan),
    usage: d.usage ?? d.dosage ?? d.aturan_penggunaan ?? '',
    sideEffects: toList(d.side_effects ?? d.efek_samping),
    warnings: toList(d.warnings ?? d.warning ?? d.peringatan),
    expiryDate,
    mfgDate,
    expired: Boolean(expired),
    daysRemaining: d.days_remaining ?? 0,
    status,
    statusId,
    statusEmoji,
    shelfLifeNote: d.shelf_life_note ?? '',
    recommendation: d.recommendation ?? '',
    ocrConfidence: d.ocr_confidence ?? 0,
    scannedAt: d.scanned_at ?? new Date().toISOString(),
    scannedAtFormatted: d.scanned_at_formatted ?? '',
    rawText: d.raw_text ?? '',
  };
}

/**
 * POST /api/scan-medicine
 * Upload JPEG image blob to backend OCR + safety evaluation pipeline.
 *
 * @param {Blob} imageBlob
 * @returns {Promise<ReturnType<typeof normalizeResult>>}
 */
export async function scanMedicineImage(imageBlob) {
  const formData = new FormData();
  formData.append('file', imageBlob, 'scan.jpg');

  let response;
  try {
    response = await fetch(`${API_BASE}/scan-medicine`, {
      method: 'POST',
      body: formData,
    });
  } catch (netErr) {
    throw new Error(
      `Tidak dapat terhubung ke server backend di ${API_BASE}. Pastikan server FastAPI aktif di port 8000.`
    );
  }

  if (!response.ok) {
    let errText = 'Terjadi kesalahan saat memproses gambar.';
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

/**
 * GET /api/history
 * Fetch scan history and metric counts from server.
 *
 * @returns {Promise<{ total: number, safe: number, warning: number, danger: number, items: any[] }>}
 */
export async function fetchHistory() {
  let response;
  try {
    response = await fetch(`${API_BASE}/history`, {
      cache: 'no-store',
    });
  } catch (netErr) {
    throw new Error(
      `Tidak dapat mengambil data riwayat dari backend (${API_BASE}/history).`
    );
  }

  if (!response.ok) {
    throw new Error(`Gagal memuat riwayat: HTTP ${response.status}`);
  }

  const data = await response.json();
  const rawList = Array.isArray(data) ? data : data.items ?? [];
  const items = rawList.map(normalizeResult);

  const total = data.total ?? items.length;
  const safe = data.safe ?? items.filter((i) => i.status === 'green').length;
  const warning = data.warning ?? items.filter((i) => i.status === 'yellow').length;
  const danger = data.danger ?? data.expired ?? items.filter((i) => i.status === 'red').length;

  return {
    total,
    safe,
    warning,
    danger,
    items,
  };
}

/**
 * GET /api/stats
 * Quick dashboard statistics.
 */
export async function fetchStats() {
  try {
    const response = await fetch(`${API_BASE}/stats`, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * DELETE /api/history/{scanId}
 * Remove individual scan record.
 */
export async function deleteHistoryItem(scanId) {
  try {
    const response = await fetch(`${API_BASE}/history/${encodeURIComponent(scanId)}`, {
      method: 'DELETE',
    });
    return response.ok;
  } catch (err) {
    console.error('Delete item failed:', err);
    return false;
  }
}

/**
 * DELETE /api/history
 * Remove all scan records.
 */
export async function clearAllHistory() {
  try {
    const response = await fetch(`${API_BASE}/history`, {
      method: 'DELETE',
    });
    return response.ok;
  } catch (err) {
    console.error('Clear history failed:', err);
    return false;
  }
}