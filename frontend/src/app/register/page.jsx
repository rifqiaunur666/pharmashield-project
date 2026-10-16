/**
 * src/app/register/page.jsx
 * PharmaShield — Dedicated User Registration / Sign Up Page.
 */
'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

function RegisterForm() {
  const router = useRouter();
  const { register, isAuthenticated, loading: authLoading } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Real-time password criteria
  const isMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const isMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, authLoading, router]);

  const validateFrontend = () => {
    if (!fullName.trim()) {
      return 'Nama Lengkap wajib diisi.';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return 'Format email tidak valid (contoh: user@domain.com).';
    }

    if (password.length < 8) {
      return 'Password minimal 8 karakter.';
    }

    if (!(/[a-zA-Z]/.test(password) && /\d/.test(password))) {
      return 'Password harus mengandung kombinasi huruf dan angka.';
    }

    if (password !== confirmPassword) {
      return 'Password dan Konfirmasi Password tidak cocok.';
    }

    if (!acceptTerms) {
      return 'Anda harus menyetujui syarat & ketentuan layanan.';
    }

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    const validationError = validateFrontend();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setSubmitting(true);
    try {
      await register({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        confirmPassword,
        autoLogin: false,
      });

      // Redirect to login page with success notification query
      router.push('/login?registered=1');
    } catch (err) {
      setErrorMessage(err.message || 'Pendaftaran gagal.');
    } finally {
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
            Pendaftaran Akun Baru
          </h1>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-neutral-400">
            Daftar sekali untuk mengamankan riwayat & profil keselamatan konsumsi obat
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-[#121620] border border-slate-200 dark:border-white/10 rounded-2xl p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-5">
          {/* Error Alert */}
          {errorMessage && (
            <div className="rounded-xl border border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 p-3.5 flex items-start gap-2.5 animate-shake">
              <span className="text-rose-600 dark:text-rose-400 text-base">⚠</span>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-rose-800 dark:text-rose-300 leading-relaxed">
                  {errorMessage}
                </p>
                {errorMessage.includes('Email sudah terdaftar') && (
                  <Link
                    href="/login"
                    className="inline-block text-[11px] font-bold text-rose-700 dark:text-rose-200 underline mt-1 hover:text-rose-900"
                  >
                    Buka Halaman Login →
                  </Link>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300">
                Nama Lengkap
              </label>
              <input
                type="text"
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="cth: Ahmad Dahlan"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161b26] text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-slate-400"
              />
            </div>

            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300">
                Alamat Email <span className="text-slate-400 font-normal">(Wajib unik)</span>
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 8 karakter kombinasi huruf & angka"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161b26] text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-slate-400"
              />
            </div>

            {/* Password Confirmation Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300">
                Konfirmasi Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ketik ulang password Anda"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 transition-all placeholder:text-slate-400 bg-slate-50 dark:bg-[#161b26] text-slate-900 dark:text-white ${
                  confirmPassword && !isMatch
                    ? 'border-rose-400 focus:ring-rose-400'
                    : confirmPassword && isMatch
                    ? 'border-emerald-500 focus:ring-emerald-500'
                    : 'border-slate-200 dark:border-white/10 focus:ring-emerald-500'
                }`}
              />
            </div>

            {/* Real-time Checklist */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#161b26] border border-slate-200/80 dark:border-white/5 space-y-1.5 text-[11px]">
              <span className="font-bold text-slate-700 dark:text-neutral-300 block mb-1">
                Kriteria Keamanan Password:
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <span className={`flex items-center gap-1.5 ${isMinLength ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                  {isMinLength ? '✓' : '○'} Minimal 8 karakter
                </span>
                <span className={`flex items-center gap-1.5 ${hasLetter ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                  {hasLetter ? '✓' : '○'} Mengandung huruf
                </span>
                <span className={`flex items-center gap-1.5 ${hasNumber ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                  {hasNumber ? '✓' : '○'} Mengandung angka
                </span>
                <span className={`flex items-center gap-1.5 ${isMatch ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                  {isMatch ? '✓' : '○'} Password cocok
                </span>
              </div>
            </div>

            {/* Terms Checkbox */}
            <label className="flex items-start gap-2.5 cursor-pointer pt-1 text-slate-600 dark:text-neutral-400 text-xs select-none">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 dark:border-white/20 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                Saya menyetujui{' '}
                <span className="font-semibold text-slate-900 dark:text-white">Syarat &amp; Kebijakan Privasi</span>{' '}
                layanan MedikaGuard ID.
              </span>
            </label>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs tracking-wide shadow-lg shadow-emerald-600/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Mendaftarkan Akun...</span>
                </>
              ) : (
                <span>Daftar Akun Sekarang</span>
              )}
            </button>
          </form>

          {/* Footer Link to Login */}
          <div className="pt-4 border-t border-slate-100 dark:border-white/5 text-center text-xs text-slate-500 dark:text-neutral-400">
            Sudah memiliki akun?{' '}
            <Link
              href="/login"
              className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
            >
              Masuk di Sini →
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

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><span className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <RegisterForm />
    </Suspense>
  );
}
