/**
 * src/lib/aiApi.js
 * PharmaShield — AI Vision Scanner & Chatbot API client.
 */

import { API_BASE } from './api';

const AI_BASE = `${API_BASE}/ai`;

/**
 * Check if AI features (Gemini API key) are configured.
 * @returns {Promise<{ai_enabled: boolean, message: string}>}
 */
export async function checkAiStatus() {
  try {
    const res = await fetch(`${AI_BASE}/status`, { cache: 'no-store' });
    if (!res.ok) return { ai_enabled: false, message: 'Backend tidak merespons.' };
    return await res.json();
  } catch {
    return { ai_enabled: false, message: 'Tidak dapat menghubungi server AI.' };
  }
}

/**
 * POST /api/ai/scan-vision
 * Analyze medicine packaging photo with Gemini Vision AI.
 *
 * @param {Blob} imageBlob
 * @returns {Promise<{detection_status: string, data: object|null, error_message: string|null}>}
 */
export async function aiScanMedicine(imageBlob) {
  const formData = new FormData();
  formData.append('file', imageBlob, 'scan.jpg');

  let response;
  try {
    response = await fetch(`${AI_BASE}/scan-vision`, {
      method: 'POST',
      body: formData,
    });
  } catch {
    throw new Error(`Tidak dapat menghubungi AI server di ${AI_BASE}. Pastikan backend aktif.`);
  }

  if (!response.ok) {
    let errMsg = `Server Error (${response.status})`;
    try {
      const j = await response.json();
      errMsg = j.detail || j.error_message || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  return await response.json();
}

/**
 * POST /api/ai/chat
 * Send a user message to the AI chatbot with optional scan context.
 *
 * @param {string} message
 * @param {object|null} scanContext - Last scan result data
 * @param {Array}  conversationHistory - Previous turns [{role, content}]
 * @returns {Promise<{success: boolean, reply: string}>}
 */
export async function aiChat(message, scanContext = null, conversationHistory = []) {
  let response;
  try {
    response = await fetch(`${AI_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        scan_context: scanContext,
        conversation_history: conversationHistory,
      }),
    });
  } catch {
    throw new Error('Tidak dapat menghubungi AI Chatbot. Periksa koneksi dan pastikan backend aktif.');
  }

  if (!response.ok) {
    let errMsg = `Chatbot Error (${response.status})`;
    try {
      const j = await response.json();
      errMsg = j.detail || errMsg;
    } catch {}
    throw new Error(errMsg);
  }

  return await response.json();
}
