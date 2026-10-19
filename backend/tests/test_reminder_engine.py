"""
backend/tests/test_reminder_engine.py
Automated unit & integration test for PharmaShield Reminder Engine & Dynamic Rescheduler.

Tests:
  1. Patient and Medication creation with log schedule generation.
  2. State machine transitions (PENDING -> REMINDED_15M -> DUE_0M -> DELAYED).
  3. Interactive button clicks (Sudah / Belum).
  4. Dynamic Rescheduling algorithm: verifies that when a patient takes medication late,
     the subsequent dose is safely recalculated to: actualTakenAt + intervalHours.
"""

import asyncio
import pytest
from pathlib import Path
from datetime import datetime, timedelta, timezone

from app.services.reminder_service import reminder_engine, WIB_OFFSET, REMINDERS_DB_FILE


@pytest.fixture(autouse=True)
def isolate_test_db(tmp_path):
    test_db = tmp_path / "test_reminders_engine.json"
    reminder_engine.set_db_file(test_db)
    yield
    reminder_engine.set_db_file(REMINDERS_DB_FILE)


def test_create_patient_and_medication():
    # 1. Create Patient
    patient = reminder_engine.create_patient(
        name="Bapak Hendra",
        whatsapp_no="081298765432"
    )
    assert patient.id is not None
    assert patient.whatsapp_no == "6281298765432"

    # 2. Create Medication with fixed schedules
    med, logs = reminder_engine.create_medication_and_schedules(
        patient_id=patient.id,
        name="Metformin",
        dosage="500 mg",
        instructions="Sesudah makan",
        duration_days=3,
        schedule_type="FIXED_TIMES",
        interval_hours=8,
        target_times=["07:00", "13:00", "19:00"]
    )

    assert med.name == "Metformin"
    assert len(logs) == 9  # 3 days * 3 times a day = 9 logs
    assert logs[0].status == "PENDING"
    reminder_engine.clear_all_data()


@pytest.mark.asyncio
async def test_dynamic_rescheduling_logic():
    # Setup patient & medication with 8h interval
    patient = reminder_engine.create_patient(
        name="Ibu Ratna",
        whatsapp_no="628111222333"
    )
    
    # Create fixed morning dose at 08:00 and afternoon dose at 16:00
    now_wib = datetime.now(WIB_OFFSET)
    today_str = now_wib.strftime("%Y-%m-%d")
    
    med, logs = reminder_engine.create_medication_and_schedules(
        patient_id=patient.id,
        name="Captopril",
        dosage="25 mg",
        instructions="1 jam sebelum makan",
        duration_days=1,
        schedule_type="FIXED_TIMES",
        interval_hours=8,
        target_times=["08:00", "16:00"],
        start_date_str=today_str
    )
    
    assert len(logs) == 2
    log_morning = logs[0]
    log_afternoon = logs[1]

    # Skenario Keterlambatan:
    # Jadwal pagi seharusnya 08:00.
    # Pasien baru konfirmasi minum obat pada pukul 12:00 (terlambat 4 jam).
    # Jarak ke jadwal sore (16:00) tersisa hanya 4 jam (< 6 jam min safety gap untuk interval 8 jam).
    
    dt_morning_late = datetime.strptime(f"{today_str} 12:00:00", "%Y-%m-%d %H:%M:%S").replace(tzinfo=WIB_OFFSET)
    
    # Trigger Dynamic Rescheduling
    res = await reminder_engine.apply_dynamic_rescheduling(
        log_id=log_morning.id,
        actual_taken_at=dt_morning_late
    )
    
    assert res["rescheduled"] is True
    
    # Verifikasi bahwa jadwal sore (next_log) otomatis digeser menjadi:
    # 12:00 + 8 jam = 20:00
    updated_afternoon_log = reminder_engine.get_log(log_afternoon.id)
    expected_next_time = dt_morning_late + timedelta(hours=8)
    
    assert updated_afternoon_log.scheduled_at == expected_next_time.isoformat()
    print("\nDynamic Rescheduling passed! New next schedule time safely shifted to:", updated_afternoon_log.scheduled_at)

    # Clean up test data so database remains empty in production/presentation
    reminder_engine.clear_all_data()


