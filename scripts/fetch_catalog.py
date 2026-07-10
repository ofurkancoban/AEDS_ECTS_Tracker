#!/usr/bin/env python3
"""Fetch the AEDS module catalog from Stud.IP (public pages, no login) and
upsert it into catalog.csv, which index.html loads at startup as its module
catalog. Existing rows are updated in place, newly offered modules are added,
and rows for modules not present in the scraped semesters are kept as-is
(so the compulsory column and manually maintained rows survive updates).
Stdlib only, no third-party dependencies.

Usage: python3 scripts/fetch_catalog.py [catalog_csv_path]
"""

import csv
import html
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.request
from datetime import date

BASE = "https://elearning.uni-oldenburg.de"
STUDIENGANG_ID = "7a1f8bf405805833f105fe137e67a418"
STUDIENGANG_URL = f"{BASE}/dispatch.php/search/angebot/studiengang/{STUDIENGANG_ID}"

SECTION_TO_CATEGORY = {
    "Economics": "economics",
    "Empirical Methods": "empirical",
    "Data Science": "datascience",
    "Specialization": "specialization",
    "Specialisation": "specialization",
    "Masterabschlussmodul": "thesis",
}

USER_AGENT = "AEDS-ECTS-Tracker catalog updater (github.com/ofurkancoban)"


_opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with _opener.open(req, timeout=60) as res:
        return res.read().decode("utf-8", errors="replace")


def find_semesters(studiengang_html):
    """Return list of (semester_id, label) from the sidebar semester picker,
    newest first, plus the verlauf endpoint path."""
    m = re.search(
        r'action="' + re.escape(BASE)
        + r'(/dispatch\.php/search/angebot/verlauf/[0-9a-f]{32}/[0-9a-f]{32}/[0-9a-f]{32})',
        studiengang_html,
    )
    if not m:
        raise RuntimeError("verlauf form action not found on studiengang page")
    verlauf_path = m.group(1)

    sems = re.findall(
        r'<option value="([0-9a-f]{32})"[^>]*title="((?:Sommersemester|Wintersemester)[^"]+)"',
        studiengang_html,
    )
    if not sems:
        raise RuntimeError("semester options not found on studiengang page")
    return verlauf_path, sems


FIRST_SEMESTER = ("WiSe", 2021)  # scrape everything from WiSe 2021/2022 onward


def semester_key(title):
    """Map a Stud.IP semester title to ((year, term_order), app_label),
    e.g. 'Wintersemester 2021/2022' -> ((2021, 1), 'WiSe21/22') and
    'Sommersemester 2022' -> ((2022, 0), 'SoSe22')."""
    m = re.match(r"(Winter|Sommer)semester (\d{4})", title.strip())
    if not m:
        return None
    year = int(m.group(2))
    if m.group(1) == "Winter":
        return (year, 1), f"WiSe{str(year)[-2:]}/{str(year + 1)[-2:]}"
    return (year, 0), f"SoSe{str(year)[-2:]}"


def pick_semesters(sems):
    """Pick all semesters from FIRST_SEMESTER up to the next semester
    relative to today, oldest first. Returns [(semester_id, app_label)]."""
    today = date.today()
    year = today.year
    # SoSe runs Apr-Sep, WiSe runs Oct-Mar; upper bound is the next semester
    if 4 <= today.month <= 9:
        upper = (year, 1)  # next is this year's WiSe
    elif today.month >= 10:
        upper = (year + 1, 0)  # next is next year's SoSe
    else:
        upper = (year, 0)  # next is this year's SoSe
    lower = (FIRST_SEMESTER[1], 1 if FIRST_SEMESTER[0] == "WiSe" else 0)

    picked = []
    for sid, title in sems:
        parsed = semester_key(title)
        if parsed and lower <= parsed[0] <= upper:
            picked.append((parsed[0], sid, parsed[1]))
    picked.sort()
    if not picked:
        raise RuntimeError("no semesters in range found in semester picker")
    return [(sid, label) for _, sid, label in picked]


