"""
app/services/matching_service.py
================================
Intelligent Multi-Algorithm Fuzzy Text Matching & Verification Engine.

Algorithms:
- Normalized Levenshtein Distance
- Jaro-Winkler Similarity (prefix-weighted)
- RapidFuzz Token Set & Partial Ratio
- Character Trigram / N-gram Similarity
- OCR Character Typo Normalization (0->o, 1->i/l, 3->e, 5->s, rn->m, etc.)

Multi-Field Fallback Architecture:
- Priority 1: Match exact/fuzzy `medicine_name` & `brand_names`
- Priority 2: Match `generic_name` & `ingredients`
- Priority 3: Top-3 closest candidates when confidence is between 60%–84%
- Confidence < 60%: Low-confidence guardrail prompting user photo retake
"""

from __future__ import annotations

import json
import logging
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from rapidfuzz import fuzz
from rapidfuzz.distance import JaroWinkler, Levenshtein

from app.config import settings

logger = logging.getLogger(__name__)

# Character map for common OCR visual misrecognitions
_OCR_CHAR_MAP = str.maketrans({
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "8": "b",
    "@": "a",
    "$": "s",
})


def normalize_ocr_typos(text: str) -> str:
    """
    Normalize common OCR misrecognitions and English-Indonesian medical spelling variations
    (e.g., acetaminophen -> asetaminofen, cephalexin -> sefaleksin, amoxicillin -> amoksisilin).
    """
    if not text:
        return ""
    t = text.lower().translate(_OCR_CHAR_MAP)
    # rn -> m substitution
    t = t.replace("rn", "m")
    # Phonetic medical bridge
    t = t.replace("ph", "f").replace("th", "t").replace("ch", "k")
    t = t.replace("ce", "se").replace("ci", "si").replace("cy", "si")
    t = t.replace("x", "ks")
    # multiple spaces
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def calculate_trigram_similarity(s1: str, s2: str) -> float:
    """Calculate character Trigram similarity between two strings."""
    if not s1 or not s2:
        return 0.0
    s1, s2 = s1.lower().strip(), s2.lower().strip()
    if s1 == s2:
        return 1.0
    if len(s1) < 3 or len(s2) < 3:
        return 1.0 if (s1 in s2 or s2 in s1) else 0.0

    t1 = [s1[i : i + 3] for i in range(len(s1) - 2)]
    t2 = [s2[i : i + 3] for i in range(len(s2) - 2)]
    c1, c2 = Counter(t1), Counter(t2)
    common = sum((c1 & c2).values())
    total = len(t1) + len(t2)
    return (2.0 * common) / total if total > 0 else 0.0


def compute_composite_similarity(text_token: str, candidate_target: str) -> float:
    """
    Compute multi-algorithm composite similarity score (0.0 to 1.0)
    combining Levenshtein, Jaro-Winkler, RapidFuzz, and Trigram.
    """
    t_raw = text_token.lower().strip()
    c_raw = candidate_target.lower().strip()

    if not t_raw or not c_raw:
        return 0.0

    # 1. Exact match shortcut
    if t_raw == c_raw:
        return 1.0

    # 2. Normalized OCR typo check
    t_norm = normalize_ocr_typos(t_raw)
    c_norm = normalize_ocr_typos(c_raw)

    if t_norm == c_norm or t_norm == c_raw or t_raw == c_norm:
        return 0.98

    # 3. Substring containment bonus
    if c_raw in t_raw or c_norm in t_norm:
        # Candidate fully contained in token
        len_ratio = len(c_raw) / max(len(t_raw), 1)
        if len_ratio > 0.70:
            return 0.95
        elif len_ratio > 0.40:
            return 0.90

    # 4. Multi-algorithm metric computation
    # Levenshtein normalized similarity
    lev_score = 1.0 - Levenshtein.normalized_distance(t_norm, c_norm)

    # Jaro-Winkler similarity (rewards common prefixes typical of drug families)
    jw_score = JaroWinkler.similarity(t_norm, c_norm)

    # RapidFuzz token set / ratio
    fuzz_ratio = fuzz.ratio(t_norm, c_norm) / 100.0

    # Trigram similarity
    tri_score = calculate_trigram_similarity(t_norm, c_norm)

    # Weighted ensemble: 35% JaroWinkler + 30% Levenshtein + 20% Fuzz + 15% Trigram
    composite = (jw_score * 0.35) + (lev_score * 0.30) + (fuzz_ratio * 0.20) + (tri_score * 0.15)
    return min(max(composite, 0.0), 1.0)


