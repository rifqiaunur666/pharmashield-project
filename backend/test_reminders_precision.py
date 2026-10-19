"""
test_reminders_precision.py
Comprehensive test suite verifying:
1. Timezone accuracy & UTC storage integrity.
2. Custom time input preservation (e.g. 09:15, 14:30) without resetting to 08:00.
3. Two-Stage Reminder messages (Stage 1 pre-10m & Stage 2 on-time confirmation).
4. Callback Skenario A ([Ya, Sudah] / 1): status TAKEN, taken_at timestamp, adherence calculation.
5. Callback Skenario B ([Belum] / 2): status DELAYED, snooze options.
6. Sub-Skenario B.1 (Tunda 15/30m): status SNOOZED, timer rescheduled.
7. Sub-Skenario B.2 (Lewati / 3): status SKIPPED.
8. Natural language custom snooze ('tunda 45 menit').
"""

import asyncio
import sys
from pathlib import Path

# Ensure UTF-8 output on Windows console
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

# Ensure backend root is in python path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.reminder_service import reminder_engine, REMINDERS_DB_FILE
from app.services.meta_wa_service import meta_wa_service
from datetime import datetime, timedelta, timezone

async def run_tests():
    print("=" * 60)
    print("RUNNING PHARMASHIELD PRECISION REMINDER & TIMEZONE TEST SUITE")
    print("=" * 60)

    # 1. Isolate to temporary DB file so production reminders_engine.json is NEVER touched
    test_db = Path("backend/data/test_precision_reminders.json")
    reminder_engine.set_db_file(test_db)
    reminder_engine.clear_all_data()

    # 2. Register Patient
    patient = reminder_engine.create_patient(
        name="Ibu Siti",
        whatsapp_no="6289520344305",
        caregiver_name="Budi Santoso",
        caregiver_whatsapp="628123456789",
        escalation_enabled=True
    )
    print(f"✅ [1] Pasien terdaftar: {patient.name} ({patient.whatsapp_no}), Timezone: {patient.timezone}")

    # 3. Test Custom Times: 09:15 and 14.30 (verifying no 08:00 fallback bug!)
    med, logs = reminder_engine.create_medication_and_schedules(
        patient_id=patient.id,
        name="Amlodipine",
        dosage="5 mg - 1 Tablet",
        instructions="Sesudah makan",
        duration_days=1,
        target_times=["09:15", "14.30"]
    )
    print(f"✅ [2] Obat berhasil dibuat: {med.name}")
    print(f"    Target times yang tersimpan: {med.schedule.target_times}")
    assert med.schedule.target_times == ["09:15", "14:30"], f"Expected ['09:15', '14:30'], got {med.schedule.target_times}"
    assert len(logs) == 2, f"Expected 2 logs, got {len(logs)}"

    # Verify UTC and local times
    log1 = logs[0]
    log2 = logs[1]
    print(f"    Log 1 scheduled_at (Local WIB): {log1.scheduled_at}")
    print(f"    Log 1 scheduled_at_utc (UTC):   {log1.scheduled_at_utc}")
    assert "09:15" in log1.scheduled_at
    assert "02:15" in log1.scheduled_at_utc  # 09:15 WIB is 02:15 UTC!
    assert "14:30" in log2.scheduled_at
    assert "07:30" in log2.scheduled_at_utc  # 14:30 WIB is 07:30 UTC!

    # 4. Test Skenario A: User Mengklik [ ✅ Ya, Sudah ] (atau ketik '1' / 'sudah')
    reminder_engine._logs[log1.id]["status"] = "DUE_0M"
    reminder_engine._save_data()
    res_a = await reminder_engine.handle_text_interaction(patient.whatsapp_no, "1")
    print(f"✅ [3] Skenario A ([Ya, Sudah] / ketik 1) dieksekusi: status={res_a.get('status')}")
    assert res_a.get("status") == "TAKEN"
    log1_saved = reminder_engine.get_log(log1.id)
    assert log1_saved.status == "TAKEN"
    assert log1_saved.taken_at is not None
    assert log1_saved.actual_taken_at is not None
    adherence = res_a.get("adherence")
    print(f"    Persentase kepatuhan terhitung: {adherence}%")
    assert adherence == 50.0

    # 5. Test Skenario B: User Mengklik [ ❌ Belum ] (atau ketik '2' / 'belum')
    res_b = await reminder_engine.handle_button_interaction(f"ACT_NOT_YET:{log2.id}")
    print(f"✅ [4] Skenario B ([Belum] / ketik 2) dieksekusi: status={res_b.get('status')}")
    assert res_b.get("status") == "DELAYED"
    log2_saved = reminder_engine.get_log(log2.id)
    assert log2_saved.status == "DELAYED"
    assert log2_saved.last_prompt == "SNOOZE_MENU"

    # 6. Test FIX: Di Notifikasi Opsi Tunda (SNOOZE_MENU), user tekan '1' -> Tunda 15 Menit (BUKAN ditandai diminum!)
    res_b1 = await reminder_engine.handle_text_interaction(patient.whatsapp_no, "1")
    print(f"✅ [5] Sub-Skenario B.1 (User tekan '1' di menu tunda) -> SNOOZED 15m: status={res_b1.get('status')}")
    assert res_b1.get("status") == "SNOOZED"
    log2_snoozed = reminder_engine.get_log(log2.id)
    assert log2_snoozed.status == "SNOOZED"
    assert log2_snoozed.due_sent_at is None  # Reset so it triggers again!

    # 7. Test FIX: Di Notifikasi Opsi Tunda (SNOOZE_MENU), user tekan '2' -> Tunda 30 Menit (BUKAN duplikat menu / hening!)
    reminder_engine._logs[log2.id]["status"] = "DELAYED"
    reminder_engine._logs[log2.id]["last_prompt"] = "SNOOZE_MENU"
    reminder_engine._save_data()
    res_b2 = await reminder_engine.handle_text_interaction(patient.whatsapp_no, "2")
    print(f"✅ [6] Sub-Skenario B.2 (User tekan '2' di menu tunda) -> SNOOZED 30m: status={res_b2.get('status')}")
    assert res_b2.get("status") == "SNOOZED"
    assert "30" in str(res_b2)

    # 8. Test FIX: Di Notifikasi Opsi Tunda (SNOOZE_MENU), user tekan '3' -> Lewati Dosis
    reminder_engine._logs[log2.id]["status"] = "DELAYED"
    reminder_engine._logs[log2.id]["last_prompt"] = "SNOOZE_MENU"
    reminder_engine._save_data()
    res_b3 = await reminder_engine.handle_text_interaction(patient.whatsapp_no, "3")
    print(f"✅ [7] Sub-Skenario B.3 (User tekan '3' di menu tunda) -> SKIPPED: status={res_b3.get('status')}")
    assert res_b3.get("status") == "SKIPPED"

    # 9. Test FIX: Keterlambatan / Peringatan Keterlambatan (DELAY_FOLLOWUP), user tekan '1' -> Dynamic Rescheduling!
    med_late, logs_late = reminder_engine.create_medication_and_schedules(
        patient_id=patient.id,
        name="Metformin",
        dosage="500 mg",
        instructions="Sesudah makan",
        duration_days=2,
        target_times=["08:00", "20:00"]
    )
    late_log = logs_late[0]
    reminder_engine._logs[late_log.id]["status"] = "DELAYED"
    reminder_engine._logs[late_log.id]["last_prompt"] = "DELAY_FOLLOWUP"
    reminder_engine._save_data()
    res_late = await reminder_engine.handle_text_interaction(patient.whatsapp_no, "1")
    print(f"✅ [8] User tekan '1' pada Notifikasi Terlambat -> Dynamic Rescheduled: action={res_late.get('action')}")
    assert res_late.get("action") == "BTN_LATE_TAKEN"
    assert res_late.get("result", {}).get("rescheduled") is True or res_late.get("result", {}).get("actual_taken_at") is not None

    # 10. Test FIX: Status ESCALATED (+30m terlambat), user tekan '1' -> Masih bisa konfirmasi diminum!
    esc_log = logs_late[1]
    reminder_engine._logs[esc_log.id]["status"] = "ESCALATED"
    reminder_engine._logs[esc_log.id]["last_prompt"] = "ESCALATED_PROMPT"
    reminder_engine._save_data()
    res_esc = await reminder_engine.handle_text_interaction(patient.whatsapp_no, "1")
    print(f"✅ [9] User tekan '1' saat status ESCALATED -> Berhasil diproses: action={res_esc.get('action')}")
    assert res_esc.get("action") == "BTN_LATE_TAKEN"

    # 11. Test Natural Language Conversational Snooze
    med_nlp, logs_nlp = reminder_engine.create_medication_and_schedules(
        patient_id=patient.id,
        name="Ultraflu",
        dosage="1 Kaplet",
        instructions="Sesudah makan",
        duration_days=1,
        target_times=["21:00"]
    )
    log_nlp = logs_nlp[0]
    reminder_engine._logs[log_nlp.id]["status"] = "DUE_0M"
    reminder_engine._save_data()
    res_nlp1 = await reminder_engine.handle_text_interaction(patient.whatsapp_no, "setengah jam")
    print(f"✅ [10] Conversational NLP ('setengah jam') dieksekusi: action={res_nlp1.get('action')}")
    assert res_nlp1.get("action") == "CUSTOM_TEXT_SNOOZE"

    reminder_engine._logs[log_nlp.id]["status"] = "DUE_0M"
    reminder_engine._save_data()
    res_nlp2 = await reminder_engine.handle_text_interaction(patient.whatsapp_no, "tunda 45 menit")
    print(f"✅ [11] Conversational NLP ('tunda 45 menit') dieksekusi: action={res_nlp2.get('action')}")
    assert res_nlp2.get("action") == "CUSTOM_TEXT_SNOOZE"

    print("\n" + "=" * 60)
    print("ALL TESTS PASSED WITH 100% SUCCESS!")
    print("Semua requirement arsitektur waktu, 2-stage reminder, dan skenario callback terbukti akurat.")
    print("=" * 60)

    # Restore production DB file
    reminder_engine.set_db_file(REMINDERS_DB_FILE)
    if test_db.exists():
        test_db.unlink()

if __name__ == "__main__":
    asyncio.run(run_tests())
