/**
 * src/app/reminders/page.jsx
 * PharmaShield ID — Dynamic Reminder System & Healthcare Dashboard.
 * 
 * Fitur & Redesain:
 * 1. Full-Width Layout: Memenuhi kontainer utama tanpa double AdminShell margin bug.
 * 2. Mobile-First & Responsive Grid: Card metrik responsif (grid-cols-1 sm:grid-cols-2 lg:grid-cols-4)
 *    dan tabel Live Monitoring dengan horizontal scroll & mobile-friendly badges.
 * 3. Autentikasi Pengguna Tanpa Token API: Fitur Unggah & Pindai Gambar Kode QR Kontak WhatsApp
 *    (OCR / QR Decoder) untuk menautkan nomor/kontak pasien secara otomatis tanpa konfigurasi rumit.
 * 4. Alur 3-Tahap Notifikasi WhatsApp:
 *    - Tahap 1: Konfirmasi Jadwal Awal (Langsung saat input jadwal obat baru).
 *    - Tahap 2: Pra-Minum Obat (H-10 Menit sebelum jam minum).
 *    - Tahap 3: Eksekusi Waktu H (Interaktif dengan tombol [Ya, Sudah Minum] & [Belum]).
 * 5. Dynamic Rescheduling Engine: Penyesuaian jeda medis adaptif saat dosis tertunda.
 */
'use client';

import { useState, useEffect, useTransition, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  createReminderPatient,
  fetchReminderPatients,
  createReminderMedication,
  fetchReminderMedications,
  fetchReminderLogs,
  simulateReminderTick,
  simulateButtonInteraction,
  deleteReminderPatient,
  deleteReminderMedication,
  deleteReminderLog,
  clearAllRemindersData,
  testSendWhatsApp,
  fetchGatewayStatus,
  updateGatewayCredentials,
  fetchActivityLogs,
  scanWhatsAppQRCode,
  triggerReminderStage
} from '@/lib/api';

import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  UserPlus,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  QrCode,
  Phone,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Check,
  X,
  Send,
  Zap,
  Activity,
  User,
  Pill,
  Timer,
  Info,
  Copy,
  Key
} from 'lucide-react';

