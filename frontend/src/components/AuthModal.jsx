/**
 * src/components/AuthModal.jsx
 * PharmaShield — Authentication Flow (Sign In, Sign Up, Password Recovery).
 */
'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/AuthContext';
import { requestPasswordReset } from '@/lib/api';

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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
        if (onSuccess) onSuccess('login');
        onClose();
      } else if (mode === 'register') {
        if (password !== passwordConfirm) {
          throw new Error('Konfirmasi kata sandi tidak cocok.');
        }
        if (!acceptTerms) {
          throw new Error('Anda harus menyetujui syarat & kebijakan privasi.');
        }
        await register(fullName, email, password);
        if (onSuccess) onSuccess('register');
        onClose();
      } else if (mode === 'forgot') {
        const res = await requestPasswordReset(email);
        setSuccessMsg(res.message || 'Tautan pemulihan akun telah diproses.');
      }
    } catch (err) {
      setError(err.message || 'Terjadi kesalahan autentikasi.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md my-auto max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-[var(--color-border)] bg-white dark:bg-[#11141b] p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#0284c7] dark:bg-[#c8f93a] animate-pulse" />
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              {mode === 'login' && 'Masuk ke MedikaGuard ID'}
              {mode === 'register' && 'Daftar Akun Baru'}
              {mode === 'forgot' && 'Pemulihan Kata Sandi'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-lg"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 p-3 text-xs text-rose-800 dark:text-rose-300">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {mode === 'register' && (
            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-neutral-300">Nama Lengkap</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Dr. Andi Pratama"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161922] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284c7] dark:focus:border-[#c8f93a] placeholder-slate-400"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="font-bold text-slate-700 dark:text-neutral-300">Alamat Email</label>
            <input
              type="email"
              required
     
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161922] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284c7] dark:focus:border-[#c8f93a] placeholder-slate-400"
            />
          </div>

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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161922] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284c7] dark:focus:border-[#c8f93a] placeholder-slate-400"
              />
            </div>
          )}

          {mode === 'register' && (
            <>
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-neutral-300">Konfirmasi Kata Sandi</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Ulangi kata sandi"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161922] text-slate-900 dark:text-white focus:outline-none focus:border-[#0284c7] dark:focus:border-[#c8f93a] placeholder-slate-400"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1 text-slate-500 dark:text-neutral-400 text-[11px]">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="rounded border-slate-300 dark:border-white/20 text-[#0284c7] dark:text-[#c8f93a] focus:ring-0"
                />
                <span>Saya menyetujui Kebijakan Privasi &amp; Syarat Layanan Medis.</span>
              </label>
            </>
          )}

          {mode === 'login' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setMode('forgot')}
                className="text-[11px] text-[#0284c7] dark:text-[#c8f93a] hover:underline"
              >
                Lupa kata sandi?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-[#0284c7] dark:bg-[#c8f93a] text-white dark:text-black font-black hover:bg-[#0369a1] dark:hover:bg-[#b5f524] transition-all disabled:opacity-50 mt-2"
          >
            {loading ? 'Memproses...' : mode === 'login' ? 'Masuk' : mode === 'register' ? 'Daftar Akun' : 'Kirim Pemulihan'}
          </button>
        </form>

        <div className="border-t border-slate-200 dark:border-white/5 pt-3 text-center text-xs text-slate-500 dark:text-neutral-400">
          {mode === 'login' && (
            <p>
              Belum memiliki akun?{' '}
              <button
                type="button"
                onClick={() => setMode('register')}
                className="text-[#0284c7] dark:text-[#c8f93a] font-bold hover:underline"
              >
                Daftar Sekarang
              </button>
            </p>
          )}
          {mode === 'register' && (
            <p>
              Sudah memiliki akun?{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-[#0284c7] dark:text-[#c8f93a] font-bold hover:underline"
              >
                Masuk di Sini
              </button>
            </p>
          )}
          {mode === 'forgot' && (
            <p>
              Kembali ke{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-[#0284c7] dark:text-[#c8f93a] font-bold hover:underline"
              >
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
