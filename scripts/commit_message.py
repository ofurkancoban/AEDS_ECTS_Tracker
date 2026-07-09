#!/usr/bin/env python3
"""Build the catalog-update commit message from the SUMMARY:: line that
scripts/fetch_catalog.py prints, so git history doubles as a changelog.

Usage: python3 scripts/commit_message.py scrape.log
"""

import json
import re
import sys

text = open(sys.argv[1], encoding="utf-8").read()
m = re.search(r"SUMMARY::(\{.*\})", text)
d = json.loads(m.group(1)) if m else {}
parts = []
if d.get("added"):
    parts.append("add " + " ".join(d["added"]))
if d.get("removed"):
    parts.append("remove " + " ".join(d["removed"]))
if d.get("updated"):
    parts.append(f"update {d['updated']} modules")
print("chore: catalog update (" + ("; ".join(parts) or "sync") + ")")
