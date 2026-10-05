/**
 * src/lib/voiceService.js
 * PharmaShield — Web Speech API wrapper for Indonesian (id-ID) TTS.
 */

/**
 * Build the full TTS script from a normalised medicine result.
 * @param {import('./api').NormalisedResult} result
 * @returns {string}
 */
export function buildSpeechText(result) {
  const STATUS_LABELS = {
    green:  'Aman untuk digunakan',
    yellow: 'Harap berhati-hati, baca petunjuk dengan seksama',
    red:    'Berbahaya atau sudah kedaluwarsa, jangan digunakan',
  };

  const parts = [
    result.name && `Informasi obat ${result.name}.`,
    result.purpose && `Fungsi: ${result.purpose}.`,
    result.usage && `Aturan penggunaan: ${result.usage}.`,
    result.ingredients?.length && `Kandungan: ${result.ingredients.join(', ')}.`,
    result.sideEffects?.length && `Efek samping: ${result.sideEffects.join('. ')}.`,
    result.warnings?.length && `Peringatan: ${result.warnings.join('. ')}.`,
    result.expiryDate &&
      (result.expired
        ? `Obat ini sudah kedaluwarsa. Jangan digunakan.`
        : `Berlaku hingga ${result.expiryDate}.`),
    result.status && `Status keamanan: ${STATUS_LABELS[result.status] ?? result.status}.`,
  ].filter(Boolean);

  return parts.join(' ');
}

/**
 * Speak the given text in Indonesian using the Web Speech API.
 * Returns a cleanup function that cancels speech.
 *
 * @param {string}   text
 * @param {object}  [options]
 * @param {number}  [options.rate=0.92]    - Speech rate (0.1–10)
 * @param {number}  [options.pitch=1]      - Voice pitch (0–2)
 * @param {()=>void} [options.onEnd]       - Called when speech ends naturally
 * @returns {()=>void} cancel function
 */
export function speak(text, { rate = 0.92, pitch = 1, onEnd } = {}) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  if (!synth) return () => {};

  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'id-ID';
  utterance.rate = rate;
  utterance.pitch = pitch;

  if (onEnd) utterance.onend = onEnd;

  synth.speak(utterance);

  return () => synth.cancel();
}

/** Cancel any ongoing speech. */
export function cancelSpeech() {
  if (typeof window !== 'undefined') {
    window.speechSynthesis?.cancel();
  }
}
