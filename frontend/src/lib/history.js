/**
 * src/lib/history.js
 * PharmaShield — LocalStorage-based scan history utilities.
 * Stores up to MAX_ENTRIES entries; keyed by STORAGE_KEY.
 */

const STORAGE_KEY = 'pharmashield:history';
const MAX_ENTRIES = 50;

/** @returns {object[]} */
export function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Prepend a new result entry to history and persist.
 * @param {object} result - NormalisedResult from api.js
 * @returns {object} - The persisted entry (with id + scannedAt)
 */
export function addHistory(result) {
  const entry = {
    ...result,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    scannedAt: new Date().toISOString(),
  };
  try {
    const updated = [entry, ...getHistory()].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Storage quota exceeded — fail silently
  }
  return entry;
}

/**
 * Remove a single history entry by id.
 * @param {string} id
 * @returns {object[]} Updated history list
 */
export function removeHistory(id) {
  const updated = getHistory().filter((h) => h.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
  return updated;
}

/** Remove all history entries. */
export function clearHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  return [];
}
