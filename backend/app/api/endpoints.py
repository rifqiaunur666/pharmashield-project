"""
app/api/endpoints.py
PharmaShield — Central API Router.

Features:
- Authentication: /auth/register, /auth/login, /auth/me, /auth/forgot-password, /auth/reset-password
- Medical Profile: /auth/profile (GET, PUT)
- Scanner Engine: /scan-medicine (Single packaging image upload + personalized safety analysis)
- History: /history (GET, DELETE), /history/{id} (DELETE)
- Statistics: /stats (GET)
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.config import settings
from app.services.auth_service import (
    MedicalProfile,
    PasswordResetConfirm,
    PasswordResetRequest,
    UserLoginRequest,
    UserRegisterRequest,
    authenticate_user,
    create_password_reset_token,
    decode_access_token,
    get_user_by_email,
    get_user_by_id,
    register_user,
    reset_password_with_token,
    update_medical_profile,
)
from app.services.ocr_service import extract_medicine_info, load_medicines_catalog
from app.services.personalized_safety import assess_personalized_safety
from app.services.safety_evaluator import evaluate_consumption_safety, evaluate_safety
from app.services.wa_service import send_whatsapp_alert


logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Auth Dependency Helper ──────────────────────────────────────────────────

async def get_current_user_optional(authorization: Optional[str] = Header(None)) -> Optional[dict[str, Any]]:
    """Extract user payload if valid Bearer token provided."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return get_user_by_id(user_id)


