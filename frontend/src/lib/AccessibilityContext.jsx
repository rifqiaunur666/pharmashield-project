/**
 * src/lib/AccessibilityContext.jsx
 * PharmaShield — Accessibility Context & State Management.
 *
 * Manages 8 accessibility settings with localStorage persistence
 * and applies CSS classes/filters/attributes directly to <html> root.
 */
'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';

// ─── Defaults ────────────────────────────────────────────────────────────────
const DEFAULTS = {
  isLargeText:     false,
  isDyslexiaFont:  false,
  isPauseAnimation:false,
  isLargeCursor:   false,
  colorblindMode:  'none',    // 'none' | 'protanopia' | 'tritanopia' | 'low-vision'
  saturationMode:  'none',    // 'none' | 'low' | 'high' | 'grayscale'
};

const STORAGE_KEY = 'pharmashield-accessibility-v2';

// ─── Context ──────────────────────────────────────────────────────────────────
const AccessibilityCtx = createContext(null);
export function useAccessibility() { return useContext(AccessibilityCtx); }

// ─── Load from localStorage ───────────────────────────────────────────────────
function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      delete parsed.isInverted;
      delete parsed.isHighContrast;
      return { ...DEFAULTS, ...parsed };
    }
  } catch {}
  return { ...DEFAULTS };
}

// ─── Apply side-effects to <html> root ───────────────────────────────────────
function applyToRoot(prefs) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  const body = document.body;

  // Clean up legacy invert classes if present
  html.classList.remove('a11y-inverted', 'invert-mode');
  if (body) body.classList.remove('invert-mode');

  // --- 1. Large text ---
  html.classList.toggle('a11y-large-text', !!prefs.isLargeText);

  // --- 2. Dyslexia font ---
  html.classList.toggle('a11y-dyslexia', !!prefs.isDyslexiaFont);

  // --- 3. Pause animations ---
  html.classList.toggle('a11y-pause-animation', !!prefs.isPauseAnimation);

  // --- 4. Large cursor ---
  html.classList.toggle('a11y-large-cursor', !!prefs.isLargeCursor);

  // --- 5. Colorblind mode ---
  html.classList.remove('a11y-cb-protanopia', 'a11y-cb-tritanopia', 'a11y-cb-low-vision');
  if (prefs.colorblindMode && prefs.colorblindMode !== 'none') {
    html.classList.add(`a11y-cb-${prefs.colorblindMode}`);
    html.setAttribute('data-colorblind', prefs.colorblindMode);
    if (body) body.setAttribute('data-colorblind', prefs.colorblindMode);
  } else {
    html.removeAttribute('data-colorblind');
    if (body) body.removeAttribute('data-colorblind');
  }

  // --- 6. Saturation filter (applied via CSS var on body/root) ---
  const satMap = { none: '', low: 'saturate(0.45)', high: 'saturate(2.2)', grayscale: 'grayscale(1)' };
  const satFilter = satMap[prefs.saturationMode] || '';

  if (satFilter) {
    html.style.setProperty('--a11y-filter', satFilter);
  } else {
    html.style.removeProperty('--a11y-filter');
    if (body) body.style.removeProperty('filter');
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AccessibilityProvider({ children }) {
  const [prefs, setPrefs] = useState(DEFAULTS);
  const [modalOpen, setModalOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const saved = loadPrefs();
    setPrefs(saved);
    applyToRoot(saved);
    setHydrated(true);
  }, []);

  // Apply side-effects whenever prefs change (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    applyToRoot(prefs);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch {}
  }, [prefs, hydrated]);

  // ── Setter helpers ──────────────────────────────────────────────────────────
  const toggle = useCallback((key) => {
    setPrefs((p) => {
      const next = { ...p, [key]: !p[key] };
      applyToRoot(next);
      return next;
    });
  }, []);

  const set = useCallback((key, value) => {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      applyToRoot(next);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    const empty = { ...DEFAULTS };
    setPrefs(empty);
    applyToRoot(empty);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
    } catch {}
  }, []);

  // ── Active preset count (badge) ─────────────────────────────────────────────
  const activeCount = useMemo(() => {
    let n = 0;
    if (prefs.isLargeText)      n++;
    if (prefs.isDyslexiaFont)   n++;
    if (prefs.isPauseAnimation) n++;
    if (prefs.isLargeCursor)    n++;
    if (prefs.colorblindMode !== 'none') n++;
    if (prefs.saturationMode  !== 'none') n++;
    return n;
  }, [prefs]);

  const ctx = {
    prefs,
    toggle,
    set,
    resetAll,
    activeCount,
    modalOpen,
    openModal:  () => setModalOpen(true),
    closeModal: () => setModalOpen(false),
    toggleModal:() => setModalOpen((v) => !v),
  };

  return (
    <AccessibilityCtx.Provider value={ctx}>
      {children}
    </AccessibilityCtx.Provider>
  );
}