def parse_verlauf(page):
    """Return list of (category, code, name, module_id) in page order."""
    out = []
    current = None
    pattern = re.compile(
        r'class="toggler" href="#">([^<]+)</a>'
        r'|title="([a-zA-Z]+\d*)\s*-\s*([^"(]+)\((?:Complete module|Vollst)[^"]*"\s+'
        r'href="' + re.escape(BASE) + r'/dispatch\.php/shared/modul/description/([0-9a-f]{32})'
    )
    for m in pattern.finditer(page):
        if m.group(1):
            section = html.unescape(m.group(1)).strip()
            current = SECTION_TO_CATEGORY.get(section)
        elif current:
            code = m.group(2).lower()
            name = html.unescape(m.group(3)).strip()
            out.append((current, code, name, m.group(4)))
    return out


def strip_tags(fragment):
    text = re.sub(r"<[^>]+>", "\n", fragment)
    text = html.unescape(text)
    lines = [l.strip() for l in text.split("\n")]
    return [l for l in lines if l]


def parse_module_page(page):
    """Extract detail fields from a module description page (English UI)."""
    body = page[page.find("<body"):]
    body = re.sub(r"<script.*?</script>", "", body, flags=re.S)
    lines = strip_tags(body)

    def after(label):
        try:
            return lines[lines.index(label) + 1]
        except (ValueError, IndexError):
            return None

    info = {}

    kp = after("Credit points")
    if kp:
        m = re.match(r"([\d.]+)\s*KP", kp)
        if m:
            info["ects"] = float(m.group(1))

    lang = after("Language of instruction")
    if lang:
        info["language"] = lang

    # contact hours: "Präsenzzeit Modul insgesamt" -> "56 h"
    ct = after("Präsenzzeit Modul insgesamt")
    if ct:
        m = re.match(r"(\d+)\s*h", ct)
        if m:
            info["contactHours"] = int(m.group(1))

    # responsible person: first "(module responsibility)" line, "Last, First" form
    for l in lines:
        m = re.match(r"(.+?)\s*\(module responsibility\)", l)
        if m:
            name = m.group(1).strip()
            if "," in name:
                last, first = [p.strip() for p in name.split(",", 1)]
                name = f"{first} {last}"
            info["professor"] = name
            break

    # skills: lines between the skills heading and "Module contents"
    try:
        a = lines.index("Skills to be acquired in this module") + 1
        b = lines.index("Module contents")
        skills = " ".join(lines[a:b]).strip()
        if skills:
            info["skills"] = re.sub(r"\s+", " ", skills)
    except ValueError:
        pass

    # exam type: line after "Final exam of module" schedule note, fall back to
    # the line right after "Type of examination" if the table is flat
    try:
        i = lines.index("Final exam of module")
        for cand in lines[i + 1:i + 4]:
            if cand and not cand.startswith(("At the end", "Am Ende")) and cand != "Examination":
                info["examType"] = cand
                break
    except ValueError:
        pass

    # offering semesters from the course-form table (WiSe / SoSe cells)
    offered = set(re.findall(r"\b(WiSe|SoSe)\b", " ".join(lines)))
    if len(offered) == 1:
        info["offeringType"] = offered.pop()

    return info


