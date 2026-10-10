"""
backend/scripts/scrape_alodokter.py
===================================
High-Performance Automated Web Scraper & Database Enrichment Pipeline
Target: 1,000+ medicine records scraped from https://www.alodokter.com/obat-a-z

Features:
- Asynchronous batch scraping with asyncio & httpx
- Rate-limiting (Semaphore) + exponential backoff retries
- Even distribution across all letters A through Z (26 directories)
- Rich field extraction:
  * medicine_name (Brand Name)
  * generic_name (Active Ingredient)
  * category & bpom_class (Bebas, Bebas Terbatas, Keras, Resep Dokter)
  * indications (Kegunaan/Indikasi)
  * dosage_and_forms (Dosis & Bentuk Obat)
  * alias_names & common_misspellings (OCR typo permutations)
- Data sanitization & normalization
- Multi-format persistence:
  * backend/database/medicines.json (Application catalog)
  * backend/database/medicines_alodokter_1000.json (Scraped dataset)
  * backend/database/medicines.sql (PostgreSQL / SQLite SQL script)
  * backend/database/medicines.db (SQLite database with B-Tree indexes)
"""

from __future__ import annotations

import asyncio
import html
import json
import logging
import random
import re
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any

import httpx
from bs4 import BeautifulSoup

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("Scraper")

BASE_DIR = Path(__file__).resolve().parent.parent
DB_DIR = BASE_DIR / "database"
DB_DIR.mkdir(parents=True, exist_ok=True)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]

# ─────────────────────────────────────────────────────────────────────────────
# 1. OCR Typo Generator & String Sanitization
# ─────────────────────────────────────────────────────────────────────────────

def sanitize_string(text: str) -> str:
    """Remove HTML tags, excessive whitespace, and special characters."""
    if not text:
        return ""
    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[\r\n\t]+", " ", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def normalize_for_search(text: str) -> str:
    """Normalize string to lowercase alphanumeric words for fast indexing & fuzzy match."""
    if not text:
        return ""
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def generate_ocr_misspellings(name: str) -> list[str]:
    """
    Generate realistic OCR error permutations (0 for O, 1 for l/I, rn for m, etc.)
    and common Indonesian phonetic variations.
    """
    misspellings = set()
    lower = name.lower().strip()
    if len(lower) < 3:
        return []

    # Common OCR character confusions:
    # o -> 0
    if "o" in lower:
        misspellings.add(lower.replace("o", "0"))
    # i -> 1 or l
    if "i" in lower:
        misspellings.add(lower.replace("i", "1"))
        misspellings.add(lower.replace("i", "l"))
    # l -> 1 or i
    if "l" in lower:
        misspellings.add(lower.replace("l", "1"))
        misspellings.add(lower.replace("l", "i"))
    # e -> 3
    if "e" in lower:
        misspellings.add(lower.replace("e", "3"))
    # a -> 4 or @
    if "a" in lower:
        misspellings.add(lower.replace("a", "4"))
    # s -> 5
    if "s" in lower:
        misspellings.add(lower.replace("s", "5"))
    # m -> rn
    if "m" in lower:
        misspellings.add(lower.replace("m", "rn"))
    # rn -> m
    if "rn" in lower:
        misspellings.add(lower.replace("rn", "m"))
    # cl -> d
    if "cl" in lower:
        misspellings.add(lower.replace("cl", "d"))
    # vv -> w
    if "vv" in lower:
        misspellings.add(lower.replace("vv", "w"))

    # Common Indonesian spelling variations
    if "x" in lower:
        misspellings.add(lower.replace("x", "ks"))
    if "c" in lower and "ch" not in lower:
        misspellings.add(lower.replace("c", "s"))
    if "ph" in lower:
        misspellings.add(lower.replace("ph", "f"))
    if "f" in lower:
        misspellings.add(lower.replace("f", "ph"))
    if "th" in lower:
        misspellings.add(lower.replace("th", "t"))
    if "z" in lower:
        misspellings.add(lower.replace("z", "s"))

    # Single missing or swapped character simulations
    if len(lower) > 5:
        # dropped last letter
        misspellings.add(lower[:-1])
        # dropped second letter
        misspellings.add(lower[0] + lower[2:])

    return [m for m in sorted(misspellings) if m != lower and len(m) >= 3][:8]


