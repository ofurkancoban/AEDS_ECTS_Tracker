#!/usr/bin/env python3
"""Unit tests for the regex-based Stud.IP page parsing in
scripts/fetch_catalog.py, so a future markup change breaks these tests
loudly instead of silently shipping wrong or missing catalog data.

Usage: python3 -m unittest discover -s tests
Stdlib only, no third-party dependencies.
"""

import datetime
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import fetch_catalog as fc  # noqa: E402


class SemesterKeyTests(unittest.TestCase):
    def test_wintersemester(self):
        key, label = fc.semester_key("Wintersemester 2021/2022")
        self.assertEqual(key, (2021, 1))
        self.assertEqual(label, "WiSe21/22")

    def test_sommersemester(self):
        key, label = fc.semester_key("Sommersemester 2022")
        self.assertEqual(key, (2022, 0))
        self.assertEqual(label, "SoSe22")

    def test_unrecognized_title_returns_none(self):
        self.assertIsNone(fc.semester_key("Not a semester title"))


class PickSemestersTests(unittest.TestCase):
    SEMS = [
        ("id2021w", "Wintersemester 2021/2022"),
        ("id2022s", "Sommersemester 2022"),
        ("id2022w", "Wintersemester 2022/2023"),
        ("id2099s", "Sommersemester 2099"),  # far future, should be excluded
    ]

    def _pick_on(self, fake_today):
        with patch.object(fc, "date") as mock_date:
            mock_date.today.return_value = fake_today
            return fc.pick_semesters(self.SEMS)

    def test_upper_bound_in_sose_window(self):
        # April-September: upper bound is this year's WiSe
        picked = self._pick_on(datetime.date(2022, 6, 1))
        self.assertEqual(
            picked,
            [("id2021w", "WiSe21/22"), ("id2022s", "SoSe22"), ("id2022w", "WiSe22/23")],
        )

    def test_upper_bound_in_wise_window_before_new_year(self):
        # October-December: upper bound is next year's SoSe, so a following
        # WiSe entry would also be included if present in the picker
        picked = self._pick_on(datetime.date(2022, 11, 1))
        codes = [sid for sid, _ in picked]
        self.assertIn("id2022w", codes)
        self.assertNotIn("id2099s", codes)

    def test_raises_when_nothing_in_range(self):
        sems = [("idfuture", "Sommersemester 2099")]
        with patch.object(fc, "date") as mock_date:
            mock_date.today.return_value = datetime.date(2022, 6, 1)
            with self.assertRaises(RuntimeError):
                fc.pick_semesters(sems)


class ParseVerlaufTests(unittest.TestCase):
    def test_extracts_modules_grouped_by_section(self):
        page = (
            '<a class="toggler" href="#">Economics</a>'
            '<a title="wir874 - Advanced Microeconomics (Complete module description)" '
            'href="https://elearning.uni-oldenburg.de/dispatch.php/shared/modul/'
            'description/5f290e3c3640ce8e0556e5444cbe2eec">wir874</a>'
            '<a class="toggler" href="#">Empirical Methods</a>'
            '<a title="wir875 - Forecasting Methods (Complete module description)" '
            'href="https://elearning.uni-oldenburg.de/dispatch.php/shared/modul/'
            'description/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">wir875</a>'
        )
        rows = fc.parse_verlauf(page)
        self.assertEqual(
            rows,
            [
                ("economics", "wir874", "Advanced Microeconomics", "5f290e3c3640ce8e0556e5444cbe2eec"),
                ("empirical", "wir875", "Forecasting Methods", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
            ],
        )

    def test_ignores_modules_before_any_section_header(self):
        page = (
            '<a title="wir874 - Advanced Microeconomics (Complete module description)" '
            'href="https://elearning.uni-oldenburg.de/dispatch.php/shared/modul/'
            'description/5f290e3c3640ce8e0556e5444cbe2eec">wir874</a>'
        )
        self.assertEqual(fc.parse_verlauf(page), [])

    def test_unmapped_section_name_is_skipped(self):
        page = (
            '<a class="toggler" href="#">Some Unknown Section</a>'
            '<a title="wir874 - Advanced Microeconomics (Complete module description)" '
            'href="https://elearning.uni-oldenburg.de/dispatch.php/shared/modul/'
            'description/5f290e3c3640ce8e0556e5444cbe2eec">wir874</a>'
        )
        self.assertEqual(fc.parse_verlauf(page), [])


class ParseModulePageTests(unittest.TestCase):
    def _page(self, body_html):
        return f"<html><head><title>x</title></head><body>{body_html}</body></html>"

    def test_extracts_full_info(self):
        body = (
            "<div>Credit points</div><div>6 KP</div>"
            "<div>Language of instruction</div><div>English</div>"
            "<div>Präsenzzeit Modul insgesamt</div><div>56 h</div>"
            "<div>Bitzer, Jürgen (module responsibility)</div>"
            "<div>Skills to be acquired in this module</div>"
            "<div>Understand microeconomic theory.</div>"
            "<div>Module contents</div>"
            "<div>Final exam of module</div>"
            "<div>At the end of semester</div>"
            "<div>Written exam</div>"
            "<div>WiSe</div>"
        )
        info = fc.parse_module_page(self._page(body))
        self.assertEqual(info["ects"], 6.0)
        self.assertEqual(info["language"], "English")
        self.assertEqual(info["contactHours"], 56)
        self.assertEqual(info["professor"], "Jürgen Bitzer")
        self.assertEqual(info["skills"], "Understand microeconomic theory.")
        self.assertEqual(info["examType"], "Written exam")
        self.assertEqual(info["offeringType"], "WiSe")

    def test_missing_fields_are_omitted_not_crashed(self):
        info = fc.parse_module_page(self._page("<div>Nothing relevant here</div>"))
        self.assertEqual(info, {})

    def test_script_tags_are_stripped_before_parsing(self):
        body = (
            "<script>var x = 'Credit points';</script>"
            "<div>Credit points</div><div>6 KP</div>"
        )
        info = fc.parse_module_page(self._page(body))
        self.assertEqual(info["ects"], 6.0)


class FetchRetryTests(unittest.TestCase):
    def test_retries_then_succeeds(self):
        import urllib.error

        calls = {"n": 0}

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return b"ok"

        def flaky_open(req, timeout=60):
            calls["n"] += 1
            if calls["n"] < 3:
                raise urllib.error.URLError("temporary failure")
            return FakeResponse()

        with patch.object(fc._opener, "open", side_effect=flaky_open), patch("time.sleep"):
            result = fc.fetch("https://example.invalid/", attempts=3, backoff=0)
        self.assertEqual(result, "ok")
        self.assertEqual(calls["n"], 3)

    def test_raises_after_exhausting_attempts(self):
        import urllib.error

        def always_fails(req, timeout=60):
            raise urllib.error.URLError("down")

        with patch.object(fc._opener, "open", side_effect=always_fails), patch("time.sleep"):
            with self.assertRaises(urllib.error.URLError):
                fc.fetch("https://example.invalid/", attempts=3, backoff=0)


if __name__ == "__main__":
    unittest.main()
