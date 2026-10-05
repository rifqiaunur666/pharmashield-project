/**
 * src/lib/api.js
 * PharmaShield — API helper functions for FastAPI backend.
 * Handles POST /api/scan-medicine & GET /api/history via NEXT_PUBLIC_API_URL.
 */

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '') + '/api';

// ─── Normaliser ──────────────────────────────────────────────────────────────

const toList = (v) => (Array.isArray(v) ? v : v ? [String(v)] : []);

/**
 * Normalises varying backend response shapes into a single consistent object.
 * Adjust field aliases here when the backend schema changes.
 *
 * @param {object} raw - Raw JSON from backend
 * @returns {NormalisedResult}
 *
 * @typedef {object} NormalisedResult
 * @property {boolean}      identified
 * @property {string|null}  name
 * @property {string}       purpose
 * @property {string[]}     ingredients
 * @property {string}       usage
 * @property {string[]}     sideEffects
 * @property {string[]}     warnings
 * @property {string|null}  expiryDate
 * @property {boolean}      expired
 * @property {'green'|'yellow'|'red'|null} status
 */
export function normalizeResult(raw = {}) {
  const d = raw.data ?? raw;

  // Name
  const name = d.name ?? d.medicine_name ?? d.nama_obat ?? null;

  // Expiry
  const expiryDate = d.expiry_date ?? d.expired_date ?? d.tanggal_kedaluwarsa ?? null;
  let expired = d.is_expired ?? d.expired;
  if (expired == null && expiryDate) {
    const t = Date.parse(expiryDate);
    if (!Number.isNaN(t)) expired = t < Date.now();
  }

  // Status — normalise Indonesian aliases → English keys
  const STATUS_ALIAS = { hijau: 'green', kuning: 'yellow', merah: 'red' };
  let status = String(d.status ?? d.safety_status ?? '').toLowerCase();
  status = STATUS_ALIAS[status] ?? status;
  if (!['green', 'yellow', 'red'].includes(status)) status = 'yellow';

  // If identified + expired → always red
  const identified = d.identified ?? d.is_identified ?? Boolean(name);
  if (identified && expired) status = 'red';

  return {
    identified: Boolean(identified),
    name,
    purpose:     d.function ?? d.purpose ?? d.fungsi ?? '',
    ingredients: toList(d.ingredients ?? d.kandungan),
    usage:       d.usage ?? d.dosage ?? d.aturan_penggunaan ?? '',
    sideEffects: toList(d.side_effects ?? d.efek_samping),
    warnings:    toList(d.warnings ?? d.warning ?? d.peringatan),
    expiryDate,
    expired:     Boolean(expired),
    status:      identified ? status : null,
  };
}

// ─── API Calls ────────────────────────────────────────────────────────────────

/**
 * POST /api/scan-medicine
 * Sends a JPEG blob captured from the camera to the backend OCR engine.
 *
 * @param {Blob} imageBlob - JPEG image blob from canvas.toBlob()
 * @returns {Promise<NormalisedResult>}
 */
export async function scanMedicineImage(imageBlob) {
  const formData = new FormData();
  formData.append('file', imageBlob, 'scan.jpg');

  const response = await fetch(`${API_BASE}/scan-medicine`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`Server error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return normalizeResult(data);
}

/**
 * GET /api/history
 * Fetches server-side scan history (if supported by backend).
 *
 * @returns {Promise<NormalisedResult[]>}
 */
export async function fetchHistory() {
  const response = await fetch(`${API_BASE}/history`, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Server error ${response.status}`);
  }

  const data = await response.json();
  const list = Array.isArray(data) ? data : data.data ?? data.items ?? [];
  return list.map(normalizeResult);
}