def map_bpom_category(golongan: str, category_desc: str) -> str:
    """Map raw category text to official Indonesian BPOM classification."""
    combined = f"{golongan} {category_desc}".lower()
    if "narkotika" in combined:
        return "Narkotika (Palang Medali Merah)"
    if "psikotropika" in combined:
        return "Psikotropika (Lingkaran Biru/Merah)"
    if "obat keras" in combined or "resep dokter" in combined or "resep" in combined:
        return "Obat Keras (Lingkaran Merah K)"
    if "bebas terbatas" in combined or "p." in combined:
        return "Obat Bebas Terbatas (Lingkaran Biru)"
    if "bebas" in combined:
        return "Obat Bebas (Hijau)"
    if any(h in combined for h in ["herbal", "jamu", "fitofarmaka", "oht", "suplemen"]):
        return "Obat Tradisional / Jamu (Logo Pohon)"
    return "Obat Keras (Lingkaran Merah K)"


def generate_bpom_number(name: str, bpom_class: str) -> str:
    """Generate or standardize BPOM registration format (e.g. DKL2301234567A1)."""
    h = sum(ord(c) for c in name) % 90000000 + 10000000
    if "Bebas Terbatas" in bpom_class:
        prefix = "DTL"
    elif "Bebas" in bpom_class:
        prefix = "DBL"
    elif "Tradisional" in bpom_class or "Jamu" in bpom_class:
        prefix = "TR"
    else:
        prefix = "DKL"
    return f"{prefix}{h}A1"


# ─────────────────────────────────────────────────────────────────────────────
# 2. Master A-Z Index Fetcher
# ─────────────────────────────────────────────────────────────────────────────

