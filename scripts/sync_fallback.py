#!/usr/bin/env python3
"""Regenerate the client-side fallback course-name lists embedded in
index.html from catalog.csv, so the two never drift apart again. The
fallback lists are used for course autocomplete before catalog.csv has
loaded, or if the fetch fails; each one is a JS array literal named
Rs/Js/Ks/Pf/Ws for economics/empirical/datascience/specialization/further.

Usage: python3 scripts/sync_fallback.py [catalog_csv_path] [index_html_path]
Stdlib only, no third-party dependencies.
"""

import csv
import json
import re
import sys
from pathlib import Path

FALLBACK_VARS = {
    "economics": "Rs",
    "empirical": "Js",
    "datascience": "Ks",
    "specialization": "Pf",
    "further": "Ws",
}


def load_by_category(path):
    by_category = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            category = row["category"].strip()
            by_category.setdefault(category, []).append(f"{row['code']} - {row['name']}")
    return by_category


def js_array_literal(items):
    return "[" + ",".join(json.dumps(item, ensure_ascii=False) for item in items) + "]"


def main():
    catalog_path = sys.argv[1] if len(sys.argv) > 1 else "catalog.csv"
    html_path = sys.argv[2] if len(sys.argv) > 2 else "index.html"

    by_category = load_by_category(catalog_path)
    html = Path(html_path).read_text(encoding="utf-8")
    changed = False
    for category, var_name in FALLBACK_VARS.items():
        # matches only the array-literal definition (immediately followed by
        # "["), not later reassignments like "Rs=L.economics" or unrelated
        # minified variables that happen to reuse the same short name
        pattern = re.compile(re.escape(var_name) + r"=\[[^\]]*\]")
        replacement = var_name + "=" + js_array_literal(by_category.get(category, []))
        new_html, n = pattern.subn(replacement, html, count=1)
        if n == 0:
            raise SystemExit(f"could not find fallback array literal for '{var_name}' in {html_path}")
        if new_html != html:
            changed = True
        html = new_html

    if changed:
        Path(html_path).write_text(html, encoding="utf-8")
        print(f"synced fallback lists in {html_path}")
    else:
        print("fallback lists already in sync, no changes")


if __name__ == "__main__":
    main()