export default function RemindersPage() {
  const [patients, setPatients] = useState([]);
  const [medications, setMedications] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Modals
  const [mounted, setMounted] = useState(false);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [showMedModal, setShowMedModal] = useState(false);
  const [showQRScanModal, setShowQRScanModal] = useState(false);

  // Form states
  const [patientForm, setPatientForm] = useState({
    name: '',
    whatsapp_no: '628',
    qr_code_url: '',
    qr_contact_name: '',
  });

  const [medForm, setMedForm] = useState({
    patient_id: '',
    name: '',
    dosage: '',
    instructions: 'Sesudah makan',
    duration_days: 1,
    frequency: '1x1',
    schedule_type: 'FIXED_TIMES',
    interval_hours: 8,
    target_times_str: '08:00',
  });

  // QR Code Upload State
  const [qrFile, setQrFile] = useState(null);
  const [qrPreview, setQrPreview] = useState(null);
  const [qrScanning, setQrScanning] = useState(false);
  const [qrResult, setQrResult] = useState(null);
  const [qrError, setQrError] = useState('');
  const fileInputRef = useRef(null);

  const [phoneError, setPhoneError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('ALL'); // ALL, PENDING, DUE_0M, COMPLETED, DELAYED, RESCHEDULED
  const [timeHorizon, setTimeHorizon] = useState('TODAY'); // 'TODAY' (Jadwal Hari Ini) or 'ALL' (Semua Hari)
  const [activeViewTab, setActiveViewTab] = useState('SCHEDULES'); // 'SCHEDULES' or 'WEBHOOK_LOGS'

  // Modal Pengaturan Token Gateway WhatsApp
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState({
    meta_configured: false,
    fonnte_configured: false,
    device_phone: null,
    device_status: 'unknown',
    quota: null,
    is_connected: false,
  });
  const [tokenInput, setTokenInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [testSending, setTestSending] = useState(false);

  // Activity Logs
  const [activityLogs, setActivityLogs] = useState([]);

  // Load Data
  const loadData = async () => {
    try {
      setLoading(true);
      const [patRes, medRes, logRes, actRes, gwRes] = await Promise.all([
        fetchReminderPatients(),
        fetchReminderMedications(),
        fetchReminderLogs(),
        fetchActivityLogs().catch(() => ({ activities: [] })),
        fetchGatewayStatus().catch(() => null),
      ]);
      setPatients(patRes.patients || []);
      setMedications(medRes.medications || []);
      setLogs(logRes.logs || []);
      if (actRes?.activities) {
        setActivityLogs(actRes.activities);
      }
      if (gwRes) {
        setGatewayStatus({
          meta_configured: gwRes.meta_cloud_api?.configured || false,
          fonnte_configured: gwRes.fonnte_gateway?.configured || false,
          device_phone: gwRes.fonnte_gateway?.device_phone || null,
          device_status: gwRes.fonnte_gateway?.device_status || 'unknown',
          quota: gwRes.fonnte_gateway?.quota || null,
          is_connected: gwRes.fonnte_gateway?.status === 'connected',
        });
      }
    } catch (err) {
      console.error('Error fetching reminder data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToken = async (e) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setFeedback({ type: 'error', message: 'Silakan masukkan token Fonnte terlebih dahulu.' });
      return;
    }
    try {
      setSavingToken(true);
      const res = await updateGatewayCredentials({ fonnte_token: tokenInput.trim() });
      if (res.success) {
        setGatewayStatus((prev) => ({ ...prev, fonnte_configured: true }));
        setFeedback({
          type: 'success',
          message: 'Token WhatsApp berhasil disimpan! Bot sekarang aktif dan dapat mengirimkan pesan pengingat langsung ke WhatsApp Anda.',
        });
        setShowTokenModal(false);
        setTokenInput('');
        await loadData();
      } else {
        setFeedback({ type: 'error', message: res.message || 'Gagal menyimpan token.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setSavingToken(false);
    }
  };

  const handleTestSendWA = async (targetPhone = '6285374497583') => {
    try {
      setTestSending(true);
      const res = await testSendWhatsApp(
        targetPhone,
        `👋 *Halo dari Bot MedikaGuard!*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nIni adalah pesan uji coba bot pengingat obat.\nKoneksi WhatsApp Gateway Anda telah berhasil aktif dan terhubung secara otomatis ke HP Anda! 🌿`
      );
      if (res.success) {
        setFeedback({
          type: 'success',
          message: `Pesan uji coba berhasil dikirim langsung ke WhatsApp ${targetPhone}! Silakan cek aplikasi WhatsApp Anda.`,
        });
      } else {
        setFeedback({
          type: 'warning',
          message: `Gagal mengirim pesan: ${res.response?.detail || res.response?.message || 'Pastikan token Fonnte valid dan nomor WhatsApp pengirim aktif di dashboard Fonnte.'}`,
        });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setTestSending(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    loadData();
    const interval = setInterval(loadData, 5000); // 5s auto refresh for live activity
    return () => clearInterval(interval);
  }, []);

  // Lock body scroll when any modal is open
  useEffect(() => {
    const isAnyModalOpen = showQRScanModal || showPatientModal || showMedModal || showTokenModal;
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showQRScanModal, showPatientModal, showMedModal, showTokenModal]);

  // Validation
  const validateWhatsAppNumber = (num) => {
    if (!num) return '';
    const cleaned = num.replace(/\D/g, '');
    if (!cleaned.startsWith('62')) {
      return 'Nomor WhatsApp wajib menggunakan format internasional 62 (contoh: 6281234567890).';
    }
    if (cleaned.length < 10 || cleaned.length > 15) {
      return 'Panjang nomor telepon harus antara 10 hingga 15 digit.';
    }
    return '';
  };

  // QR Upload Handler
  const handleQRFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setQrFile(file);
    setQrError('');
    setQrResult(null);

    // Create local image preview
    const reader = new FileReader();
    reader.onload = (uploadEvt) => {
      setQrPreview(uploadEvt.target?.result);
    };
    reader.readAsDataURL(file);

    // Automatically send to Backend QR Reader
    try {
      setQrScanning(true);
      const scanRes = await scanWhatsAppQRCode(file);
      if (scanRes.success) {
        setQrResult(scanRes);
        // Autofill patient form
        const extractedName = scanRes.contact_name ? scanRes.contact_name.trim() : '';
        const extractedPhone = scanRes.phone_number || '';
        
        setPatientForm((prev) => ({
          ...prev,
          name: prev.name || (extractedName ? `Ibu/Bpk ${extractedName}` : 'Pasien Baru'),
          whatsapp_no: extractedPhone || prev.whatsapp_no,
          qr_code_url: scanRes.target_link || scanRes.qr_data,
          qr_contact_name: extractedName,
        }));
        setFeedback({
          type: 'success',
          message: `Kode QR WhatsApp berhasil dipindai! Kontak teridentifikasi: ${scanRes.contact_name || scanRes.qr_type}`,
        });
      } else {
        setQrError(scanRes.error || 'Gagal membaca kode QR dari gambar.');
      }
    } catch (err) {
      setQrError(err.message || 'Terjadi kesalahan saat memproses gambar QR.');
    } finally {
      setQrScanning(false);
    }
  };

  // Submit Patient Registration
  const handlePatientSubmit = async (e) => {
    e.preventDefault();
    if (patientForm.whatsapp_no && !patientForm.whatsapp_no.startsWith('QR_')) {
      const err = validateWhatsAppNumber(patientForm.whatsapp_no);
      if (err) {
        setPhoneError(err);
        return;
      }
    }
    setPhoneError('');

    try {
      await createReminderPatient({
        name: patientForm.name.trim(),
        whatsapp_no: patientForm.whatsapp_no.trim(),
        qr_code_url: patientForm.qr_code_url || undefined,
        qr_contact_name: patientForm.qr_contact_name || undefined,
      });
      setShowPatientModal(false);
      setShowQRScanModal(false);
      setPatientForm({ name: '', whatsapp_no: '628', qr_code_url: '', qr_contact_name: '' });
      setQrFile(null);
      setQrPreview(null);
      setQrResult(null);
      setFeedback({ type: 'success', message: 'Pasien berhasil didaftarkan! Tautan WhatsApp terhubung otomatis.' });
      await loadData();
    } catch (apiErr) {
      setFeedback({ type: 'error', message: apiErr.message });
    }
  };

  // Submit Medication & Schedule
  const handleMedSubmit = async (e) => {
    e.preventDefault();
    if (!medForm.patient_id) {
      setFeedback({ type: 'error', message: 'Silakan pilih pasien penerima terlebih dahulu.' });
      return;
    }

    try {
      const times = medForm.target_times_str
        .split(',')
        .map((t) => t.trim())
        .filter((t) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(t));

      const createdRes = await createReminderMedication({
        patient_id: medForm.patient_id,
        name: medForm.name.trim(),
        dosage: medForm.dosage.trim(),
        instructions: medForm.instructions.trim(),
        duration_days: parseInt(medForm.duration_days, 10) || 1,
        schedule_type: medForm.schedule_type,
        interval_hours: parseInt(medForm.interval_hours, 10) || 8,
        target_times: times.length > 0 ? times : ['08:00'],
      });

      const patient = patients.find((p) => p.id === medForm.patient_id);
      const patientName = patient?.name || createdRes?.patient_name || 'Bapak/Ibu';
      const patientPhone = patient?.whatsapp_no || createdRes?.patient_phone || '';
      const timesStr = (times.length > 0 ? times : ['08:00']).join(', ');
      const instNote = medForm.instructions ? `\n📝 *Aturan Minum:* ${medForm.instructions}` : '';

      const welcomeText = 
        `👋 *Halo ${patientName}, Selamat Datang di MedikaGuard!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Data pengingat obat Anda telah berhasil didaftarkan:\n\n` +
        `💊 *Nama Obat:* ${medForm.name.trim()}\n` +
        `⚖️ *Dosis:* ${medForm.dosage.trim()}${instNote}\n` +
        `⏰ *Jadwal Minum:* ${timesStr} WIB\n\n` +
        `Pengingat otomatis akan dikirim ke WhatsApp ini:\n` +
        `1️⃣ Pengingat persiapan 10 menit sebelum jam minum obat.\n` +
        `2️⃣ Pengingat saat tiba waktunya minum obat.\n\n` +
        `Semoga lekas sembuh dan sehat selalu ya! 🌿\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `_Layanan Pengingat Pasien MedikaGuard_`;

      setShowMedModal(false);
      setMedForm({
        patient_id: '',
        name: '',
        dosage: '',
        instructions: 'Sesudah makan',
        duration_days: 1,
        frequency: '1x1',
        schedule_type: 'FIXED_TIMES',
        interval_hours: 8,
        target_times_str: '08:00',
      });

      setFeedback({
        type: 'success',
        message: 'Jadwal obat berhasil disimpan! Bot pengingat otomatis mengirimkan notifikasi ke WhatsApp pasien.',
      });

      await loadData();
    } catch (apiErr) {
      setFeedback({ type: 'error', message: apiErr.message });
    }
  };

  // Quick Demo Fill
  const handleQuickFillPatientDemo = () => {
    setPatientForm({
      name: 'Bapak Hendra (Pasien Terverifikasi)',
      whatsapp_no: '6281298765432',
      qr_code_url: 'https://wa.me/qr/S7RKLDEWBD7LK1',
      qr_contact_name: 'hendra_care',
    });
    setPhoneError('');
  };

  const handleQuickFillMedDemo = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const t1 = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const nextH = (now.getHours() + 6) % 24;
    const t2 = `${pad(nextH)}:00`;

    setMedForm({
      patient_id: patients[0]?.id || '',
      name: 'Amlodipine Besylate',
      dosage: '10 mg (1 Tablet)',
      instructions: 'Diminum pagi hari sesudah sarapan',
      duration_days: 7,
      schedule_type: 'FIXED_TIMES',
      interval_hours: 8,
      target_times_str: `${t1}, ${t2}`,
    });
  };

  // Trigger Scheduler Tick
  const handleSimulateTick = () => {
    startTransition(async () => {
      try {
        const res = await simulateReminderTick();
        setFeedback({
          type: 'info',
          message: `Scheduler Evaluated! (H-10M: ${res.processed?.reminded_10m || 0}, Waktu H: ${res.processed?.due_0m || 0}, Delayed: ${res.processed?.delayed || 0})`,
        });
        await loadData();
      } catch (err) {
        setFeedback({ type: 'error', message: err.message });
      }
    });
  };

  // Trigger Specific Notification Stage Langsung ke WhatsApp Bot
  const handleTriggerStage = (logId, stage, stageLabel) => {
    startTransition(async () => {
      try {
        const res = await triggerReminderStage(logId, stage);
        if (res.success) {
          setFeedback({
            type: 'success',
            message: `Notifikasi ${stageLabel} berhasil dikirim ke WhatsApp pasien!`,
          });
          await loadData();
        } else {
          setFeedback({
            type: 'error',
            message: res.message || 'Gagal mengirim pesan pengingat ke WhatsApp.',
          });
        }
      } catch (err) {
        setFeedback({ type: 'error', message: err.message });
      }
    });
  };

  // Simulate Button Clicks
  const handleSimulateButton = (buttonId) => {
    startTransition(async () => {
      try {
        const res = await simulateButtonInteraction(buttonId);
        const actionType = buttonId.split(':')[0];
        if (actionType === 'BTN_ONTIME_TAKEN') {
          setFeedback({
            type: 'success',
            message: '🎉 Pasien menekan [Ya, Sudah Minum] tepat waktu! Status diperbarui menjadi COMPLETED.',
          });
        } else if (actionType === 'BTN_ONTIME_NOT') {
          setFeedback({
            type: 'warning',
            message: '⚠️ Pasien menekan [Belum]. Status berubah menjadi DELAYED dan memicu Dynamic Rescheduling.',
          });
        } else if (actionType === 'BTN_LATE_TAKEN') {
          setFeedback({
            type: 'info',
            message: '🔄 Dynamic Rescheduling Aktif: Jadwal dosis berikutnya digeser secara aman medis.',
          });
        }
        await loadData();
      } catch (err) {
        setFeedback({ type: 'error', message: err.message });
      }
    });
  };

  // Delete Handlers
  const handleDeletePatient = async (id) => {
    if (!confirm('Hapus pasien ini beserta seluruh jadwal minum obatnya?')) return;
    try {
      await deleteReminderPatient(id);
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  const handleDeleteMedication = async (id) => {
    if (!confirm('Hapus jadwal obat ini?')) return;
    try {
      await deleteReminderMedication(id);
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  const handleDeleteLog = async (id) => {
    try {
      await deleteReminderLog(id);
      await loadData();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  const handleClearAll = async () => {
    if (!confirm('YAKIN RESET SEMUA DATA PENGINGAT? Seluruh pasien, jadwal, dan riwayat akan dikosongkan.')) return;
    try {
      await clearAllRemindersData();
      await loadData();
      setFeedback({ type: 'info', message: 'Semua data telah direset ke Clean Slate.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  // Metrics Calculation
  const metrics = useMemo(() => {
    const totalActive = logs.length;
    const completed = logs.filter((l) => l.status === 'COMPLETED').length;
    const delayed = logs.filter((l) => l.status === 'DELAYED').length;
    const rescheduled = logs.filter((l) => l.status === 'RESCHEDULED').length;
    const onTimeRate = totalActive > 0 ? Math.round((completed / totalActive) * 100) : 100;
    return { totalActive, completed, delayed, rescheduled, onTimeRate };
  }, [logs]);

  // Today's date in local YYYY-MM-DD
  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // Filtered Logs by Time Horizon & Status
  const filteredLogs = useMemo(() => {
    let list = logs;

    // Filter by Horizon: Hari Ini vs Semua Hari
    if (timeHorizon === 'TODAY') {
      list = list.filter((l) => {
        const logDate = l.scheduled_at?.split('T')[0];
        return logDate === todayStr;
      });
    }

    // Filter by Status (10-minute warning is strictly treated as PENDING on dashboard)
    if (selectedFilter !== 'ALL') {
      list = list.filter((l) => {
        const effectiveStatus = (l.status === 'REMINDED_10M' || l.status === 'REMINDED_15M') ? 'PENDING' : l.status;
        return effectiveStatus === selectedFilter;
      });
    }

    return list;
  }, [logs, timeHorizon, selectedFilter, todayStr]);

  // Count of logs for today
  const todayLogsCount = useMemo(() => {
    return logs.filter((l) => l.scheduled_at?.split('T')[0] === todayStr).length;
  }, [logs, todayStr]);

  // Helpers for table display
  const getPatientInfo = (pId) => patients.find((p) => p.id === pId) || { name: 'Pasien Tidak Ditemukan', whatsapp_no: '-' };
  const getMedInfo = (mId) => medications.find((m) => m.id === mId) || { name: 'Obat Tidak Ditemukan', dosage: '-' };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Sudah Diminum
          </span>
        );
      case 'DELAYED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30 animate-pulse">
            <AlertCircle className="w-3.5 h-3.5" />
            Belum Diminum
          </span>
        );
      case 'RESCHEDULED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-violet-100 text-violet-800 border border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30">
            <RefreshCw className="w-3.5 h-3.5" />
            Jadwal Digeser
          </span>
        );
      case 'DUE_0M':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40 animate-pulse">
            <Clock className="w-3.5 h-3.5" />
            Waktunya Minum
          </span>
        );
      case 'REMINDED_10M':
      case 'REMINDED_15M':
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700/60">
            <Clock className="w-3.5 h-3.5" />
            Menunggu Waktu
          </span>
        );
    }
  };

  return (
    <div className="w-full max-w-full space-y-6 text-slate-800 dark:text-zinc-100 min-w-0">
      
      {/* ── 1. Futuristic Header & Connection Banner ── */}
      <div className="relative overflow-hidden rounded-3xl bg-white dark:bg-gradient-to-r dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 border border-slate-200 dark:border-zinc-800/80 p-6 sm:p-8 shadow-sm dark:shadow-2xl">
        <div className="absolute top-0 right-1/4 -mt-12 w-96 h-36 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-10 -mb-12 w-80 h-32 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border shadow-xs ${
                gatewayStatus.fonnte_configured
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30'
                  : 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40'
              }`}>
                <span className={`w-2 h-2 rounded-full ${gatewayStatus.fonnte_configured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {gatewayStatus.fonnte_configured ? 'Bot WhatsApp Otomatis: Aktif' : 'Bot WhatsApp: Belum Ada Token'}
              </span>

              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-violet-50 text-violet-800 border border-violet-200 dark:bg-violet-950/70 dark:text-violet-300 dark:border-violet-800/60">
                <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-300" />
                Bot: +6289520344305
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
              <span>Pengingat Obat Pasien &amp; Lansia</span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
              Sistem pengingat minum obat yang mudah dan ramah untuk lansia &amp; keluarga. Cukup daftarkan nama dan jam minum obat, bot pengingat akan otomatis mengirimkan pesan pengingat langsung ke nomor WhatsApp pasien secara real-time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowTokenModal(true)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition shadow-sm cursor-pointer ${
                gatewayStatus.fonnte_configured
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-emerald-400 dark:border-emerald-500/40'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 dark:text-amber-300 dark:border-amber-500/60 animate-pulse'
              }`}
              title="Atur token WhatsApp Gateway Fonnte agar pesan otomatis masuk ke HP"
            >
              <Key className="w-4 h-4 text-amber-700 dark:text-[#10b981]" />
              <span>{gatewayStatus.fonnte_configured ? '🔑 Token Terpasang (Aktif)' : '🔑 Masukkan Token WhatsApp'}</span>
            </button>
            <button
              onClick={() => setShowQRScanModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700 dark:hover:border-[#10b981]/50 transition shadow-sm"
              title="Unggah screenshot Kode QR WhatsApp untuk menghubungkan pasien"
            >
              <QrCode className="w-4 h-4 text-[#0284c7] dark:text-[#10b981]" />
              <span>Pindai QR WhatsApp</span>
            </button>

            <button
              onClick={handleSimulateTick}
              disabled={isPending}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40 transition shadow-sm"
              title="Periksa apakah ada jadwal minum obat saat ini"
            >
              <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Cek Jadwal Sekarang</span>
            </button>

            <button
              onClick={() => setShowPatientModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] text-white border border-transparent dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-white dark:border-zinc-700 transition shadow-md"
            >
              <UserPlus className="w-4 h-4 text-white dark:text-emerald-400" />
              <span>+ Tambah Pasien</span>
            </button>

            <button
              onClick={() => setShowMedModal(true)}
              disabled={patients.length === 0}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black transition shadow-md ${
                patients.length === 0
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600'
                  : 'bg-[#0284c7] hover:bg-[#0369a1] text-white dark:bg-[#10b981] dark:text-[#0f172a] dark:hover:bg-[#059669]'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>+ Buat Jadwal Obat</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Feedback Notification Toast ── */}
      {feedback && (
        <div className={`p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm font-medium border backdrop-blur-md animate-fade-in ${
          feedback.type === 'success'
            ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/80 dark:border-emerald-500/50 dark:text-emerald-300'
            : feedback.type === 'error'
            ? 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/80 dark:border-rose-500/50 dark:text-rose-300'
            : feedback.type === 'warning'
            ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/80 dark:border-amber-500/50 dark:text-amber-300'
            : 'bg-sky-50 border-sky-300 text-sky-800 dark:bg-violet-950/80 dark:border-violet-500/50 dark:text-violet-300'
        }`}>
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 flex-shrink-0" />
            <span>{feedback.message}</span>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => setFeedback(null)}
              className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 dark:hover:bg-white/10 dark:text-zinc-400 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── 2. Visual 3-Stage Notification Pipeline Card ── */}
      <div className="rounded-3xl bg-white dark:bg-zinc-950/90 border border-slate-200 dark:border-zinc-800/80 p-5 sm:p-6 shadow-sm dark:shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/80 dark:text-violet-300 dark:border-violet-800/50">
              <Sparkles className="w-4 h-4 text-violet-600 dark:text-[#10b981]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Cara Kerja Pengingat WhatsApp Pasien</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Pesan otomatis terkirim langsung ke WhatsApp pasien agar teratur minum obat</p>
            </div>
          </div>
          <span className="hidden sm:inline-flex text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800 font-semibold">
            Real-time WhatsApp
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Stage 1 */}
          <div className="relative rounded-2xl bg-slate-50 dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30">
                Tahap 1 • Saat Daftar
              </span>
              <Send className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-white">Sambutan &amp; Rincian Jadwal</h3>
            <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
              Begitu data obat disimpan, bot langsung mengirim pesan selamat datang beserta rincian nama obat, dosis, dan jam minum ke WhatsApp pasien.
            </p>
            <div className="pt-2 text-[10px] text-emerald-700 dark:text-emerald-400 font-mono font-bold flex items-center gap-1">
              <Check className="w-3 h-3" /> Waktu: Langsung Terkirim
            </div>
          </div>

          {/* Stage 2 */}
          <div className="relative rounded-2xl bg-slate-50 dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-500/20 dark:text-sky-400 dark:border-sky-500/30">
                Tahap 2 • H-10 Menit (Hanya WhatsApp)
              </span>
              <Timer className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            </div>
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-white">Pengingat Persiapan</h3>
            <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
              10 menit sebelum jam minum tiba, bot mengirim pesan ke WhatsApp pasien untuk menyiapkan obat dan air minum (tidak mengotori dashboard).
            </p>
            <div className="pt-2 text-[10px] text-sky-700 dark:text-sky-400 font-mono font-bold flex items-center gap-1">
              <Clock className="w-3 h-3" /> Waktu: 10 Menit Sebelum
            </div>
          </div>

          {/* Stage 3 */}
          <div className="relative rounded-2xl bg-slate-50 dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-sky-100 text-[#0284c7] border border-sky-300 dark:bg-[#10b981]/20 dark:text-[#10b981] dark:border-[#10b981]/30">
                Tahap 3 • Waktu Minum
              </span>
              <Activity className="w-3.5 h-3.5 text-[#0284c7] dark:text-[#10b981]" />
            </div>
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-white">Konfirmasi Minum Obat</h3>
            <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
              Tepat pada jam minum obat, pasien menerima pesan WhatsApp konfirmasi:
              <br />
              <strong className="text-emerald-700 dark:text-emerald-400">[Sudah Minum]</strong> ➔ Selesai Tepat Waktu
              <br />
              <strong className="text-rose-700 dark:text-rose-400">[Belum]</strong> ➔ Jadwal Diingatkan Kembali
            </p>
            <div className="pt-2 text-[10px] text-[#0284c7] dark:text-[#10b981] font-mono font-bold flex items-center gap-1">
              <Zap className="w-3 h-3" /> Waktu: Tepat Jam Minum
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. High-Impact Metric Cards (Responsive Grid) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 w-full">
        {/* Metric 1 */}
        <div data-status="default" className="rounded-3xl bg-white dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800/80 p-5 sm:p-6 shadow-sm dark:shadow-xl relative overflow-hidden group hover:border-slate-300 dark:hover:border-zinc-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">JADWAL OBAT TERDAFTAR</span>
            <div className="p-2.5 rounded-2xl bg-sky-50 text-[#0284c7] border border-sky-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800 group-hover:scale-110 transition">
              <Calendar className="w-4 h-4 text-[#0284c7] dark:text-[#10b981]" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">{metrics.totalActive}</span>
            <span className="text-xs text-slate-500 dark:text-zinc-400">dosis tercatat</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-1">
            <User className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400" />
            <span>{patients.length} Pasien • {medications.length} Program Obat</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div data-status="green" className="rounded-3xl bg-white dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800/80 p-5 sm:p-6 shadow-sm dark:shadow-xl relative overflow-hidden group hover:border-emerald-300 dark:hover:border-emerald-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">SUDAH DIMINUM</span>
            <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30 group-hover:scale-110 transition">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black text-emerald-600 dark:text-emerald-400">{metrics.completed}</span>
            <span className="text-xs text-slate-500 dark:text-zinc-400">tepat waktu</span>
          </div>
          <div className="mt-2 text-xs text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
            <span>● Kepatuhan minum obat ({metrics.onTimeRate}%)</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div data-status="red" className="rounded-3xl bg-white dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800/80 p-5 sm:p-6 shadow-sm dark:shadow-xl relative overflow-hidden group hover:border-rose-300 dark:hover:border-rose-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">BELUM DIMINUM</span>
            <div className="p-2.5 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30 group-hover:scale-110 transition">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black text-rose-600 dark:text-rose-400">{metrics.delayed}</span>
            <span className="text-xs text-slate-500 dark:text-zinc-400">perlu konfirmasi</span>
          </div>
          <div className="mt-2 text-xs text-rose-700 dark:text-rose-400 font-semibold flex items-center gap-1">
            <span>● Belum ada konfirmasi minum obat</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div data-status="yellow" className="rounded-3xl bg-white dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800/80 p-5 sm:p-6 shadow-sm dark:shadow-xl relative overflow-hidden group hover:border-violet-300 dark:hover:border-violet-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">JADWAL DISESUAIKAN</span>
            <div className="p-2.5 rounded-2xl bg-violet-50 text-violet-600 border border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30 group-hover:scale-110 transition">
              <RefreshCw className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black text-violet-600 dark:text-violet-300">{metrics.rescheduled}</span>
            <span className="text-xs text-slate-500 dark:text-zinc-400">jadwal digeser aman</span>
          </div>
          <div className="mt-2 text-xs text-violet-700 dark:text-violet-400 font-semibold flex items-center gap-1">
            <span>● Jarak aman antar dosis tetap terjaga</span>
          </div>
        </div>
      </div>

      {/* ── 4. Main Content: Jadwal Pengingat & Riwayat Pesan ── */}
      <div className="rounded-3xl bg-white dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800/80 p-5 sm:p-7 shadow-sm dark:shadow-2xl space-y-6">
        
        {/* Tab & Controls Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-zinc-800/80 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">Pantauan Pengingat Obat Pasien</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-sky-50 text-[#0284c7] border border-sky-200 dark:bg-zinc-800 dark:text-[#10b981] dark:border-zinc-700 font-bold">
                {filteredLogs.length} Dosis ({timeHorizon === 'TODAY' ? 'Hari Ini' : 'Semua Hari'})
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Daftar jadwal minum obat yang otomatis dikirim ke WhatsApp pasien sesuai waktu yang ditentukan
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* View switcher: Jadwal vs Riwayat WhatsApp */}
            <div className="flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-bold">
              <button
                onClick={() => setActiveViewTab('SCHEDULES')}
                className={`px-3.5 py-1.5 rounded-xl transition ${
                  activeViewTab === 'SCHEDULES'
                    ? 'bg-white text-[#0284c7] shadow-sm font-extrabold dark:bg-zinc-800 dark:text-[#10b981]'
                    : 'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                📋 Jadwal Minum Obat
              </button>
              <button
                onClick={() => setActiveViewTab('WEBHOOK_LOGS')}
                className={`px-3.5 py-1.5 rounded-xl transition ${
                  activeViewTab === 'WEBHOOK_LOGS'
                    ? 'bg-white text-[#0284c7] shadow-sm font-extrabold dark:bg-zinc-800 dark:text-[#10b981]'
                    : 'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                💬 Riwayat WhatsApp ({activityLogs.length})
              </button>
            </div>

            {logs.length > 0 && (
              <button
                onClick={handleClearAll}
                className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:text-zinc-500 dark:hover:text-rose-400 dark:hover:bg-rose-950/30 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/40 transition"
                title="Hapus dan bersihkan semua data"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Toolbar: Horizon (Hari Ini / Semua) + Status Chips */}
        {activeViewTab === 'SCHEDULES' && (
          <div className="space-y-3 pb-1">
            {/* Horizon Switcher */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 mr-1">Tampilan Waktu:</span>
              <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800 text-xs font-bold">
                <button
                  onClick={() => setTimeHorizon('TODAY')}
                  className={`px-3 py-1 rounded-lg transition ${
                    timeHorizon === 'TODAY'
                      ? 'bg-[#0284c7] text-white shadow-xs font-extrabold dark:bg-[#10b981] dark:text-[#0f172a]'
                      : 'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
                  }`}
                >
                  📅 Jadwal Hari Ini ({todayLogsCount})
                </button>
                <button
                  onClick={() => setTimeHorizon('ALL')}
                  className={`px-3 py-1 rounded-lg transition ${
                    timeHorizon === 'ALL'
                      ? 'bg-[#0284c7] text-white shadow-xs font-extrabold dark:bg-[#10b981] dark:text-[#0f172a]'
                      : 'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
                  }`}
                >
                  🗓️ Semua Jadwal ({logs.length})
                </button>
              </div>
            </div>

            {/* Status Filter Chips (Without REMINDED_10M) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              {[
                { key: 'ALL', label: 'Semua Status' },
                { key: 'PENDING', label: 'Menunggu Waktu' },
                { key: 'DUE_0M', label: 'Waktunya Minum' },
                { key: 'DELAYED', label: 'Belum Diminum' },
                { key: 'COMPLETED', label: 'Sudah Diminum' },
                { key: 'RESCHEDULED', label: 'Jadwal Digeser' },
              ].map(({ key, label }) => {
                const count = key === 'ALL'
                  ? (timeHorizon === 'TODAY' ? todayLogsCount : logs.length)
                  : logs.filter((l) => {
                      const matchesHorizon = timeHorizon === 'TODAY' ? l.scheduled_at?.split('T')[0] === todayStr : true;
                      const effStatus = (l.status === 'REMINDED_10M' || l.status === 'REMINDED_15M') ? 'PENDING' : l.status;
                      return matchesHorizon && effStatus === key;
                    }).length;

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedFilter(key)}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition border ${
                      selectedFilter === key
                        ? 'bg-[#0284c7] text-white border-[#0284c7] shadow-xs dark:bg-zinc-800 dark:text-white dark:border-zinc-600'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 hover:text-slate-900 dark:bg-zinc-900/60 dark:text-zinc-400 dark:border-zinc-800/80 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
                    }`}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── VIEW 1: Schedules Table ── */}
        {activeViewTab === 'SCHEDULES' && (
          <div className="w-full">
            {filteredLogs.length === 0 ? (
              /* Clean State / Empty State */
              <div className="text-center py-14 px-4 space-y-4 rounded-3xl bg-zinc-900/40 border border-dashed border-zinc-800">
                <div className="w-16 h-16 rounded-3xl bg-zinc-900 mx-auto flex items-center justify-center text-zinc-500 border border-zinc-800">
                  <Pill className="w-8 h-8 text-zinc-600" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-extrabold text-white">Belum Ada Jadwal Minum Obat</h3>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                    Mulai dengan mendaftarkan pasien (lewat Pindai Kode QR atau Nomor WhatsApp) dan buat jadwal obat baru.
                  </p>
                </div>
                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => setShowQRScanModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 transition"
                  >
                    <QrCode className="w-3.5 h-3.5 text-[#10b981]" />
                    <span>Pindai QR Kontak</span>
                  </button>
                  <button
                    onClick={() => setShowPatientModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#10b981] text-[#0f172a] hover:bg-[#059669] transition shadow-md"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Daftarkan Pasien</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Responsive Table */
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800/80">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/80 text-slate-600 dark:text-zinc-400 font-semibold uppercase tracking-wider">
                      <th className="py-3.5 px-4">Pasien &amp; WhatsApp</th>
                      <th className="py-3.5 px-4">Nama Obat &amp; Dosis</th>
                      <th className="py-3.5 px-4">Waktu Minum</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4">Waktu Konfirmasi</th>
                      <th className="py-3.5 px-4 text-center">Kirim Pengingat WhatsApp</th>
                      <th className="py-3.5 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60 font-medium">
                    {filteredLogs.map((log) => {
                      const patient = getPatientInfo(log.patient_id);
                      const medication = getMedInfo(log.medication_id);
                      const schedDate = new Date(log.scheduled_at);
                      const timeStr = schedDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
                      const dateStr = schedDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                      const cleanPhone = patient.whatsapp_no && !patient.whatsapp_no.startsWith('QR_') ? patient.whatsapp_no : '';
                      const directWaUrl = cleanPhone
                        ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Halo ${patient.name}, mengingatkan untuk minum obat ${medication.name} (${medication.dosage}) sekarang ya! 💊`)}`
                        : null;

                      return (
                        <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition">
                          {/* Pasien */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span>{patient.name}</span>
                              {patient.qr_code_url && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400" title="Terhubung via Kode QR">
                                  <QrCode className="w-2.5 h-2.5" /> QR
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono mt-0.5 flex items-center gap-1">
                              <Phone className="w-2.5 h-2.5" />
                              <span>{patient.whatsapp_no.startsWith('QR_') ? 'Tautan QR Aktif' : `+${patient.whatsapp_no}`}</span>
                            </div>
                          </td>

                          {/* Obat */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 dark:text-zinc-200">{medication.name}</div>
                            <div className="text-[11px] text-slate-500 dark:text-zinc-400">{medication.dosage}</div>
                          </td>

                          {/* Jadwal */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-extrabold text-[#0284c7] dark:text-[#10b981]">{timeStr}</div>
                            <div className="text-[11px] text-slate-500 dark:text-zinc-400">{dateStr}</div>
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {renderStatusBadge(log.status)}
                          </td>

                          {/* Waktu Konfirmasi */}
                          <td className="py-3.5 px-4 text-slate-500 dark:text-zinc-400 text-[11px]">
                            {log.actual_taken_at ? (
                              <span className="text-emerald-700 dark:text-emerald-400 font-mono font-bold">
                                Diminum: {new Date(log.actual_taken_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                              </span>
                            ) : log.due_sent_at ? (
                              <span className="text-amber-700 dark:text-amber-400 font-mono font-bold">
                                Terkirim: {new Date(log.due_sent_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-zinc-500">Menunggu jadwal</span>
                            )}
                          </td>

                          {/* Kirim Pengingat WhatsApp & Tombol Konfirmasi */}
                          <td className="py-3.5 px-4">
                            <div className="flex flex-col gap-1.5 items-center justify-center">
                              {/* Stage Triggers */}
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleTriggerStage(log.id, 'STAGE_3_DUE_0M', 'Waktunya Minum Obat')}
                                  className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/80 dark:hover:bg-amber-900 dark:text-amber-300 dark:border-amber-800/60 transition shadow-xs cursor-pointer flex items-center gap-1.5"
                                  title="Kirim pesan notifikasi pengingat otomatis langsung ke WhatsApp pasien"
                                >
                                  <Send className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                  <span>🔔 Ingatkan Sekarang</span>
                                </button>
                              </div>

                              {/* Simulation Button Replies */}
                              {log.status === 'DUE_0M' && (
                                <div className="flex items-center gap-1 animate-fade-in">
                                  <button
                                    onClick={() => handleSimulateButton(`BTN_ONTIME_TAKEN:${log.id}`)}
                                    className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                                    title="Konfirmasi bahwa pasien sudah minum obat"
                                  >
                                    ✅ Sudah Minum
                                  </button>
                                  <button
                                    onClick={() => handleSimulateButton(`BTN_ONTIME_NOT:${log.id}`)}
                                    className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-sm"
                                    title="Pasien belum minum obat"
                                  >
                                    ⏰ Belum Minum
                                  </button>
                                </div>
                              )}

                              {log.status === 'DELAYED' && (
                                <button
                                  onClick={() => handleSimulateButton(`BTN_LATE_TAKEN:${log.id}`)}
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-violet-600 hover:bg-violet-500 text-white shadow-sm"
                                  title="Pasien baru minum sekarang ➔ Jadwal berikutnya disesuaikan"
                                >
                                  🔄 Sudah Minum Sekarang
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Delete */}
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => handleDeleteLog(log.id)}
                              className="p-1 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition"
                              title="Hapus jadwal dosis ini"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── VIEW 2: Webhook & Activity Feed ── */}
        {activeViewTab === 'WEBHOOK_LOGS' && (
          <div className="space-y-3">
            {activityLogs.length === 0 ? (
              <div className="text-center py-10 text-zinc-500 text-xs">
                Belum ada aktivitas webhook atau notifikasi tercatat.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/80 rounded-2xl border border-zinc-800 bg-zinc-900/50 max-h-96 overflow-y-auto">
                {activityLogs.map((act) => (
                  <div key={act.id} className="p-3.5 flex items-start justify-between text-xs hover:bg-zinc-900 transition">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                          act.event_type.includes('CONFIRM') || act.event_type.includes('WELCOME')
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : act.event_type.includes('PRE')
                            ? 'bg-sky-500/20 text-sky-400'
                            : act.event_type.includes('DUE')
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-violet-500/20 text-violet-300'
                        }`}>
                          {act.event_type}
                        </span>
                        <span className="font-bold text-white">{act.title}</span>
                      </div>
                      <div className="text-zinc-400 text-[11px] font-mono">
                        {JSON.stringify(act.details)}
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-500 whitespace-nowrap ml-4">
                      {new Date(act.timestamp).toLocaleTimeString('id-ID')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── MODAL 1: Pindai / Unggah Kode QR WhatsApp (Autentikasi Tanpa Token) ── */}
      {mounted && showQRScanModal && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowQRScanModal(false);
          }}
        >
          <div className="relative w-full max-w-lg my-auto max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 p-6 sm:p-8 shadow-2xl space-y-6">
            
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-800/50">
                  <QrCode className="w-5 h-5 text-emerald-600 dark:text-[#10b981]" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Pindai Kode QR WhatsApp</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">Tautkan kontak pasien otomatis tanpa memasukkan token API</p>
                </div>
              </div>
              <button
                onClick={() => setShowQRScanModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drag & Drop / File Input Box */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 ${
                qrPreview
                  ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/10'
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50 dark:border-zinc-800 dark:hover:border-zinc-600 dark:bg-zinc-900/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleQRFileSelect}
                className="hidden"
              />

              {qrPreview ? (
                <div className="relative w-48 h-48 rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-700 bg-black">
                  <img
                    src={qrPreview}
                    alt="Preview Kode QR"
                    className="w-full h-full object-contain"
                  />
                  {qrScanning && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-8 h-8 text-[#0284c7] dark:text-[#10b981] animate-spin" />
                      <span className="text-xs font-bold text-white">Mengekstrak QR &amp; Kontak...</span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-sky-50 dark:bg-zinc-800 flex items-center justify-center text-slate-500 dark:text-zinc-400">
                    <Upload className="w-6 h-6 text-[#0284c7] dark:text-[#10b981]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Unggah Gambar Kode QR WhatsApp</p>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      Klik atau seret screenshot QR Code dari WhatsApp (JPG, PNG)
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Error Message */}
            {qrError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/80 dark:border-rose-800/60 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{qrError}</span>
              </div>
            )}

            {/* Success Result Box */}
            {qrResult && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs space-y-2 dark:bg-emerald-950/50 dark:border-emerald-500/40">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-400 font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Kode QR Kontak Berhasil Divalidasi!</span>
                </div>
                <div className="space-y-1 text-slate-700 dark:text-zinc-300 font-mono text-[11px]">
                  <p>• <strong>Tautan Kontak:</strong> {qrResult.target_link}</p>
                  <p>• <strong>Nama Kontak:</strong> {qrResult.contact_name || qrResult.display_name}</p>
                  <p>• <strong>Status:</strong> Siap Ditautkan ke Profil Pasien</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowQRScanModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition"
              >
                Tutup
              </button>
              {qrResult && (
                <button
                  type="button"
                  onClick={() => {
                    setShowQRScanModal(false);
                    setShowPatientModal(true);
                  }}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] text-white dark:bg-[#10b981] dark:text-[#0f172a] dark:hover:bg-[#059669] transition shadow-md"
                >
                  Lanjut Simpan Pasien ➔
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL 2: Tambah Pasien Baru ── */}
      {mounted && showPatientModal && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPatientModal(false);
          }}
        >
          <div className="relative w-full max-w-md my-auto max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 p-6 sm:p-8 shadow-2xl space-y-6">
            
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-800/50">
                  <UserPlus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Daftarkan Pasien Baru</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">Target penerima notifikasi pengingat berjenjang</p>
                </div>
              </div>
              <button
                onClick={() => setShowPatientModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick QR indicator if already scanned */}
            {patientForm.qr_code_url && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-500/30 dark:text-emerald-300 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-emerald-600 dark:text-[#10b981]" />
                  <span>Kode QR Terhubung ({patientForm.qr_contact_name || 'Aktif'})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPatientForm((p) => ({ ...p, qr_code_url: '', qr_contact_name: '' }))}
                  className="text-slate-500 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 text-[10px]"
                >
                  Lepas
                </button>
              </div>
            )}

            <form onSubmit={handlePatientSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Nama Pasien / Lansia <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Ibu Siti Rahayu"
                  value={patientForm.name}
                  onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#0284c7] dark:focus:border-[#10b981] transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300">
                    Nomor WhatsApp Pasien <span className="text-slate-500 dark:text-zinc-500">(Awalan 62)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPatientModal(false);
                      setShowQRScanModal(true);
                    }}
                    className="text-[11px] text-[#0284c7] dark:text-[#10b981] hover:underline flex items-center gap-1 font-bold"
                  >
                    <QrCode className="w-3 h-3" /> Pindai Gambar QR
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="tel"
                    placeholder="6281234567890"
                    value={patientForm.whatsapp_no}
                    onChange={(e) => {
                      setPatientForm({ ...patientForm, whatsapp_no: e.target.value });
                      setPhoneError('');
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none transition ${
                      phoneError ? 'border-rose-500' : 'border-slate-200 dark:border-zinc-800 focus:border-[#0284c7] dark:focus:border-[#10b981]'
                    }`}
                  />
                  <Phone className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute right-3.5 top-3" />
                </div>
                {phoneError && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{phoneError}</p>}
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-zinc-800/80">
                <button
                  type="button"
                  onClick={handleQuickFillPatientDemo}
                  className="text-xs text-[#0284c7] dark:text-[#10b981] hover:underline font-bold"
                >
                  ⚡ Contoh Data Demo
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPatientModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] text-white dark:bg-emerald-600 dark:hover:bg-emerald-500 transition shadow-md"
                  >
                    Simpan Pasien
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL 3: Buat Jadwal Obat Baru ── */}
      {mounted && showMedModal && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowMedModal(false);
          }}
        >
          <div className="relative w-full max-w-lg my-auto max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 p-6 sm:p-8 shadow-2xl space-y-6">
            
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-sky-50 text-[#0284c7] border border-sky-200 dark:bg-[#10b981]/10 dark:text-[#10b981] dark:border-[#10b981]/30">
                  <Pill className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Buat Jadwal Obat Pasien</h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">Jadwal otomatis terhubung ke sistem notifikasi berjenjang</p>
                </div>
              </div>
              <button
                onClick={() => setShowMedModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleMedSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Pilih Pasien Penerima <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={medForm.patient_id}
                  onChange={(e) => setMedForm({ ...medForm, patient_id: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#0284c7] dark:focus:border-[#10b981] transition"
                >
                  <option value="">-- Pilih Pasien --</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.whatsapp_no.startsWith('QR_') ? 'QR' : p.whatsapp_no})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                    Nama Obat <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Amlodipine"
                    value={medForm.name}
                    onChange={(e) => setMedForm({ ...medForm, name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#0284c7] dark:focus:border-[#10b981] transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                    Dosis Obat <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="5 mg (1 Tablet)"
                    value={medForm.dosage}
                    onChange={(e) => setMedForm({ ...medForm, dosage: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#0284c7] dark:focus:border-[#10b981] transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Aturan / Petunjuk Minum
                </label>
                <input
                  type="text"
                  placeholder="Sesudah makan, di pagi hari"
                  value={medForm.instructions}
                  onChange={(e) => setMedForm({ ...medForm, instructions: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#0284c7] dark:focus:border-[#10b981] transition"
                />
              </div>

              {/* Frekuensi Minum */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Berapa Kali Minum Sehari?
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: '1x Sehari', times: '08:00' },
                    { label: '2x Sehari', times: '08:00, 20:00' },
                    { label: '3x Sehari', times: '08:00, 14:00, 20:00' },
                    { label: 'Kustom', times: null },
                  ].map((preset) => {
                    const isSelected = preset.times === null
                      ? !['08:00', '08:00, 20:00', '08:00, 14:00, 20:00'].includes(medForm.target_times_str)
                      : medForm.target_times_str === preset.times;

                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          if (preset.times) {
                            setMedForm((prev) => ({ ...prev, target_times_str: preset.times }));
                          }
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition border ${
                          isSelected
                            ? 'bg-[#0284c7] text-white border-[#0284c7] shadow-xs dark:bg-[#10b981] dark:text-[#0f172a] dark:border-[#10b981]'
                            : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Target Jam Minum */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Jam Minum Obat (Format 24 Jam) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="08:00"
                  value={medForm.target_times_str}
                  onChange={(e) => setMedForm({ ...medForm, target_times_str: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:border-[#0284c7] dark:focus:border-[#10b981] transition"
                />
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                  Contoh: 08:00 jika 1 kali sehari, atau 08:00, 20:00 jika 2 kali sehari
                </p>
              </div>

              {/* Lama Konsumsi / Durasi Hari */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Lama Minum Obat (Durasi)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: '1 Hari (1x Saja)', days: 1 },
                    { label: '3 Hari', days: 3 },
                    { label: '7 Hari (1 Minggu)', days: 7 },
                    { label: '14 Hari', days: 14 },
                  ].map((dur) => (
                    <button
                      key={dur.days}
                      type="button"
                      onClick={() => setMedForm((prev) => ({ ...prev, duration_days: dur.days }))}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition border ${
                        Number(medForm.duration_days) === dur.days
                          ? 'bg-[#0284c7] text-white border-[#0284c7] shadow-xs dark:bg-[#10b981] dark:text-[#0f172a] dark:border-[#10b981]'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800'
                      }`}
                    >
                      {dur.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ringkasan Dosis yang Dibuat */}
              {(() => {
                const timesCount = medForm.target_times_str.split(',').filter((t) => t.trim()).length || 1;
                const totalDoses = timesCount * (Number(medForm.duration_days) || 1);
                return (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 dark:bg-zinc-900/80 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-300 flex items-center justify-between">
                    <span>💡 <strong>Total Jadwal Dibuat:</strong></span>
                    <span className="font-mono font-bold text-[#0284c7] dark:text-[#10b981]">
                      {timesCount}x sehari × {medForm.duration_days} hari = {totalDoses} dosis
                    </span>
                  </div>
                );
              })()}

              <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-zinc-800/80">
                <button
                  type="button"
                  onClick={handleQuickFillMedDemo}
                  className="text-xs text-[#0284c7] dark:text-[#10b981] hover:underline font-bold"
                >
                  ⚡ Contoh Jadwal Demo
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMedModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] text-white dark:bg-[#10b981] dark:text-[#0f172a] dark:hover:bg-[#059669] transition shadow-md"
                  >
                    Simpan &amp; Kirim ke WhatsApp
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL PENGATURAN TOKEN WHATSAPP GATEWAY (FONNTE) ── */}
      {mounted && showTokenModal && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTokenModal(false);
          }}
        >
          <div className="relative w-full max-w-lg my-auto max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 p-6 sm:p-7 shadow-2xl space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-zinc-800/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30 flex items-center justify-center">
                  <Key className="w-6 h-6 text-amber-600 dark:text-[#10b981]" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    Pengaturan Token WhatsApp Bot
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Kirim pesan pengingat otomatis langsung ke WhatsApp tanpa campur tangan Anda
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTokenModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-white border border-slate-200 dark:border-zinc-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status Gateway Box */}
            <div className={`p-4 rounded-2xl border text-xs space-y-2.5 ${
              gatewayStatus.is_connected
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-500/40 dark:text-emerald-300'
                : gatewayStatus.fonnte_configured
                ? 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-500/40 dark:text-amber-300'
                : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={`w-3 h-3 rounded-full ${gatewayStatus.is_connected ? 'bg-emerald-500 animate-pulse' : gatewayStatus.fonnte_configured ? 'bg-amber-500 animate-pulse' : 'bg-slate-400 dark:bg-zinc-600'}`} />
                  <div>
                    <span className="font-bold text-sm">
                      {gatewayStatus.is_connected
                        ? '🟢 Bot Terhubung & Siap Kirim'
                        : gatewayStatus.device_status === 'disconnect'
                        ? '⚠️ Perangkat Belum Terhubung (Disconnect)'
                        : gatewayStatus.fonnte_configured
                        ? '⚠️ Token Tersimpan (Menunggu Koneksi)'
                        : 'Belum Ada Token'}
                    </span>
                    {gatewayStatus.device_phone && (
                      <p className="text-[11px] opacity-80 mt-0.5 font-mono">
                        Nomor Bot Pengirim: +{gatewayStatus.device_phone} • Kuota: {gatewayStatus.quota || 1000} pesan
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {gatewayStatus.device_status === 'disconnect' && (
                <div className="p-3 rounded-xl bg-amber-100 border border-amber-300 text-[11px] text-amber-900 leading-relaxed dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-200">
                  <strong>Penyebab Pesan Belum Masuk:</strong> Token akun Anda sudah terdeteksi di server, tetapi nomor pengirim (<strong>+{gatewayStatus.device_phone}</strong>) statusnya masih <em>Disconnect</em>.
                  <br />
                  👉 Silakan buka menu <strong>Device</strong> di <a href="https://fonnte.com" target="_blank" rel="noreferrer" className="text-[#0284c7] dark:text-[#10b981] underline font-bold">fonnte.com</a>, lalu klik tombol <strong>Scan QR / Connect</strong> pada nomor tersebut. Begitu terhubung, pesan pengingat langsung masuk otomatis ke HP Anda!
                </div>
              )}
            </div>

            {/* Panduan Singkat */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 dark:bg-zinc-900/80 dark:border-zinc-800 text-[11px] text-slate-600 dark:text-zinc-400 space-y-1.5 leading-relaxed">
              <span className="font-bold text-slate-800 dark:text-zinc-200">Cara Mendapatkan Token Gratis (1 Menit):</span>
              <ol className="list-decimal list-inside space-y-0.5 text-slate-600 dark:text-zinc-400">
                <li>Buka <a href="https://fonnte.com" target="_blank" rel="noreferrer" className="text-[#0284c7] dark:text-[#10b981] underline font-bold">fonnte.com</a> &amp; daftar akun gratis.</li>
                <li>Di menu <strong>Device</strong>, hubungkan nomor WhatsApp pengirim dengan scan QR.</li>
                <li>Salin <strong>Token</strong> yang tertera, lalu tempel pada kolom di bawah.</li>
              </ol>
            </div>

            {/* Form Input Token */}
            <form onSubmit={handleSaveToken} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Kolom Token WhatsApp Gateway (Fonnte Token) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Tempel token Anda di sini, contoh: 9x8y7z6w5v4u3t2s1..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white font-mono placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#0284c7] dark:focus:border-[#10b981] transition"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => handleTestSendWA('6285374497583')}
                  disabled={testSending || !gatewayStatus.fonnte_configured}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    !gatewayStatus.fonnte_configured
                      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed dark:bg-zinc-900 dark:text-zinc-600 dark:border-zinc-800'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-white dark:border-zinc-700 cursor-pointer shadow-xs'
                  }`}
                  title="Kirim pesan tes dari bot langsung ke nomor WhatsApp Anda"
                >
                  <Send className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{testSending ? 'Mengirim Tes...' : 'Tes Kirim ke HP Saya'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTokenModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={savingToken}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#0284c7] hover:bg-[#0369a1] text-white dark:bg-[#10b981] dark:text-[#0f172a] dark:hover:bg-[#059669] transition shadow-md cursor-pointer"
                  >
                    {savingToken ? 'Menyimpan...' : 'Simpan Token'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