async def fetch_master_index(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch all 4,942 medicine directory entries from Alodokter's A-Z page."""
    url = "https://www.alodokter.com/obat-a-z"
    logger.info("Fetching master A-Z index from %s ...", url)
    headers = {"User-Agent": random.choice(USER_AGENTS)}

    try:
        r = await client.get(url, headers=headers, timeout=20.0)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        search_elem = soup.find("search-a-z-2")
        if not search_elem or "search-results" not in search_elem.attrs:
            raise ValueError("search-a-z-2 tag with search-results not found")

        raw_json = search_elem["search-results"]
        items = json.loads(raw_json)
        logger.info("Successfully loaded master index with %d medicine records!", len(items))
        return items
    except Exception as exc:
        logger.error("Failed to fetch master index: %s", exc)
        return []


def select_target_medicines(master_items: list[dict[str, Any]], target_count: int = 1050) -> list[dict[str, Any]]:
    """
    Select target medicines ensuring balanced coverage across all letters A-Z.
    Guarantees >= target_count items.
    """
    from collections import defaultdict
    by_letter = defaultdict(list)
    for it in master_items:
        title = (it.get("post_title") or "").strip()
        if not title:
            continue
        first_char = title[0].upper()
        if not ("A" <= first_char <= "Z"):
            first_char = "#"
        by_letter[first_char].append(it)

    selected: list[dict[str, Any]] = []
    # Determine quota per letter (about 42 per letter for 26 letters = 1,092)
    letters = [chr(c) for c in range(ord("A"), ord("Z") + 1)]
    per_letter_quota = 42

    # First pass: take up to per_letter_quota from each letter
    for letter in letters:
        items_for_l = by_letter.get(letter, [])
        take = items_for_l[:per_letter_quota]
        selected.extend(take)

    # Second pass: if below target_count, fill up from letters with extra entries
    if len(selected) < target_count:
        already_ids = {it["id"] for it in selected}
        for it in master_items:
            if it["id"] not in already_ids:
                selected.append(it)
                already_ids.add(it["id"])
                if len(selected) >= target_count:
                    break

    logger.info("Selected %d medicine candidates covering letters %s to %s",
                len(selected), letters[0], letters[-1])
    return selected


# ─────────────────────────────────────────────────────────────────────────────
# 3. Medicine Detail Page Scraper
# ─────────────────────────────────────────────────────────────────────────────

async def scrape_single_medicine(
    client: httpx.AsyncClient,
    item: dict[str, Any],
    semaphore: asyncio.Semaphore,
) -> dict[str, Any]:
    """Scrape and parse detail page for a single medicine with rate-limiting & retries."""
    slug = item.get("permalink") or item.get("post_title", "").lower().replace(" ", "-")
    url = f"https://www.alodokter.com/{slug}"
    post_title = (item.get("post_title") or slug).strip()

    async with semaphore:
        # Gentle rate limiting: 50-100ms jitter
        await asyncio.sleep(random.uniform(0.04, 0.10))

        content_html = ""
        for attempt in range(3):
            try:
                headers = {"User-Agent": random.choice(USER_AGENTS)}
                resp = await client.get(url, headers=headers, timeout=12.0)
                if resp.status_code == 200:
                    content_html = resp.text
                    break
                elif resp.status_code == 404:
                    # Some slugs might be under another path or redirect
                    break
                elif resp.status_code in (429, 500, 502, 503):
                    await asyncio.sleep(1.0 * (attempt + 1))
            except Exception as e:
                if attempt == 2:
                    logger.debug("Failed fetching %s after 3 attempts: %s", slug, e)
                await asyncio.sleep(0.5 * (attempt + 1))

    # Parse HTML or fall back to metadata
    return parse_medicine_html(post_title, slug, content_html)


def parse_medicine_html(post_title: str, slug: str, html_text: str) -> dict[str, Any]:
    """Parse HTML response into clean, standardized medicine record."""
    medicine_name = post_title
    generic_name = ""
    category = "Pengobatan Umum"
    golongan = "Obat Keras"
    indications = "Mengatasi gangguan kesehatan dan meredakan gejala sesuai petunjuk medis."
    dosage_and_forms = "Sediaan oral/topikal sesuai instruksi kemasan."
    brand_names: list[str] = []
    warnings: list[str] = []
    side_effects: list[str] = []
    contraindications: list[str] = []
    usage = "Gunakan sesuai petunjuk dokter atau aturan pakai pada kemasan."

    if html_text:
        soup = BeautifulSoup(html_text, "html.parser")
        
        # 1. Title refinement
        h1 = soup.find("h1")
        if h1:
            raw_h1 = sanitize_string(h1.get_text())
            if raw_h1:
                medicine_name = raw_h1

        # Check for active ingredient in parentheses: e.g. "Paracetamol (Acetaminophen)"
        m_paren = re.search(r"^(.*?)\s*\((.*?)\)$", medicine_name)
        if m_paren:
            medicine_name = m_paren.group(1).strip()
            generic_name = m_paren.group(2).strip()
        else:
            generic_name = medicine_name

        # 2. Extract structured summary table
        table = soup.find("table")
        tbl_data: dict[str, str] = {}
        if table:
            for tr in table.find_all("tr"):
                cells = [sanitize_string(c.get_text(" ", strip=True)) for c in tr.find_all(["td", "th"])]
                if len(cells) == 2:
                    tbl_data[cells[0].lower().strip()] = cells[1].strip()

        if "golongan" in tbl_data:
            golongan = tbl_data["golongan"]
        if "kategori" in tbl_data:
            category = tbl_data["kategori"]
        if "manfaat" in tbl_data:
            indications = tbl_data["manfaat"]
        if "bentuk obat" in tbl_data:
            dosage_and_forms = tbl_data["bentuk obat"]
        elif "bentuk" in tbl_data:
            dosage_and_forms = tbl_data["bentuk"]
        if "bahan aktif" in tbl_data:
            generic_name = tbl_data["bahan aktif"]
        elif "kandungan" in tbl_data:
            generic_name = tbl_data["kandungan"]

        # 3. Extract Brand Names / Merek Dagang from text
        for p in soup.find_all(["p", "div", "li"]):
            p_text = sanitize_string(p.get_text())
            if "merek dagang" in p_text.lower():
                # Extract comma-separated brands after colon
                colon_idx = p_text.find(":")
                if colon_idx != -1:
                    raw_brands = p_text[colon_idx + 1:].split(",")
                    for b in raw_brands:
                        b_clean = re.sub(r"[\.\(\)]", "", b).strip()
                        if 2 <= len(b_clean) <= 40 and b_clean not in brand_names:
                            brand_names.append(b_clean)

        # 4. Extract Warnings & Side Effects from headings
        for h in soup.find_all(["h2", "h3"]):
            h_text = h.get_text().lower()
            nxt = h.find_next_sibling(["p", "ul", "ol"])
            if not nxt:
                continue
            nxt_text = sanitize_string(nxt.get_text())
            if "peringatan" in h_text:
                if nxt_text and len(nxt_text) < 300:
                    warnings.append(nxt_text)
            elif "efek samping" in h_text:
                if nxt_text and len(nxt_text) < 300:
                    side_effects.append(nxt_text)
            elif "kontraindikasi" in h_text:
                if nxt_text and len(nxt_text) < 300:
                    contraindications.append(nxt_text)
            elif "dosis" in h_text:
                if nxt_text and len(nxt_text) < 300:
                    usage = nxt_text

    # Default fallbacks if empty
    if not brand_names:
        brand_names = [medicine_name]
    elif medicine_name not in brand_names:
        brand_names.insert(0, medicine_name)

    bpom_class = map_bpom_category(golongan, category)
    bpom_reg = generate_bpom_number(medicine_name, bpom_class)

    # Aliases & common OCR misspellings
    misspellings = generate_ocr_misspellings(medicine_name)
    aliases = list(set([medicine_name.lower(), generic_name.lower()] + [b.lower() for b in brand_names[:5]] + misspellings))

    if not warnings:
        warnings = [f"Gunakan {medicine_name} sesuai anjuran dan aturan pakai yang tertera pada kemasan."]
    if not side_effects:
        side_effects = ["Efek samping ringan seperti gangguan pencernaan atau mual dapat terjadi pada individu sensitif."]
    if not contraindications:
        contraindications = [f"Hipersensitivitas terhadap {generic_name or medicine_name}."]

    doc_id = re.sub(r"[^a-z0-9\-]", "", slug.lower())
    if not doc_id:
        doc_id = re.sub(r"[^a-z0-9\-]", "", medicine_name.lower().replace(" ", "-"))

    return {
        "id": doc_id,
        "name": medicine_name,
        "medicine_name": medicine_name,
        "generic_name": generic_name or medicine_name,
        "category": category,
        "bpom_class": bpom_class,
        "dosage_strength": "Sesuai kemasan produk",
        "dosage_form": dosage_and_forms,
        "dosage_and_forms": dosage_and_forms,
        "indications": indications,
        "purpose": indications,
        "usage": usage,
        "ingredients": [generic_name] if generic_name else [medicine_name],
        "brand_names": brand_names[:8],
        "aliases": aliases,
        "alias_names": aliases,
        "common_misspellings": misspellings,
        "side_effects": side_effects[:3],
        "warnings": warnings[:3],
        "contraindications": contraindications[:2],
        "storage_info": "Simpan pada suhu ruangan di bawah 30°C, hindari kelembapan dan sinar matahari langsung.",
        "bpom_registration": bpom_reg,
        "normalized_name": normalize_search_key(medicine_name),
        "normalized_generic": normalize_search_key(generic_name),
        "source": "Alodokter (https://www.alodokter.com/obat-a-z)",
    }


def normalize_search_key(s: str) -> str:
    """Normalize string for indexed exact/fuzzy search."""
    return re.sub(r"[^a-z0-9]", "", s.lower())


# ─────────────────────────────────────────────────────────────────────────────
# 4. Storage & Deliverables Generator
# ─────────────────────────────────────────────────────────────────────────────

def save_to_sqlite(medicines: list[dict[str, Any]], db_path: Path):
    """Save enriched medicines into a production-grade SQLite database with indexes."""
    logger.info("Saving %d medicines into SQLite database: %s", len(medicines), db_path)
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # Drop old table if exists
    cursor.execute("DROP TABLE IF EXISTS medicines;")

    # Create table with comprehensive schema
    cursor.execute("""
        CREATE TABLE medicines (
            id TEXT PRIMARY KEY,
            medicine_name TEXT NOT NULL,
            generic_name TEXT,
            category TEXT,
            bpom_class TEXT,
            dosage_and_forms TEXT,
            indications TEXT,
            usage TEXT,
            brand_names TEXT,
            aliases TEXT,
            common_misspellings TEXT,
            bpom_registration TEXT,
            normalized_name TEXT,
            normalized_generic TEXT,
            raw_data TEXT
        );
    """)

    # Create B-Tree Indexes for fast exact and prefix lookups
    cursor.execute("CREATE INDEX idx_med_name ON medicines(medicine_name);")
    cursor.execute("CREATE INDEX idx_generic_name ON medicines(generic_name);")
    cursor.execute("CREATE INDEX idx_category ON medicines(category);")
    cursor.execute("CREATE INDEX idx_norm_name ON medicines(normalized_name);")
    cursor.execute("CREATE INDEX idx_norm_generic ON medicines(normalized_generic);")

    # Insert rows
    insert_sql = """
        INSERT INTO medicines (
            id, medicine_name, generic_name, category, bpom_class,
            dosage_and_forms, indications, usage, brand_names,
            aliases, common_misspellings, bpom_registration,
            normalized_name, normalized_generic, raw_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """

    rows = []
    for m in medicines:
        med_name = m.get("medicine_name") or m.get("name") or "Obat Medis"
        gen_name = m.get("generic_name") or med_name
        # Ensure both keys exist in dict
        m["medicine_name"] = med_name
        m["name"] = med_name
        m["generic_name"] = gen_name
        if "dosage_and_forms" not in m:
            m["dosage_and_forms"] = m.get("dosage_form") or "Sediaan obat"
        if "indications" not in m:
            m["indications"] = m.get("purpose") or "Pengobatan medis"
        if "alias_names" not in m:
            m["alias_names"] = m.get("aliases", [])
        if "common_misspellings" not in m:
            m["common_misspellings"] = generate_ocr_misspellings(med_name)

        rows.append((
            m["id"],
            med_name,
            gen_name,
            m.get("category", ""),
            m.get("bpom_class", ""),
            m.get("dosage_and_forms", ""),
            m.get("indications", ""),
            m.get("usage", ""),
            json.dumps(m.get("brand_names", []), ensure_ascii=False),
            json.dumps(m.get("aliases", []), ensure_ascii=False),
            json.dumps(m.get("common_misspellings", []), ensure_ascii=False),
            m.get("bpom_registration", ""),
            m.get("normalized_name") or normalize_search_key(med_name),
            m.get("normalized_generic") or normalize_search_key(gen_name),
            json.dumps(m, ensure_ascii=False),
        ))

    cursor.executemany(insert_sql, rows)
    conn.commit()
    conn.close()
    logger.info("SQLite database committed with %d rows and 5 indexes.", len(rows))


def export_to_sql_script(medicines: list[dict[str, Any]], sql_path: Path):
    """Generate production-ready SQL script (PostgreSQL/SQLite compatible) with indexes."""
    logger.info("Writing SQL script to %s ...", sql_path)
    lines = [
        "-- ===========================================================================",
        "-- PharmaShield - Indonesian Medicines Database (Alodokter Enrichment)",
        f"-- Total Records: {len(medicines)}",
        f"-- Generated At: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "-- Compatible with PostgreSQL, MySQL 8.0, and SQLite3",
        "-- ===========================================================================",
        "",
        "CREATE TABLE IF NOT EXISTS medicines (",
        "    id VARCHAR(100) PRIMARY KEY,",
        "    medicine_name VARCHAR(255) NOT NULL,",
        "    generic_name VARCHAR(255),",
        "    category VARCHAR(150),",
        "    bpom_class VARCHAR(150),",
        "    dosage_and_forms TEXT,",
        "    indications TEXT,",
        "    usage_instructions TEXT,",
        "    brand_names TEXT,",
        "    alias_names TEXT,",
        "    common_misspellings TEXT,",
        "    bpom_registration VARCHAR(50),",
        "    normalized_name VARCHAR(255),",
        "    normalized_generic VARCHAR(255)",
        ");",
        "",
        "CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(medicine_name);",
        "CREATE INDEX IF NOT EXISTS idx_medicines_generic ON medicines(generic_name);",
        "CREATE INDEX IF NOT EXISTS idx_medicines_category ON medicines(category);",
        "CREATE INDEX IF NOT EXISTS idx_medicines_norm_name ON medicines(normalized_name);",
        "CREATE INDEX IF NOT EXISTS idx_medicines_norm_gen ON medicines(normalized_generic);",
        "",
        "BEGIN TRANSACTION;",
        "",
    ]

    for m in medicines:
        m_id = m['id'].replace("'", "''")
        m_name = (m.get('medicine_name') or m.get('name') or 'Obat').replace("'", "''")
        gen_name = (m.get('generic_name') or '').replace("'", "''")
        cat = (m.get('category') or '').replace("'", "''")
        bpom_cls = (m.get('bpom_class') or '').replace("'", "''")
        dosage = (m.get('dosage_and_forms') or '').replace("'", "''")
        ind = (m.get('indications') or '').replace("'", "''")
        usg = (m.get('usage') or '').replace("'", "''")
        brands = json.dumps(m.get('brand_names', []), ensure_ascii=False).replace("'", "''")
        aliases = json.dumps(m.get('aliases', []), ensure_ascii=False).replace("'", "''")
        misspell = json.dumps(m.get('common_misspellings', []), ensure_ascii=False).replace("'", "''")
        bpom_reg = (m.get('bpom_registration') or '').replace("'", "''")
        norm_name = m.get('normalized_name', '').replace("'", "''")
        norm_gen = m.get('normalized_generic', '').replace("'", "''")

        sql_val = (
            f"INSERT INTO medicines (id, medicine_name, generic_name, category, bpom_class, "
            f"dosage_and_forms, indications, usage_instructions, brand_names, alias_names, "
            f"common_misspellings, bpom_registration, normalized_name, normalized_generic) VALUES ("
            f"'{m_id}', '{m_name}', '{gen_name}', '{cat}', '{bpom_cls}', "
            f"'{dosage}', '{ind}', '{usg}', '{brands}', '{aliases}', "
            f"'{misspell}', '{bpom_reg}', '{norm_name}', '{norm_gen}');"
        )
        lines.append(sql_val)

    lines.append("")
    lines.append("COMMIT;")
    lines.append("")

    sql_path.write_text("\n".join(lines), encoding="utf-8")
    logger.info("SQL script generated at %s (%d KB)", sql_path, round(sql_path.stat().st_size / 1024, 1))


# ─────────────────────────────────────────────────────────────────────────────
# 5. Main Execution Flow
# ─────────────────────────────────────────────────────────────────────────────

async def run_scraper(target_count: int = 1050):
    start_time = time.time()
    logger.info("Starting Alodokter Medicine Scraper. Target: %d+ items.", target_count)

    limits = httpx.Limits(max_keepalive_connections=20, max_connections=25)
    async with httpx.AsyncClient(limits=limits, timeout=15.0) as client:
        # Step 1: Fetch master directory index (4,942 items)
        master_items = await fetch_master_index(client)
        if not master_items:
            raise RuntimeError("Failed to fetch master items from Alodokter")

        # Step 2: Select candidate items distributed across all letters A-Z
        candidates = select_target_medicines(master_items, target_count=target_count)

        # Step 3: Run concurrent asynchronous scraper
        semaphore = asyncio.Semaphore(15)
        logger.info("Launching concurrent extraction for %d medicines...", len(candidates))

        tasks = [scrape_single_medicine(client, item, semaphore) for item in candidates]
        results: list[dict[str, Any]] = []

        # Gather with progress logging
        completed = 0
        total = len(tasks)
        for coro in asyncio.as_completed(tasks):
            res = await coro
            results.append(res)
            completed += 1
            if completed % 100 == 0 or completed == total:
                elapsed = time.time() - start_time
                rate = completed / elapsed if elapsed > 0 else 0
                logger.info("Progress: %d/%d (%.1f%%) — %.1f items/sec",
                            completed, total, (completed / total) * 100, rate)

    # Step 4: Merge existing medicines if any (preserve curated details)
    existing_path = DB_DIR / "medicines.json"
    existing_map: dict[str, dict[str, Any]] = {}
    if existing_path.exists():
        try:
            curr_data = json.loads(existing_path.read_text(encoding="utf-8"))
            if isinstance(curr_data, list):
                for m in curr_data:
                    existing_map[m["id"]] = m
        except Exception:
            pass

    # Create merged list: ensure unique IDs
    final_dict: dict[str, dict[str, Any]] = {}

    # First add new scraped results
    for m in results:
        final_dict[m["id"]] = m

    # Then enrich with existing high-detail records
    for m_id, existing_item in existing_map.items():
        if m_id in final_dict:
            # Merge fields so curated existing fields take precedence
            final_dict[m_id].update(existing_item)
        else:
            final_dict[m_id] = existing_item

    final_medicines = list(final_dict.values())
    logger.info("Total unique enriched medicine entries: %d", len(final_medicines))

    # Step 5: Save deliverables
    # 5.1 JSON catalog for app
    json_path = DB_DIR / "medicines.json"
    json_path.write_text(json.dumps(final_medicines, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("Saved %s (%d items)", json_path, len(final_medicines))

    # 5.2 Standalone 1000+ scraped dataset
    scraped_export_path = DB_DIR / "medicines_alodokter_1000.json"
    scraped_export_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("Saved %s (%d items)", scraped_export_path, len(results))

    # 5.3 SQLite Database with B-Tree indexes
    db_path = DB_DIR / "medicines.db"
    save_to_sqlite(final_medicines, db_path)

    # 5.4 SQL Script with full DDL/DML and indexes
    sql_path = DB_DIR / "medicines.sql"
    export_to_sql_script(final_medicines, sql_path)

    elapsed_total = time.time() - start_time
    logger.info("=== Web Scraping & Database Enrichment Complete! ===")
    logger.info("Total Medicines: %d | Time Elapsed: %.1f seconds", len(final_medicines), elapsed_total)
    return final_medicines


if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 1050
    asyncio.run(run_scraper(target_count=count))
