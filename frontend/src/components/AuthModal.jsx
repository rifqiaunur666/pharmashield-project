/**
 * src/components/AuthModal.jsx
 * PharmaShield — Authentication Flow (Sign In, Sign Up, Password Recovery).
 * - Frontend validation: email format, min 8-char alphanumeric password, confirm match
 * - Post-login: window.location.href (avoids Next.js RSC cookie race condition)
 * - Duplicate email: shows "Email sudah terdaftar. Silakan login."
 */
'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/AuthContext';
import { requestPasswordReset } from '@/lib/api';

// ─── Validation helpers ───────────────────────────────────────────────────────
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validatePassword(password) {
  if (password.length < 8) return 'Password minimal 8 karakter.';
  if (!/[A-Za-z]/.test(password)) return 'Password harus mengandung huruf dan angka.';
  if (!/\d/.test(password)) return 'Password harus mengandung huruf dan angka.';
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AuthModal({ isOpen, onClose, initialMode = 'login', onSuccess }) {
  const [mounted, setMounted] = useState(false);
  const { login, register } = useAuth();
  const [mode, setMode] = useState(initialMode); // 'login' | 'register' | 'forgot'
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Reset state when modal opens
      setError(null);
      setSuccessMsg(null);
      setLoading(false);
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Reset form when switching modes
  const switchMode = (newMode) => {
    setMode(newMode);
    setError(null);
    setSuccessMsg(null);
    setPassword('');
    setPasswordConfirm('');
  };

  if (!isOpen || !mounted) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // ── Frontend validation ──────────────────────────────────────────────────
    if (!validateEmail(email)) {
      setError('Format email tidak valid (contoh: user@domain.com).');
      return;
    }

    if (mode === 'register') {
      const pwdErr = validatePassword(password);
      if (pwdErr) { setError(pwdErr); return; }
      if (password !== passwordConfirm) {
        setError('Konfirmasi kata sandi tidak cocok.');
        return;
      }
      if (!acceptTerms) {
        setError('Anda harus menyetujui syarat & kebijakan privasi.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        if (onSuccess) onSuccess('login');
        onClose();
        // Use hard navigation to avoid Next.js middleware cookie race condition
        window.location.href = '/';

      } else if (mode === 'register') {
        await register(fullName, email, password);
        if (onSuccess) onSuccess('register');
        onClose();
        // Redirect to dashboard after successful registration
        window.location.href = '/';

      } else if (mode === 'forgot') {
        const res = await requestPasswordReset(email);
        setSuccessMsg(res.message || 'Tautan pemulihan akun telah diproses. Cek email Anda.');
      }
    } catch (err) {
      // Surface backend error messages directly (already user-friendly)
      setError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-md my-auto max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-[var(--color-border)] bg-white dark:bg-[#11141b] p-6 shadow-2xl space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#0284c7] dark:bg-[#10b981] animate-pulse" />
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              {mode === 'login' && 'Masuk ke MedikaGuard ID'}
              {mode === 'register' && 'Daftar Akun Baru'}
              {mode === 'forgot' && 'Pemulihan Kata Sandi'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-lg"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 p-3 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
            <span className="mt-0.5">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Success banner */}
        {successMsg && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
            <span className="mt-0.5">✅</span>
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs" noValidate>

          {/* Full Name — Register only */}
          {mode === 'register' && (
            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-neutral-300">Nama Lengkap</label>
              <input
                type="text"
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nama Lengkap Anda"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161922] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284c7] dark:focus:border-[#10b981] placeholder-slate-400"
              />
            </div>
          )}

          {/* Email */}
          <div className="space-y-1">
            <label className="font-bold text-slate-700 dark:text-neutral-300">Alamat Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161922] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284c7] dark:focus:border-[#10b981] placeholder-slate-400"
            />
          </div>

          {/* Password */}
          {mode !== 'forgot' && (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="font-bold text-slate-700 dark:text-neutral-300">Kata Sandi</label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[10px] text-slate-500 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-neutral-200"
                >
                  {showPassword ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Min. 8 karakter (huruf & angka)' : 'Masukkan kata sandi'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161922] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284c7] dark:focus:border-[#10b981] placeholder-slate-400"
              />
            </div>
          )}

          {/* Confirm Password + Terms — Register only */}
          {mode === 'register' && (
            <>
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-neutral-300">Konfirmasi Kata Sandi</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Ulangi kata sandi"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161922] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284c7] dark:focus:border-[#10b981] placeholder-slate-400"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-1 text-slate-500 dark:text-neutral-400 text-[11px]">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="rounded border-slate-300 dark:border-white/20 text-[#0284c7] dark:text-[#10b981] focus:ring-0"
                />
                <span>Saya menyetujui Kebijakan Privasi &amp; Syarat Layanan Medis.</span>
              </label>
            </>
          )}

          {/* Forgot password link — Login only */}
          {mode === 'login' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-[11px] text-[#0284c7] dark:text-[#10b981] hover:underline"
              >
                Lupa kata sandi?
              </button>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-[#0284c7] dark:bg-[#10b981] text-white dark:text-[#0f172a] font-black hover:bg-[#0369a1] dark:hover:bg-[#059669] transition-all disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
          >
            {loading && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {loading
              ? 'Memproses...'
              : mode === 'login'
              ? 'Masuk'
              : mode === 'register'
              ? 'Daftar Akun'
              : 'Kirim Pemulihan'}
          </button>
        </form>

        {/* Footer links */}
        <div className="border-t border-slate-200 dark:border-white/5 pt-3 text-center text-xs text-slate-500 dark:text-neutral-400">
          {mode === 'login' && (
            <p>
              Belum memiliki akun?{' '}
              <button type="button" onClick={() => switchMode('register')} className="text-[#0284c7] dark:text-[#10b981] font-bold hover:underline">
                Daftar Sekarang
              </button>
            </p>
          )}
          {mode === 'register' && (
            <p>
              Sudah memiliki akun?{' '}
              <button type="button" onClick={() => switchMode('login')} className="text-[#0284c7] dark:text-[#10b981] font-bold hover:underline">
                Masuk di Sini
              </button>
            </p>
          )}
          {mode === 'forgot' && (
            <p>
              Kembali ke{' '}
              <button type="button" onClick={() => switchMode('login')} className="text-[#0284c7] dark:text-[#10b981] font-bold hover:underline">
                Halaman Masuk
              </button>
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