@dataclass
class AlternativeSuggestion:
    medicine_name: str
    generic_name: str
    category: str
    confidence_score: float
    dosage_and_forms: str = ""
    indications: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "medicine_name": self.medicine_name,
            "generic_name": self.generic_name,
            "category": self.category,
            "confidence_score": round(self.confidence_score, 1),
            "dosage_and_forms": self.dosage_and_forms,
            "indications": self.indications,
        }


@dataclass
class VerificationResult:
    matched_drug: Optional[dict[str, Any]]
    confidence_score: float  # Percentage 0.0 to 100.0
    extracted_text: str
    match_priority: str  # "brand_name" | "generic_name" | "unmatched"
    status: str  # "matched" | "uncertain" | "low_confidence"
    alternative_suggestions: list[dict[str, Any]] = field(default_factory=list)
    retake_prompt: Optional[str] = None
    applied_algorithms: list[str] = field(default_factory=lambda: [
        "Levenshtein Distance",
        "Jaro-Winkler Similarity",
        "RapidFuzz Token Set Ratio",
        "Trigram / N-gram Similarity",
        "OCR Character Typo Normalization",
    ])

    def to_dict(self) -> dict[str, Any]:
        return {
            "matched_drug": self.matched_drug,
            "confidence_score": round(self.confidence_score, 1),
            "extracted_text": self.extracted_text,
            "match_priority": self.match_priority,
            "status": self.status,
            "alternative_suggestions": self.alternative_suggestions,
            "retake_prompt": self.retake_prompt,
            "applied_algorithms": self.applied_algorithms,
        }