CSV_FIELDS = [
    "category", "code", "name", "ects", "compulsory", "source", "offering",
    "semesters_offered", "extra_semesters", "language", "professor",
    "exam_type", "contact_hours", "studip_link", "skills",
]
CATEGORY_ORDER = ["economics", "empirical", "datascience", "specialization", "thesis"]


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "catalog.csv"

    # harvest the semester picker from the German page first: the English
    # variant of this page omits several semesters from the picker
    sg = fetch(STUDIENGANG_URL)
    verlauf_path, sems = find_semesters(sg)
    # then flip the session language so module names come back in English
    fetch(STUDIENGANG_URL + "?set_language=en_GB")
    picked = pick_semesters(sems)

    # category -> ordered dict of code -> name ; plus module page ids and
    # the exact semesters each module was offered in (app label format)
    lists = {}
    module_ids = {}
    offered_semesters = {}
    populated_listings = 0
    for sid, label in picked:
        # with_courses=1 = "Nur Module mit Veranstaltungen anzeigen": without it
        # the session sometimes falls back to listing every module of the study
        # plan in every semester, which would poison semesters_offered
        page = fetch(f"{BASE}{verlauf_path}?semester={sid}&with_courses=1")
        rows = parse_verlauf(page)
        print(f"  {label}: {len(rows)} modules")
        if len(rows) > 28:
            raise RuntimeError(
                f"{label} returned {len(rows)} modules; the with_courses filter"
                " appears to be inactive, aborting to avoid writing bogus"
                " semester data"
            )
        if len(rows) >= 5:
            populated_listings += 1
        for category, code, name, mid in rows:
            lists.setdefault(category, {})
            # newer semesters overwrite so names and page ids stay current
            lists[category][code] = name
            module_ids[code] = mid
            offered_semesters.setdefault(code, []).append(label)
        time.sleep(1)

    offered_in = {
        code: {"WiSe" if l.startswith("WiSe") else "SoSe" for l in labels}
        for code, labels in offered_semesters.items()
    }

    details = {}
    for code, mid in sorted(module_ids.items()):
        # display_language (not set_language) is what the module description
        # route honors; German pages would break the field parsing
        url = f"{BASE}/dispatch.php/shared/modul/description/{mid}?display_language=en_GB"
        try:
            details[code] = parse_module_page(fetch(url))
        except Exception as exc:
            print(f"  warning: {code}: {exc}", file=sys.stderr)
            details[code] = {}
        time.sleep(1)

    n_modules = sum(len(v) for v in lists.values())
    if n_modules < 10:
        raise RuntimeError(
            f"only {n_modules} modules scraped; refusing to update from a suspiciously small catalog"
        )

    # load the existing CSV so untouched rows and the compulsory column survive
    existing = {}
    order = []
    if os.path.exists(out_path):
        with open(out_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                existing[row["code"]] = row
                order.append(row["code"])

    added, updated = [], []
    for category, mods in lists.items():
        for code, name in mods.items():
            info = details.get(code, {})
            terms = offered_in.get(code, set())
            scraped = {
                "category": category,
                "code": code,
                "name": name,
                "offering": next(iter(terms)) if len(terms) == 1 else "",
                "semesters_offered": ";".join(offered_semesters.get(code, [])),
                "language": info.get("language", ""),
                "professor": info.get("professor", ""),
                "exam_type": info.get("examType", ""),
                "contact_hours": str(info.get("contactHours", "")),
                "studip_link": f"{BASE}/dispatch.php/shared/modul/description/{module_ids[code]}",
                "skills": info.get("skills", ""),
            }
            if "ects" in info:
                scraped["ects"] = f"{info['ects']:g}"
            if code in existing:
                row = existing[code]
                changed = {k: v for k, v in scraped.items() if v and v != row.get(k, "")}
                # these two may legitimately become empty (offered in both terms)
                for k in ("offering", "semesters_offered"):
                    if scraped[k] != row.get(k, ""):
                        changed[k] = scraped[k]
                if changed:
                    row.update(changed)
                    updated.append(code)
            else:
                row = {k: "" for k in CSV_FIELDS}
                row.update(scraped)
                if not row.get("ects"):
                    row["ects"] = "6"
                row["source"] = "studip"
                existing[code] = row
                order.append(code)
                added.append(code)

    # drop studip-sourced rows that Stud.IP no longer lists; rows with any
    # other source value (e.g. "manual" or empty) are never deleted. Only
    # delete when both semester listings were actually fetched, so a partial
    # scrape cannot wipe half the catalog.
    scraped_codes = {code for mods in lists.values() for code in mods}
    removed = []
    if populated_listings < 6:
        scraped_codes |= set(existing)
    for code in list(order):
        row = existing[code]
        if row.get("source", "").strip() == "studip" and code not in scraped_codes:
            removed.append(code)
            order.remove(code)
            del existing[code]

    rows = [existing[c] for c in order]
    rows.sort(key=lambda r: (
        CATEGORY_ORDER.index(r["category"]) if r["category"] in CATEGORY_ORDER else 99,
        order.index(r["code"]),
    ))
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(
        f"wrote {out_path}: {len(rows)} rows"
        f" (scraped {n_modules}, added {added or 0}, updated {updated or 0},"
        f" removed {removed or 0})"
    )
    # machine-readable change summary, used by the CI workflow to build the
    # commit message so the git history doubles as a catalog changelog
    print("SUMMARY::" + json.dumps(
        {"added": added, "removed": removed, "updated": len(updated)}
    ))


if __name__ == "__main__":
    main()
