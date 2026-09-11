#!/usr/bin/env python3
"""Sanity-check catalog.csv and its consistency with the client-side
fallback course list embedded in index.html (see sync_fallback.py).

Checks:
  - the CSV header matches the expected column layout
  - every row has a non-empty code and a known category
  - ects parses as a number
  - semesters_offered has no duplicate entries and only well-formed labels
  - no duplicate course codes
  - the JS fallback arrays (Rs/Js/Ks/Pf/Ws) match catalog.csv exactly,
    per category

Exits non-zero and prints every problem found if any check fails.

Usage: python3 scripts/validate_catalog.py [catalog_csv_path] [index_html_path]
Stdlib only, no third-party dependencies.
"""

import csv
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fetch_catalog import CSV_FIELDS, CATEGORY_ORDER  # noqa: E402

FALLBACK_VARS = {
    "economics": "Rs",
    "empirical": "Js",
    "datascience": "Ks",
    "specialization": "Pf",
    "further": "Ws",
}

SEMESTER_RE = re.compile(r"^(WiSe\d{2}/\d{2}|SoSe\d{2})$")


def load_rows(path, errors):
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != CSV_FIELDS:
            errors.append(
                f"header mismatch: expected {CSV_FIELDS}, got {reader.fieldnames}"
            )
            return []
        return list(reader)


def extract_fallback_array(html, var_name):
    m = re.search(re.escape(var_name) + r"=\[([^\]]*)\]", html)
    if not m:
        return None
    return re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(1))


def main():
    catalog_path = sys.argv[1] if len(sys.argv) > 1 else "catalog.csv"
    html_path = sys.argv[2] if len(sys.argv) > 2 else "index.html"

    errors = []
    rows = load_rows(catalog_path, errors)

    seen_codes = set()
    by_category = {}
    for i, row in enumerate(rows, start=2):  # +1 for header, +1 for 1-index
        code = (row.get("code") or "").strip()
        category = (row.get("category") or "").strip()
        if not code:
            errors.append(f"row {i}: empty code")
            continue
        if code in seen_codes:
            errors.append(f"row {i}: duplicate code '{code}'")
        seen_codes.add(code)
        if category not in CATEGORY_ORDER:
            errors.append(f"row {i} ({code}): unknown category '{category}'")

        try:
            float(row.get("ects") or "")
        except ValueError:
            errors.append(f"row {i} ({code}): ects '{row.get('ects')}' is not numeric")

        sems = [s for s in (row.get("semesters_offered") or "").split(";") if s]
        if len(sems) != len(set(sems)):
            errors.append(f"row {i} ({code}): duplicate entries in semesters_offered")
        for sem in sems:
            if not SEMESTER_RE.match(sem):
                errors.append(f"row {i} ({code}): malformed semester label '{sem}'")

        by_category.setdefault(category, set()).add(f"{code} - {row.get('name', '').strip()}")

    if Path(html_path).exists():
        html = Path(html_path).read_text(encoding="utf-8")
        for category, var_name in FALLBACK_VARS.items():
            fallback = extract_fallback_array(html, var_name)
            if fallback is None:
                errors.append(f"could not find fallback array '{var_name}' in {html_path}")
                continue
            fallback_set = set(fallback)
            csv_set = by_category.get(category, set())
            only_fallback = fallback_set - csv_set
            only_csv = csv_set - fallback_set
            if only_fallback:
                errors.append(
                    f"{category}: in JS fallback but not catalog.csv: {sorted(only_fallback)}"
                    " (run scripts/sync_fallback.py)"
                )
            if only_csv:
                errors.append(
                    f"{category}: in catalog.csv but not JS fallback: {sorted(only_csv)}"
                    " (run scripts/sync_fallback.py)"
                )
    else:
        errors.append(f"{html_path} not found, skipped fallback-list check")

    if errors:
        print(f"catalog validation FAILED ({len(errors)} issue(s)):", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        sys.exit(1)

    print(f"catalog validation OK: {len(rows)} rows, fallback lists in sync")


if __name__ == "__main__":
    main()