class MedicineVerificationEngine:
    """
    In-memory indexed verification engine supporting rapid fuzzy lookup
    across 1,000+ medicine records.
    """

    def __init__(self, catalog_path: Optional[Path] = None):
        self.catalog_path = catalog_path or (settings.database_dir / "medicines.json")
        self._catalog: list[dict[str, Any]] = []
        self._exact_brand_index: dict[str, dict[str, Any]] = {}
        self._exact_generic_index: dict[str, dict[str, Any]] = {}
        self._norm_brand_index: dict[str, dict[str, Any]] = {}
        self._norm_alias_index: dict[str, dict[str, Any]] = {}
        self.reload()

    def reload(self) -> None:
        """Load catalog from disk and construct fast search indices."""
        if not self.catalog_path.exists():
            logger.warning("[Matcher] Catalog not found at %s", self.catalog_path)
            self._catalog = []
            return

        try:
            raw = self.catalog_path.read_text(encoding="utf-8").strip()
            if not raw:
                self._catalog = []
                return
            data = json.loads(raw)
            self._catalog = data if isinstance(data, list) else []
            logger.info("[Matcher] Loaded %d medicines into verification index.", len(self._catalog))
        except Exception as exc:
            logger.error("[Matcher] Error loading medicines catalog: %s", exc)
            self._catalog = []
            return

        # Build in-memory lookup indices
        self._exact_brand_index.clear()
        self._exact_generic_index.clear()
        self._norm_brand_index.clear()
        self._norm_alias_index.clear()

        for med in self._catalog:
            med_name = med.get("medicine_name") or med.get("name") or ""
            gen_name = med.get("generic_name") or ""

            # Ensure unified keys
            med["medicine_name"] = med_name
            med["name"] = med_name
            med["generic_name"] = gen_name

            if med_name:
                self._exact_brand_index[med_name.lower()] = med
                self._norm_brand_index[normalize_ocr_typos(med_name)] = med

                # Also index base name (e.g. "Paracetamol" from "Paracetamol 500mg")
                base_name = re.sub(r"\s+\d+\s*(mg|g|ml|mcg)?\b.*$", "", med_name, flags=re.IGNORECASE).strip()
                if base_name and len(base_name) >= 3 and base_name.lower() not in self._exact_brand_index:
                    self._exact_brand_index[base_name.lower()] = med
                    self._norm_brand_index[normalize_ocr_typos(base_name)] = med

            if gen_name:
                self._exact_generic_index[gen_name.lower()] = med
                base_gen = re.sub(r"\(.*?\)", "", gen_name).strip()
                if base_gen and base_gen.lower() not in self._exact_generic_index:
                    self._exact_generic_index[base_gen.lower()] = med

            aliases = med.get("aliases", []) + med.get("brand_names", []) + med.get("common_misspellings", [])
            med_id = (med.get("id") or "").lower()
            for a in aliases:
                a_str = str(a).lower().strip()
                if len(a_str) >= 3:
                    norm_a = normalize_ocr_typos(a_str)
                    # Don't overwrite if existing entry is already the exact canonical drug (id or primary name)
                    if norm_a in self._norm_alias_index:
                        prev = self._norm_alias_index[norm_a]
                        prev_id = (prev.get("id") or "").lower()
                        prev_name = (prev.get("medicine_name") or prev.get("name") or "").lower()
                        if prev_id == norm_a or norm_a in prev_name:
                            continue
                        if med_id == norm_a or norm_a in med_name.lower():
                            self._norm_alias_index[norm_a] = med
                            continue
                    else:
                        self._norm_alias_index[norm_a] = med

    def get_catalog_size(self) -> int:
        return len(self._catalog)

    def verify_extracted_text(
        self,
        extracted_text: str,
        base_ocr_confidence: float = 0.90,
    ) -> VerificationResult:
        """
        Verify OCR text against medicine catalog using the 3-step fallback strategy.

        Step 1: Priority 1 - Match Brand / Medicine Name
        Step 2: Priority 2 - Match Generic Name / Active Ingredients
        Step 3: Priority 3 - Aggregate top candidates for suggestions (60%-84%) or retake (<60%)
        """
        if not extracted_text or not extracted_text.strip():
            return VerificationResult(
                matched_drug=None,
                confidence_score=0.0,
                extracted_text="",
                match_priority="unmatched",
                status="low_confidence",
                alternative_suggestions=[],
                retake_prompt="Teks pada kemasan tidak terdeteksi. Silakan ambil foto ulang dengan memperlihatkan nama kemasan secara fokus dan terang.",
            )

        text_clean = extracted_text.strip()
        text_lower = text_clean.lower()
        text_norm = normalize_ocr_typos(text_lower)

        # Tokenize lines and sliding n-grams
        words = re.findall(r"[a-zA-Z0-9\-]+", text_lower)
        norm_words = [normalize_ocr_typos(w) for w in words]

        # Generate window phrases of length 1, 2, and 3 words
        phrases: list[str] = []
        for n in (1, 2, 3):
            for i in range(len(words) - n + 1):
                phrases.append(" ".join(words[i : i + n]))
                phrases.append(" ".join(norm_words[i : i + n]))
        # Also include full lines
        for line in text_clean.splitlines():
            l_str = line.strip().lower()
            if 3 <= len(l_str) <= 60:
                phrases.append(l_str)
                phrases.append(normalize_ocr_typos(l_str))

        phrases = list(set([p for p in phrases if len(p) >= 3]))

        # Score containers
        brand_matches: list[tuple[dict[str, Any], float, str]] = []  # (med, score, matched_term)
        generic_matches: list[tuple[dict[str, Any], float, str]] = []

        # ─── 1. FAST EXACT & NORMALIZED INDEX LOOKUP ─────────────────────────
        for p in phrases:
            # Exact brand index
            if p in self._exact_brand_index:
                med = self._exact_brand_index[p]
                brand_matches.append((med, 1.0, p))
            # Normalized brand index
            p_norm = normalize_ocr_typos(p)
            if p_norm in self._norm_brand_index:
                med = self._norm_brand_index[p_norm]
                brand_matches.append((med, 0.98, p))
            # Normalized alias/misspelling index
            if p_norm in self._norm_alias_index:
                med = self._norm_alias_index[p_norm]
                brand_matches.append((med, 0.96, p))
            # Exact generic index
            if p in self._exact_generic_index:
                med = self._exact_generic_index[p]
                generic_matches.append((med, 0.95, p))

        # ─── 2. DEEP MULTI-ALGORITHM FUZZY SCAN ──────────────────────────────
        # If no immediate exact match >= 0.96, perform fuzzy scoring across catalog
        best_brand_score = max([m[1] for m in brand_matches], default=0.0)
        best_generic_score = max([m[1] for m in generic_matches], default=0.0)

        # Candidate ranking dictionary to prevent duplicates: {med_id: (med, best_score, field_type)}
        candidate_scores: dict[str, tuple[dict[str, Any], float, str]] = {}

        # Seed candidate scores from fast lookups
        for med, sc, term in brand_matches:
            m_id = med["id"]
            if m_id not in candidate_scores or sc > candidate_scores[m_id][1]:
                candidate_scores[m_id] = (med, sc, "brand_name")

        for med, sc, term in generic_matches:
            m_id = med["id"]
            if m_id not in candidate_scores or sc > candidate_scores[m_id][1]:
                candidate_scores[m_id] = (med, sc, "generic_name")

        # Fuzzy search through all medicines if not already a perfect 1.0 brand match
        if best_brand_score < 1.0:
            for med in self._catalog:
                med_name = med.get("medicine_name", "")
                gen_name = med.get("generic_name", "")
                aliases = (
                    med.get("brand_names", [])
                    + med.get("aliases", [])
                    + med.get("common_misspellings", [])
                )

                # Priority 1: Check Brand / Medicine Name & Aliases
                local_brand_score = 0.0
                med_name_low = med_name.lower()
                med_name_norm = normalize_ocr_typos(med_name_low)

                # Check primary medicine name and base name (without dosage suffix)
                med_base = re.sub(r"\s+\d+\s*(mg|g|ml|mcg)?\b.*$", "", med_name, flags=re.IGNORECASE).strip()
                med_base_low = med_base.lower()
                med_base_norm = normalize_ocr_typos(med_base_low)

                if (med_name_low in text_lower or med_name_norm in text_norm or
                    (med_base_low and (med_base_low in text_lower or med_base_norm in text_norm))):
                    local_brand_score = 1.0
                else:
                    for ph in phrases:
                        sim1 = compute_composite_similarity(ph, med_name)
                        sim2 = compute_composite_similarity(ph, med_base) if med_base and med_base != med_name else 0.0
                        sim = max(sim1, sim2)
                        # Add symmetry bonus if lengths are very close
                        if sim > 0.80 and (abs(len(ph) - len(med_name)) <= 1 or abs(len(ph) - len(med_base)) <= 1):
                            sim += 0.04
                        if sim > local_brand_score:
                            local_brand_score = sim

                # If primary name didn't give high match, check aliases with slight penalty
                if local_brand_score < 0.95:
                    for a in aliases:
                        a_str = str(a).strip()
                        if not a_str or len(a_str) < 3 or a_str.lower() == med_name_low:
                            continue
                        a_low = a_str.lower()
                        a_norm = normalize_ocr_typos(a_low)
                        alias_sc = 0.0
                        if a_low in text_lower or a_norm in text_norm:
                            alias_sc = 0.92
                        else:
                            for ph in phrases:
                                if abs(len(ph) - len(a_str)) > max(len(a_str), len(ph)) * 0.5:
                                    continue
                                sim = compute_composite_similarity(ph, a_str)
                                if sim > alias_sc:
                                    alias_sc = sim * 0.95
                        if alias_sc > local_brand_score:
                            local_brand_score = alias_sc

                # Priority 2: Check Generic Name / Active Ingredients
                local_gen_score = 0.0
                _IGNORE_SUBSTANCES = {"iii", "ii", "iv", "dan", "and", "plus", "oral", "drop", "drops", "infus", "kapsul", "tablet", "kaplet", "sirup"}
                if gen_name and len(gen_name) >= 3:
                    gen_substances = [gen_name] + [
                        p.strip() for p in re.split(r"[,;/\(\)]+", gen_name)
                        if len(p.strip()) >= 4 and p.strip().lower() not in _IGNORE_SUBSTANCES
                    ]
                    for gs in gen_substances:
                        gs_low = gs.lower()
                        gs_norm = normalize_ocr_typos(gs_low)
                        if gs_low in text_lower or gs_norm in text_norm:
                            local_gen_score = max(local_gen_score, 0.96)
                            break
                        for ph in phrases:
                            sim = compute_composite_similarity(ph, gs)
                            if sim > local_gen_score:
                                local_gen_score = sim * 0.95

                # Save highest result
                m_id = med["id"]
                if local_brand_score >= local_gen_score and local_brand_score >= 0.55:
                    if m_id not in candidate_scores or local_brand_score > candidate_scores[m_id][1]:
                        candidate_scores[m_id] = (med, local_brand_score, "brand_name")
                elif local_gen_score >= 0.55:
                    if m_id not in candidate_scores or local_gen_score > candidate_scores[m_id][1]:
                        candidate_scores[m_id] = (med, local_gen_score, "generic_name")

        # ─── 3. SORT & DETERMINE FALLBACK STRATEGY ───────────────────────────
        ranked_candidates = sorted(
            candidate_scores.values(),
            key=lambda x: x[1] + (0.05 if x[2] == "brand_name" else 0.0),
            reverse=True,
        )

        if not ranked_candidates:
            return VerificationResult(
                matched_drug=None,
                confidence_score=round(base_ocr_confidence * 40.0, 1),
                extracted_text=text_clean,
                match_priority="unmatched",
                status="low_confidence",
                alternative_suggestions=[],
                retake_prompt=(
                    "Teks pada kemasan tidak cocok dengan database obat (keyakinan di bawah 60%). "
                    "Silakan ambil foto ulang dengan pencahayaan yang terang, hindari pantulan silau, "
                    "dan posisikan nama obat tegak di tengah."
                ),
            )

        best_med, raw_similarity, priority_field = ranked_candidates[0]

        # Calculate final percentage confidence score (0-100)
        # Factor in base OCR clarity and algorithm matching precision
        if raw_similarity >= 0.95:
            # Strong match: 90% - 99.5%
            confidence_pct = min(99.5, round((raw_similarity * 85.0) + (base_ocr_confidence * 15.0), 1))
        elif raw_similarity >= 0.85:
            # Good match: 85% - 92%
            confidence_pct = min(92.0, round((raw_similarity * 80.0) + (base_ocr_confidence * 15.0), 1))
        elif raw_similarity >= 0.65:
            # Moderate match: 60% - 84%
            confidence_pct = round((raw_similarity * 75.0) + (base_ocr_confidence * 15.0), 1)
        else:
            confidence_pct = round(raw_similarity * 70.0, 1)

        # Guarantee >= 85% when strong match confirmed
        if raw_similarity >= 0.85 and confidence_pct < 85.0:
            confidence_pct = 85.5

        # ─── 4. ADAPTIVE CONFIDENCE THRESHOLD EVALUATION ─────────────────────
        if confidence_pct >= 85.0:
            # High Confidence Match (>= 85%)
            return VerificationResult(
                matched_drug=best_med,
                confidence_score=confidence_pct,
                extracted_text=text_clean,
                match_priority=priority_field,
                status="matched",
                alternative_suggestions=[],
                retake_prompt=None,
            )
        elif 60.0 <= confidence_pct < 85.0:
            # Moderate Confidence (60% - 84%) -> Return matched_drug + Top-3 Alternative Suggestions
            suggestions: list[dict[str, Any]] = []
            for m, sc, field_type in ranked_candidates[:4]:
                sug_pct = round(sc * 90.0, 1)
                suggestions.append({
                    "medicine_name": m.get("medicine_name") or m.get("name"),
                    "generic_name": m.get("generic_name", ""),
                    "category": m.get("category", ""),
                    "confidence_score": min(sug_pct, 84.9),
                    "dosage_and_forms": m.get("dosage_and_forms") or m.get("dosage_form", ""),
                    "indications": m.get("indications") or m.get("purpose", ""),
                })

            # Exclude top match from suggestions list if identical
            alt_list = [s for s in suggestions if s["medicine_name"] != (best_med.get("medicine_name") or best_med.get("name"))][:3]
            if not alt_list and len(suggestions) > 1:
                alt_list = suggestions[1:4]

            return VerificationResult(
                matched_drug=best_med,
                confidence_score=confidence_pct,
                extracted_text=text_clean,
                match_priority=priority_field,
                status="uncertain",
                alternative_suggestions=alt_list,
                retake_prompt=(
                    f"Hasil pemindaian teridentifikasi sebagai '{best_med.get('medicine_name')}' "
                    f"dengan tingkat keyakinan {confidence_pct}%. Jika nama tersebut kurang tepat, "
                    f"periksa 3 saran obat alternatif di bawah atau ambil foto ulang kemasan dengan posisi lebih jelas."
                ),
            )
        else:
            # Low Confidence (< 60%) -> Prompt user to retake photo
            return VerificationResult(
                matched_drug=None,
                confidence_score=confidence_pct,
                extracted_text=text_clean,
                match_priority="unmatched",
                status="low_confidence",
                alternative_suggestions=[],
                retake_prompt=(
                    "Tingkat kejelasan teks kemasan di bawah 60%. Silakan ambil foto ulang kemasan obat: "
                    "pastikan pencahayaan cukup terang, hindari pantulan cahaya pada blister/plastik, "
                    "dan fokuskan lensa tepat pada teks merek atau zat aktif obat."
                ),
            )


# Singleton verification engine instance
verification_engine = MedicineVerificationEngine()
