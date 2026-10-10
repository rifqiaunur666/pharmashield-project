/**
 * src/lib/voiceService.js
 * PharmaShield — Web Speech API wrapper for Indonesian (id-ID) TTS.
 * Bersih dari narasi kedaluwarsa. Membaca nama obat, indikasi, dosis, dan petunjuk pemakaian.
 */

/**
 * Builds spoken script in Indonesian from the evaluation result.
 * @param {object} result - Normalized scan result
 * @returns {string}
 */
export function buildSpeechText(result) {
  if (!result) return '';

  const statusVoiceovers = {
    green: 'Status: Aman. Obat aman dikonsumsi sesuai petunjuk dan indikasi.',
    yellow: 'Status: Perhatian. Harap perhatikan petunjuk dosis atau konsultasikan dengan apoteker.',
    red: 'Status: Peringatan. Informasi kemasan tidak terbaca jelas atau terdapat kontraindikasi khusus.',
  };

  const statusText = statusVoiceovers[result.status] || (
    result.statusId ? `Status: ${result.statusId}.` : ''
  );

  const parts = [
    result.name ? `Hasil pemindaian obat: ${result.name}.` : 'Kemasan obat terdeteksi.',
    statusText,
    result.purpose ? `Indikasi: ${result.purpose}.` : null,
    result.recommendation ? `Rekomendasi: ${result.recommendation}.` : null,
    result.usage ? `Aturan pakai: ${result.usage}.` : null,
  ].filter(Boolean);

  return parts.join(' ');
}

/**
 * Speak the given text in Indonesian using the Web Speech API.
 * Returns a cancel function.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {number} [options.rate=0.92]
 * @param {number} [options.pitch=1]
 * @param {()=>void} [options.onEnd]
 * @returns {()=>void}
 */
export function speak(text, { rate = 0.92, pitch = 1, onEnd } = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return () => {};
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'id-ID';
  utterance.rate = rate;
  utterance.pitch = pitch;

  // Attempt to select an Indonesian voice if available
  const voices = synth.getVoices();
  const idVoice = voices.find((v) => v.lang.startsWith('id') || v.lang.includes('ID'));
  if (idVoice) {
    utterance.voice = idVoice;
  }

  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }

  synth.speak(utterance);
  return () => synth.cancel();
}

/** Cancel any active speech synthesis. */
export function cancelSpeech() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
