/**
 * src/app/login/page.jsx
 * PharmaShield — Dedicated User Login / Sign In Page (Instant, Seamless & Zero Delay).
 */
'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

function LoginForm() {
  const searchParams = useSearchParams();
  const { login, isAuthenticated, loading: authLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  // Check if redirected after registration
  useEffect(() => {
    if (searchParams.get('registered') === '1') {
      setToastMessage('Pendaftaran berhasil! Silakan login.');
    }
  }, [searchParams]);

  // If already authenticated on landing, redirect immediately to target without delay
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      const redirectTarget = searchParams.get('redirect') || '/';
      window.location.href = redirectTarget;
    }
  }, [isAuthenticated, authLoading, searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setToastMessage('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMessage('Email dan password wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const loggedUser = await login(trimmedEmail, password);
      if (loggedUser) {
        setLoginSuccess(true);
        const redirectTarget = searchParams.get('redirect') || '/';
        // Direct browser navigation ensures 100% reliable, instant transition with zero router lag
        window.location.href = redirectTarget;
        return;
      }
    } catch (err) {
      setErrorMessage(err.message || 'Email atau password salah.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 bg-slate-50 dark:bg-[#0b0f17] text-slate-800 dark:text-neutral-200">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-sky-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <span className="text-2xl">🛡️</span>
            </div>
            <div className="text-left">
              <span className="text-xl font-black tracking-tight text-slate-900 dark:text-white block leading-tight">
                MedikaGuard <span className="text-emerald-600 dark:text-emerald-400">ID</span>
              </span>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-neutral-400 block tracking-wider uppercase">
                AI Drug Safety Platform
              </span>
            </div>
          </Link>
          <h1 className="mt-6 text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Masuk ke Akun Anda
          </h1>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-neutral-400">
            Akses dashboard pemantauan obat & skrining keselamatan Anda
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-[#121620] border border-slate-200 dark:border-white/10 rounded-2xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-6">
          {/* Success Toast */}
          {toastMessage && (
            <div className="rounded-xl border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3.5 flex items-start gap-2.5 animate-fade-in">
              <span className="text-emerald-600 dark:text-emerald-400 text-base font-bold">✓</span>
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 leading-relaxed">
                {toastMessage}
              </p>
            </div>
          )}

          {/* Error Alert */}
          {errorMessage && (
            <div className="rounded-xl border border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 p-3.5 flex items-start gap-2.5 animate-shake">
              <span className="text-rose-600 dark:text-rose-400 text-base font-bold">⚠</span>
              <p className="text-xs font-semibold text-rose-800 dark:text-rose-300 leading-relaxed">
                {errorMessage}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300">
                Alamat Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@domain.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161b26] text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-slate-400"
              />
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  {showPassword ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi Anda"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161b26] text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-slate-400"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs tracking-wide shadow-lg shadow-emerald-600/25 transition-all disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {loginSuccess ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Berhasil Masuk! Mengalihkan ke Dashboard...</span>
                </>
              ) : submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Memverifikasi Kredensial...</span>
                </>
              ) : (
                <span>Masuk Sekarang</span>
              )}
            </button>
          </form>

          {/* Footer Link to Register */}
          <div className="pt-4 border-t border-slate-100 dark:border-white/5 text-center text-xs text-slate-500 dark:text-neutral-400">
            Belum memiliki akun?{' '}
            <Link
              href="/register"
              className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
            >
              Daftar di Sini →
            </Link>
          </div>
        </div>

        {/* Back Link */}
        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-xs text-slate-500 dark:text-neutral-500 hover:text-slate-800 dark:hover:text-neutral-300 transition-colors"
          >
            ← Kembali ke Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><span className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