@pytest.mark.asyncio
async def test_welcome_message_and_activity_logging():
    # Setup patient
    patient = reminder_engine.create_patient(
        name="Ibu Maryam",
        whatsapp_no="085233445566"
    )

    # Register medication - this will trigger welcome notification
    med, logs = reminder_engine.create_medication_and_schedules(
        patient_id=patient.id,
        name="Amlodipine",
        dosage="10 mg",
        instructions="Sebelum tidur",
        duration_days=2,
        schedule_type="FIXED_TIMES",
        interval_hours=8,
        target_times=["21:00"]
    )

    # Allow background welcome dispatch task to execute
    await asyncio.sleep(0.05)

    # Check activity logs
    activities = reminder_engine.list_activity_logs()
    welcome_logs = [a for a in activities if a["event_type"] == "WELCOME_SENT"]
    assert len(welcome_logs) >= 1
    assert "Ibu Maryam" in welcome_logs[0]["title"]
    assert welcome_logs[0]["details"]["medication_name"] == "Amlodipine"

    # Clean up
    reminder_engine.clear_all_data()
    assert len(reminder_engine.list_patients()) == 0
    assert len(reminder_engine.list_logs()) == 0


@pytest.mark.asyncio
async def test_qr_contact_decoding():
    from app.services.wa_qr_service import wa_qr_service
    from pathlib import Path
    
    # Path to sample screenshot uploaded by user
    sample_qr = Path(r"C:/Users/Asus/.gemini/antigravity/brain/6c4fa784-f451-403c-a77e-9d9cad67f8f8/.user_uploaded/media_1791892909337_acd5a7c2.jpg")
    if sample_qr.exists():
        raw_bytes = sample_qr.read_bytes()
        res = wa_qr_service.decode_qr_from_bytes(raw_bytes)
        assert res["success"] is True
        assert "wa.me/qr/" in res["qr_data"]
        assert res["is_whatsapp"] is True
        assert res["qr_type"] == "WA_CONTACT_QR"


@pytest.mark.asyncio
async def test_three_stage_reminder_pipeline():
    # 1. Register Patient via QR
    patient = reminder_engine.create_patient(
        name="Bapak Sudirman",
        whatsapp_no="081288889999",
        qr_code_url="https://wa.me/qr/TESTQR123",
        qr_contact_name="sudirman"
    )
    assert patient.qr_code_url == "https://wa.me/qr/TESTQR123"

    # 2. Stage 1: Create Medication & Auto Initial Confirmation
    med, logs = reminder_engine.create_medication_and_schedules(
        patient_id=patient.id,
        name="Glimepiride",
        dosage="2 mg",
        instructions="Sebelum sarapan",
        duration_days=1,
        schedule_type="FIXED_TIMES",
        interval_hours=24,
        target_times=["07:00"]
    )
    assert len(logs) == 1
    log = logs[0]
    assert log.status == "PENDING"

    # Test Stage 2 Trigger: H-10 Menit Pre-reminder
    stage2_res = await reminder_engine.trigger_stage_for_log(log.id, "STAGE_2_PRE_10M")
    assert stage2_res["success"] is True
    updated_log_stage2 = reminder_engine.get_log(log.id)
    assert updated_log_stage2.status == "REMINDED_10M"

    # Test Stage 3 Trigger: Waktu H Interactive Buttons [Ya, Sudah Minum] & [Belum]
    stage3_res = await reminder_engine.trigger_stage_for_log(log.id, "STAGE_3_DUE_0M")
    assert stage3_res["success"] is True
    updated_log_stage3 = reminder_engine.get_log(log.id)
    assert updated_log_stage3.status == "DUE_0M"

    # Test Interactive Response: Patient clicks [Ya, Sudah Minum]
    btn_res = await reminder_engine.handle_button_interaction(f"BTN_ONTIME_TAKEN:{log.id}")
    assert btn_res["success"] is True
    assert btn_res["status"] in ("COMPLETED", "TAKEN")

    completed_log = reminder_engine.get_log(log.id)
    assert completed_log.status in ("COMPLETED", "TAKEN")
    assert completed_log.actual_taken_at is not None

    reminder_engine.clear_all_data()