async def get_current_user_required(authorization: Optional[str] = Header(None)) -> dict[str, Any]:
    """Require valid authenticated Bearer token."""
    user = await get_current_user_optional(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sesi autentikasi tidak valid atau telah berakhir.")
    return user


# ─── History Storage Persistence ──────────────────────────────────────────────

def _get_history_file() -> Path:
    path = settings.history_file
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _load_history_from_disk() -> list[dict[str, Any]]:
    file_path = _get_history_file()
    if not file_path.exists():
        return []
    try:
        content = file_path.read_text(encoding="utf-8").strip()
        if not content:
            return []
        data = json.loads(content)
        return data if isinstance(data, list) else []
    except Exception as exc:
        logger.error("[History] Error reading history file: %s", exc)
        return []


def _save_history_to_disk(items: list[dict[str, Any]]) -> None:
    trimmed = items[:300]
    payload = json.dumps(trimmed, ensure_ascii=False, indent=2)

    primary = _get_history_file()
    primary.write_text(payload, encoding="utf-8")

    try:
        settings.legacy_history_file.parent.mkdir(parents=True, exist_ok=True)
        settings.legacy_history_file.write_text(payload, encoding="utf-8")
    except Exception as exc:
        logger.debug("[History] Legacy mirror write skipped: %s", exc)


def _append_history_item(entry: dict[str, Any]) -> None:
    items = _load_history_from_disk()
    items.insert(0, entry)
    _save_history_to_disk(items)


# ─── Authentication Endpoints ────────────────────────────────────────────────

@router.post("/auth/register", summary="Register new user account")
async def api_register(req: UserRegisterRequest):
    success, msg, user_data = register_user(req)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return JSONResponse(content={"success": True, "message": msg, "user": user_data})


@router.post("/auth/login", summary="Login with email and password")
async def api_login(req: UserLoginRequest):
    success, msg, user_data = authenticate_user(req)
    if not success:
        raise HTTPException(status_code=401, detail=msg)
    return JSONResponse(content={"success": True, "message": msg, "user": user_data})


@router.get("/auth/me", summary="Get current logged in user and medical profile")
async def api_me(user: dict[str, Any] = Depends(get_current_user_required)):
    user_out = {
        "id": user["id"],
        "full_name": user.get("full_name"),
        "email": user.get("email"),
        "is_verified": user.get("is_verified", True),
        "medical_profile": user.get("medical_profile", {}),
    }
    return JSONResponse(content=user_out)


@router.put("/auth/profile", summary="Update user medical profile")
async def api_update_profile(
    profile: MedicalProfile,
    user: dict[str, Any] = Depends(get_current_user_required),
):
    success, msg, updated = update_medical_profile(user["id"], profile)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return JSONResponse(content={"success": True, "message": msg, "medical_profile": updated})


@router.post("/auth/forgot-password", summary="Request password reset token")
async def api_forgot_password(req: PasswordResetRequest):
    user = get_user_by_email(req.email)
    reset_token = None
    if user:
        reset_token = create_password_reset_token(req.email)
    # Generic message to protect account enumeration
    return JSONResponse(content={
        "success": True,
        "message": "Jika email terdaftar, instruksi pemulihan telah dikirimkan.",
        "reset_token": reset_token, # Available in dev environment
    })


@router.post("/auth/reset-password", summary="Reset password using token")
async def api_reset_password(req: PasswordResetConfirm):
    success, msg = reset_password_with_token(req.reset_token, req.new_password)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return JSONResponse(content={"success": True, "message": msg})


# ─── Scanner Endpoints ───────────────────────────────────────────────────────

@router.post("/scan-medicine", summary="Scan medicine packaging (Single packaging image)")
async def scan_medicine(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(None, description="Foto kemasan obat (JPG/PNG/WEBP)"),
    files: Optional[list[UploadFile]] = File(None, description="Upload fallback"),
    patient_profile_json: Optional[str] = Form(None, description="Serialized patient medical profile"),
    user_optional: Optional[dict[str, Any]] = Depends(get_current_user_optional),
):
    """
    Accept single medicine packaging image, execute computer vision preprocessing & OCR,
    cross-reference authoritative Indonesian medicines database, evaluate personalized safety,
    and persist history linked to the user session.
    """
    # Accept file (or first item if files sent by legacy client)
    upload_target = file
    if not upload_target and files and len(files) > 0:
        upload_target = files[0]

    if not upload_target:
        raise HTTPException(
            status_code=400,
            detail="Tidak ada file gambar yang diunggah. Silakan pilih 1 foto kemasan obat.",
        )

    try:
        image_bytes = await upload_target.read()
    except Exception as exc:
        logger.error("[Scan] Failed reading file stream: %s", exc)
        raise HTTPException(status_code=400, detail="Gagal membaca file gambar.")

    if not image_bytes or len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="File gambar kosong.")

    if len(image_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Ukuran gambar maksimal 20 MB.")

    scan_id = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    now_display = datetime.now().strftime("%d %B %Y %H:%M WIB")

    # 1. Computer Vision & OCR Extraction
    try:
        ocr_result = extract_medicine_info(image_bytes)
    except Exception as exc:
        logger.exception("[Scan] OCR processing unexpected error: %s", exc)
        ocr_result = {
            "raw_text": f"Gagal memproses gambar: {exc}",
            "medicine_name": "Kemasan Tidak Teridentifikasi",
            "generic_name": None,
            "expiry_date": None,
            "mfg_date": None,
            "ocr_confidence": 0.0,
            "match_confidence": 0.0,
            "overall_confidence": 0.0,
            "is_unreadable": True,
            "unreadable_reason": "Format berkas tidak didukung atau terjadi kesalahan sistem OCR.",
            "dosage_instructions": None,
            "has_dosage_instructions": False,
            "has_severe_warning": True,
            "detected_warnings": ["Gambar kemasan tidak dapat diproses secara normal."],
            "matched_catalog": None,
            "dosage_strength": None,
            "dosage_form": None,
            "storage_info": None,
            "bpom_registration": None,
            "contraindications": [],
            "preprocessing_applied": ["Error"],
            "skew_angle_corrected": 0.0,
        }

    medicine_name = ocr_result.get("medicine_name")
    expiry_date = ocr_result.get("expiry_date")
    raw_text = ocr_result.get("raw_text", "")
    ocr_confidence = ocr_result.get("ocr_confidence", 0.0)
    is_unreadable = ocr_result.get("is_unreadable", False)
    unreadable_reason = ocr_result.get("unreadable_reason")
    has_dosage = ocr_result.get("has_dosage_instructions", True)
    has_severe = ocr_result.get("has_severe_warning", False)
    detected_warnings = ocr_result.get("detected_warnings", [])
    matched_catalog = ocr_result.get("matched_catalog") or {}
    overall_conf = ocr_result.get("overall_confidence", ocr_confidence)
    bpom_class = matched_catalog.get("bpom_class") or ocr_result.get("bpom_class")

    # 2. Consumption Safety Evaluation (Baseline)
    safety = evaluate_consumption_safety(
        medicine_name=medicine_name,
        overall_confidence=overall_conf,
        has_dosage_instructions=has_dosage,
        has_severe_warning=has_severe,
        is_unreadable=is_unreadable,
        unreadable_reason=unreadable_reason,
        bpom_class=bpom_class,
    )

    # 3. Personalized Medical Profile Integration
    user_medical_profile = None
    user_id = user_optional.get("id") if user_optional else None
    user_name = user_optional.get("full_name") if user_optional else None

    if user_optional and user_optional.get("medical_profile"):
        user_medical_profile = user_optional.get("medical_profile")
    elif patient_profile_json:
        try:
            user_medical_profile = json.loads(patient_profile_json)
        except Exception:
            user_medical_profile = None

    # Calculate image quality estimation (0-100)
    img_quality = int(round(ocr_confidence * 95)) if not is_unreadable else 45

    identified = bool(
        medicine_name
        and not is_unreadable
        and medicine_name != "Kemasan Tidak Teridentifikasi"
        and safety["readability_status"] != "tidak_teridentifikasi"
    )

    med_info_dict = {
        "name": medicine_name,
        "medicine_name": medicine_name,
        "ingredients": matched_catalog.get("ingredients", []),
        "raw_text": raw_text,
        "overall_confidence": overall_conf,
        "bpom_class": bpom_class,
        "has_severe_warning": has_severe,
        "matched_catalog": matched_catalog,
        "identified": identified,
    }

    # Run Layered Clinical Assessment
    clinical_assessment = assess_personalized_safety(
        medicine_info=med_info_dict,
        user_medical_profile=user_medical_profile,
        image_quality_score=img_quality,
    )

    # Status: green | yellow | red | gray
    final_status = clinical_assessment["final_status"]
    final_status_id = clinical_assessment["status_id"]
    final_status_emoji = clinical_assessment["status_emoji"]

    purpose = matched_catalog.get("purpose", "")
    usage = matched_catalog.get("usage", ocr_result.get("dosage_instructions") or "")
    ingredients = matched_catalog.get("ingredients", [])
    side_effects = matched_catalog.get("side_effects", [])
    all_warnings = list(set(detected_warnings + matched_catalog.get("warnings", [])))

    # Enhanced Verified Attributes (Tahap D Requirements)
    generic_name = matched_catalog.get("generic_name") or ocr_result.get("generic_name") or medicine_name
    brand_names = matched_catalog.get("brand_names") or matched_catalog.get("aliases") or []
    dosage_strength = matched_catalog.get("dosage_strength") or ocr_result.get("dosage_strength") or "Periksa label kemasan"
    dosage_form = matched_catalog.get("dosage_form") or ocr_result.get("dosage_form") or "Sediaan obat"
    contraindications = matched_catalog.get("contraindications") or ocr_result.get("contraindications") or []
    storage_info = (
        matched_catalog.get("storage_info")
        or ocr_result.get("storage_info")
        or "Simpan pada tempat kering dan sejuk di bawah 30°C, hindari sinar matahari langsung."
    )
    bpom_reg = (
        matched_catalog.get("bpom_registration")
        or ocr_result.get("bpom_registration")
        or ("Terdaftar Resmi BPOM" if matched_catalog else "Pemeriksaan fisik diperlukan")
    )
    bpom_status = "Terverifikasi Resmi BPOM" if (matched_catalog and matched_catalog.get("bpom_registration")) else (
        "Terdeteksi pada Kemasan" if ocr_result.get("bpom_registration") else "Pemeriksaan Fisik Diperlukan"
    )
    data_source = "Basis Data Resmi Obat & BPOM Indonesia" if matched_catalog else "Ekstraksi OCR Label Kemasan"

    response_data: dict[str, Any] = {
        "scan_id": scan_id,
        "user_id": user_id,
        "user_name": user_name,
        "scanned_at": now_iso,
        "scanned_at_formatted": now_display,
        "identified": identified,
        "name": medicine_name,
        "medicine_name": medicine_name,
        "generic_name": generic_name,
        "brand_names": brand_names,
        "category": matched_catalog.get("category", "Pengobatan Umum"),
        "bpom_class": bpom_class or "Pemeriksaan Fisik Diperlukan",
        "dosage_strength": dosage_strength,
        "dosage_form": dosage_form,
        "purpose": purpose,
        "usage": usage,
        "ingredients": ingredients,
        "side_effects": side_effects,
        "warnings": all_warnings,
        "contraindications": contraindications,
        "storage_info": storage_info,
        "bpom_registration": bpom_reg,
        "bpom_status": bpom_status,
        "data_source": data_source,
        "data_updated_at": "Oktober 2026",
        "disclaimer": "Informasi ini bersifat edukasi dan bukan pengganti konsultasi dengan dokter atau apoteker. Jangan mengubah dosis tanpa arahan profesional kesehatan.",
        "readability_status": safety["readability_status"],
        "readability_label": safety["readability_label"],
        "is_safe_to_consume": (final_status == "green"),
        "risk_level": "Rendah" if final_status == "green" else ("Tinggi (Berisiko)" if final_status == "red" else "Sedang"),
        "confidence_percentage": clinical_assessment["confidence_percentage"],
        "status": final_status,
        "status_id": final_status_id,
        "status_emoji": final_status_emoji,
        # Direct user schema fields for strict compatibility
        "status_keamanan": "AMAN" if final_status == "green" else ("PERLU HATI-HATI" if final_status == "yellow" else "TIDAK TERIDENTIFIKASI"),
        "confidence_score": clinical_assessment["confidence_percentage"],
        "nama_produk": medicine_name,
        "golongan_bpom": bpom_class or "Obat Bebas",
        "kekuatan_dosis": dosage_strength,
        "bentuk_sediaan": dosage_form,
        "nomor_registrasi_bpom": bpom_reg,
        "status_registrasi": bpom_status,
        "indikasi_medis": purpose,
        "aturan_penggunaan": usage,
        "kandungan_zat_aktif": ", ".join(ingredients) if ingredients else (generic_name or ""),
        "informasi_penyimpanan": storage_info,
        "peringatan_keselamatan": "; ".join(all_warnings) if all_warnings else "Gunakan sesuai aturan pakai pada kemasan.",
        "shelf_life_note": clinical_assessment["headline"],
        "recommendation": safety["recommendation"],
        "ocr_confidence": ocr_confidence,
        "match_confidence": ocr_result.get("match_confidence", 0.0),
        "overall_confidence": overall_conf,
        "preprocessing_applied": ocr_result.get("preprocessing_applied", []),
        "skew_angle_corrected": ocr_result.get("skew_angle_corrected", 0.0),
        "raw_text": raw_text,
        # Core Task 3 Verification Outputs
        "matched_drug": ocr_result.get("matched_drug") or (matched_catalog if matched_catalog else None),
        "confidence_score": ocr_result.get("confidence_score") or clinical_assessment["confidence_percentage"],
        "extracted_text": ocr_result.get("extracted_text") or raw_text,
        "alternative_suggestions": ocr_result.get("alternative_suggestions", []),
        "retake_prompt": ocr_result.get("retake_prompt"),
        "match_priority": ocr_result.get("match_priority", "unmatched"),
        "applied_algorithms": ocr_result.get("applied_algorithms", []),
        "roi_regions": ocr_result.get("roi_regions", []),
        "clinical_assessment": clinical_assessment,
        "notes": [f"Kemasan obat dipindai: {upload_target.filename or 'scan_kemasan.jpg'}"],
    }

    # 4. Persist to history
    try:
        history_entry = {k: v for k, v in response_data.items() if k != "raw_text"}
        _append_history_item(history_entry)
    except Exception as exc:
        logger.error("[Scan] Failed to persist scan history: %s", exc)

    # 5. Background WhatsApp Alert
    wa_payload = {
        "medicine_name": medicine_name,
        "expiry_date": expiry_date,
        "status": final_status,
        "status_id": final_status_id,
        "status_emoji": final_status_emoji,
        "days_remaining": safety.get("days_remaining", 90),
        "shelf_life_note": clinical_assessment["headline"],
        "recommendation": safety["recommendation"],
        "scan_time": now_display,
    }
    background_tasks.add_task(send_whatsapp_alert, **wa_payload)

    return JSONResponse(content=response_data, status_code=200)


@router.post("/verify-medicine", summary="High-Accuracy OCR & Intelligent Medicine Verification Pipeline")
async def verify_medicine_endpoint(
    image: Optional[UploadFile] = File(None),
    raw_text: Optional[str] = Form(None),
):
    """
    Direct endpoint for Task 2 & Task 3 verification requirements:
    1. Multi-stage image enhancement (noise reduction, CLAHE, deskewing, glare removal)
    2. Deep learning OCR & ROI detection
    3. Intelligent multi-algorithm fuzzy matching (Levenshtein, Jaro-Winkler, RapidFuzz, Trigram)
    4. Multi-field fallback (Brand name -> Generic name -> Top-3 suggestions)
    5. Adaptive thresholding:
       - >= 85%: Matched drug confirmed
       - 60%–84%: Alternative suggestions returned
       - < 60%: User retake photo prompt
    """
    from app.services.matching_service import verification_engine

    extracted_content = ""
    ocr_result: dict[str, Any] = {}

    if image:
        try:
            image_bytes = await image.read()
            if not image_bytes:
                raise HTTPException(status_code=400, detail="File gambar kosong.")
            ocr_result = extract_medicine_info(image_bytes)
            extracted_content = ocr_result.get("raw_text", "")
        except Exception as exc:
            logger.error("[Verify] Image processing error: %s", exc)
            raise HTTPException(status_code=400, detail=f"Gagal memproses gambar: {exc}")
    elif raw_text:
        extracted_content = raw_text.strip()
    else:
        raise HTTPException(
            status_code=400,
            detail="Wajib mengunggah file gambar (multipart 'image') atau teks OCR ('raw_text').",
        )

    # If raw_text directly provided, run verification engine
    if raw_text and not image:
        ver_res = verification_engine.verify_extracted_text(extracted_content)
        return JSONResponse(
            status_code=200,
            content={
                "matched_drug": ver_res.matched_drug,
                "confidence_score": round(ver_res.confidence_score, 1),
                "extracted_text": ver_res.extracted_text,
                "status": ver_res.status,
                "match_priority": ver_res.match_priority,
                "alternative_suggestions": ver_res.alternative_suggestions,
                "retake_prompt": ver_res.retake_prompt,
                "applied_algorithms": ver_res.applied_algorithms,
                "roi_regions": [],
                "preprocessing_applied": ["Direct text input verification"],
            },
        )

    # Return full image pipeline extraction
    status = "matched" if ocr_result.get("confidence_score", 0) >= 85.0 else (
        "uncertain" if ocr_result.get("confidence_score", 0) >= 60.0 else "low_confidence"
    )

    return JSONResponse(
        status_code=200,
        content={
            "matched_drug": ocr_result.get("matched_drug"),
            "confidence_score": ocr_result.get("confidence_score", 0.0),
            "extracted_text": ocr_result.get("extracted_text", extracted_content),
            "status": status,
            "match_priority": ocr_result.get("match_priority", "unmatched"),
            "alternative_suggestions": ocr_result.get("alternative_suggestions", []),
            "retake_prompt": ocr_result.get("retake_prompt"),
            "applied_algorithms": ocr_result.get("applied_algorithms", []),
            "roi_regions": ocr_result.get("roi_regions", []),
            "preprocessing_applied": ocr_result.get("preprocessing_applied", []),
            "skew_angle_corrected": ocr_result.get("skew_angle_corrected", 0.0),
        },
    )


@router.get("/medicines", summary="Search and list verified medicines")
async def get_medicines_catalog_endpoint(
    q: Optional[str] = None,
    category: Optional[str] = None,
    status_bpom: Optional[str] = None,
    limit: Optional[int] = None,
):
    """
    Search and filter medicines from the 1,000+ authoritative Indonesian medicine database.
    Supports search across nama_obat, merk, zat_aktif, kategori_penyakit, and indikasi_kegunaan.
    """
    catalog = load_medicines_catalog()
    filtered = catalog

    # 1. Filter by category if requested
    if category and category.strip() and category.lower() != "all":
        cat_low = category.strip().lower()
        filtered = [
            m for m in filtered
            if cat_low in (m.get("kategori_penyakit") or "").lower()
            or cat_low in (m.get("category") or "").lower()
            or cat_low in (m.get("categoryLabel") or "").lower()
        ]

    # 2. Filter by status_bpom if requested
    if status_bpom and status_bpom.strip() and status_bpom.lower() != "all":
        bpom_low = status_bpom.strip().lower()
        filtered = [
            m for m in filtered
            if bpom_low in (m.get("status_bpom") or "").lower()
            or bpom_low in (m.get("bpom_class") or "").lower()
        ]

    # 3. Filter by text search query across multiple fields
    if q and q.strip():
        q_lower = q.lower().strip()
        matching_items = []
        for med in filtered:
            nama_match = q_lower in (med.get("nama_obat") or med.get("name") or "").lower()
            merk_match = q_lower in (med.get("merk") or "").lower() or any(q_lower in str(b).lower() for b in med.get("brand_names", []))
            zat_match = q_lower in (med.get("zat_aktif") or med.get("generic_name") or "").lower()
            indikasi_match = q_lower in (med.get("indikasi_kegunaan") or med.get("purpose") or med.get("indications") or "").lower()
            cat_match = q_lower in (med.get("kategori_penyakit") or med.get("category") or "").lower()
            alias_match = any(q_lower in str(a).lower() for a in med.get("aliases", []))
            
            if nama_match or merk_match or zat_match or indikasi_match or cat_match or alias_match:
                matching_items.append(med)
        filtered = matching_items

    total_count = len(filtered)
    if limit and limit > 0:
        filtered = filtered[:limit]

    return JSONResponse(content={"total": total_count, "medicines": filtered})


@router.post("/interactions", summary="Check drug-drug interactions between multiple medicines")
async def api_check_drug_interactions(req_body: dict[str, Any]):
    """
    Check drug-drug interactions, duplicates, and clinical contraindications
    for 2 or more medicines provided as an array of names.
    """
    from app.services.drug_interaction_service import check_drug_interactions
    drug_names = req_body.get("drugs") or req_body.get("drug_names") or []
    if not isinstance(drug_names, list):
        raise HTTPException(status_code=400, detail="'drugs' harus berupa array nama obat.")
    
    result = check_drug_interactions(drug_names)
    return JSONResponse(content=result, status_code=200)



# ─── History & Stats Endpoints ───────────────────────────────────────────────

@router.get("/history", summary="Get scan history and statistics")
async def get_history(user_optional: Optional[dict[str, Any]] = Depends(get_current_user_optional)):
    all_items = _load_history_from_disk()

    # If logged in user, filter items associated with user, or return all for guest/single-tenant
    if user_optional and user_optional.get("id"):
        uid = user_optional["id"]
        # Include items belonging to user or created before auth was set
        items = [i for i in all_items if i.get("user_id") == uid or not i.get("user_id")]
    else:
        items = all_items

    total = len(items)
    safe_count = sum(1 for i in items if i.get("status") == "green")
    warning_count = sum(1 for i in items if i.get("status") == "yellow")
    danger_count = sum(1 for i in items if i.get("status") in ("red", "gray"))

    return JSONResponse(
        content={
            "total": total,
            "safe": safe_count,
            "warning": warning_count,
            "expired": danger_count,
            "danger": danger_count,
            "items": items,
        },
        status_code=200,
    )


@router.get("/stats", summary="Get dashboard summary metrics")
async def get_stats():
    items = _load_history_from_disk()
    return JSONResponse(
        content={
            "total": len(items),
            "safe": sum(1 for i in items if i.get("status") == "green"),
            "warning": sum(1 for i in items if i.get("status") == "yellow"),
            "danger": sum(1 for i in items if i.get("status") in ("red", "gray")),
        },
        status_code=200,
    )


@router.delete("/history/{scan_id}", summary="Delete single history entry")
async def delete_history_item(scan_id: str):
    items = _load_history_from_disk()
    filtered = [i for i in items if i.get("scan_id") != scan_id and i.get("id") != scan_id]

    if len(filtered) == len(items):
        raise HTTPException(status_code=404, detail="Riwayat tidak ditemukan.")

    _save_history_to_disk(filtered)
    return JSONResponse(content={"success": True, "message": "Entri berhasil dihapus."})


@router.delete("/history", summary="Clear all scan history")
async def clear_all_history():
    _save_history_to_disk([])
    return JSONResponse(content={"success": True, "message": "Semua riwayat berhasil dihapus."})
