// StuMS ("Sync from StudIP") modal and the AEDS Assistant chat widget, carried
// over from the classic UI as plain DOM code: both were tuned against real
// StuMS exports and real iOS keyboard behaviour, and rewriting them would only
// risk regressions. Their few dependencies on the old bundle are provided below.
/* eslint-disable */
import { allowedSemesters, codeOf, courseInfo, ownPool } from "../lib/catalog";
import { allSemesters, currentSemester } from "../lib/semesters";
import { CATEGORIES } from "../lib/constants";

var Zs = CATEGORIES;
function nt(e) { return codeOf(e); }
function _s(name, ects) {
  var info = courseInfo(name, ects);
  return info ? Object.assign({ language: "", contactHours: null, workloadHours: null, professor: "", examType: "", skills: "", studipLink: "", offeringType: null, compulsory: false }, info) : null;
}
function Dr() { return allSemesters(); }
function Vs() { return currentSemester(); }
var Ch = new Proxy({}, {
  get: function (_t, k) { return ownPool(k); },
  ownKeys: function () { return ["economics", "empirical", "datascience", "specialization", "thesis", "further"]; },
  getOwnPropertyDescriptor: function () { return { enumerable: true, configurable: true }; },
});
function allowedFor(code) { return allowedSemesters(code); }
  function stuMSNormalizeTitle9(s) {
    return (s || "")
      .toLowerCase()
      .replace(/^[a-z]+\d+\s*-\s*/i, "")
      .replace(/[^a-z0-9]+/gi, " ")
      .trim();
  }
  function stuMSSyncScript9() {
    return "(function(){var btn=null;document.querySelectorAll('button, a, input[type=button], input[type=submit]').forEach(function(b){if(!btn){var label=(b.value||b.textContent||'').trim();if(/^expand all$/i.test(label))btn=b}});function finish(){try{var sel=window.getSelection();sel.removeAllRanges();var range=document.createRange();range.selectNodeContents(document.body);sel.addRange(range);var copied=document.execCommand('copy');sel.removeAllRanges();if(copied){alert('StuMS sync: page copied. Go back to the ECTS Tracker, click \"Paste from clipboard\", then \"Match\".')}else{alert('Could not copy automatically \\u2014 please press Ctrl+A / Cmd+A then Ctrl+C / Cmd+C on this page instead.')}}catch(e){alert('Could not copy automatically \\u2014 please press Ctrl+A / Cmd+A then Ctrl+C / Cmd+C on this page instead.')}}if(btn){btn.click();setTimeout(finish,1500)}else{finish()}})();";
  }
  function stuMSBookmarklet9() {
    return "javascript:" + encodeURIComponent(stuMSSyncScript9());
  }
  function stuMSParseText9(text) {
    var TYPE_PREFIXES = [
      "examination regulations",
      "module group",
      "examination",
      "module",
    ];
    var GRADE_RE = /^[1-5][.,]\d$/;
    var STATUS_MAP = { BE: "passed", NB: "not passed" };
    var lines = (text || "").replace(/\r/g, "").split("\n");
    var groups = {};
    lines.forEach(function (line) {
      var t = line.trim();
      if (!t) return;
      var fields = t
        .split(/\t+| {2,}/)
        .map(function (f) {
          return f.trim();
        })
        .filter(function (f) {
          return f !== "";
        });
      if (fields.length < 3) return;
      var typeField = fields[1] || "";
      var type = null,
        title = "";
      for (var i = 0; i < TYPE_PREFIXES.length; i++) {
        if (typeField.indexOf(TYPE_PREFIXES[i]) === 0) {
          type = TYPE_PREFIXES[i];
          title = typeField.slice(TYPE_PREFIXES[i].length).trim();
          break;
        }
      }
      if ((type !== "module" && type !== "examination") || !title) return;
      var number = /^\d+$/.test(fields[2]) ? fields[2] : null;
      if (!number) return;
      var attemptField = fields[3];
      var attempt =
        attemptField && /^\d+$/.test(attemptField)
          ? parseInt(attemptField, 10)
          : 0;
      var grade = "",
        status = null;
      for (var j = 2; j < fields.length; j++) {
        if (!grade && GRADE_RE.test(fields[j]))
          grade = fields[j].replace(",", ".");
        if (!status && STATUS_MAP.hasOwnProperty(fields[j]))
          status = STATUS_MAP[fields[j]];
      }
      var row = {
        title: title,
        grade: grade,
        status: status,
        attempt: attempt,
      };
      if (!groups[number]) groups[number] = { moduleRow: null, examRows: [] };
      if (type === "module") {
        if (!groups[number].moduleRow) groups[number].moduleRow = row;
      } else {
        groups[number].examRows.push(row);
      }
    });
    var out = [];
    Object.keys(groups).forEach(function (number) {
      var g = groups[number];
      var chosen = g.moduleRow;
      if (!chosen && g.examRows.length) {
        chosen = g.examRows.reduce(function (best, r) {
          return !best || r.attempt >= best.attempt ? r : best;
        }, null);
      }
      if (!chosen) return;
      var status = chosen.status;
      if (status !== "passed" && status !== "not passed") return;
      var grade = chosen.grade
        ? chosen.grade
        : status === "not passed"
          ? "5.0"
          : "";
      if (!grade) return;
      out.push({
        number: number,
        title: chosen.title,
        grade: grade,
        status: status,
      });
    });
    return out;
  }
  function stuMSResolveCatalog9(number) {
    if (!number) return null;
    var cats = Object.keys(Ch);
    for (var i = 0; i < cats.length; i++) {
      var list = Ch[cats[i]] || [];
      for (var j = 0; j < list.length; j++) {
        var full = list[j];
        var code = nt(full);
        if (!code) continue;
        var d = (/\d+$/.exec(code) || [])[0];
        if (!d) continue;
        if (number.length >= d.length && number.slice(-d.length) === d)
          return { category: cats[i], name: full };
      }
    }
    return null;
  }
  function openStuMSSyncModal9(courses, setCourses, palette) {
    var F = "font-family:'Fraunces Variable', Georgia, serif;";
    var ov = document.createElement("div");
    ov.style.cssText =
      "position:fixed;inset:0;background:rgba(20,18,14,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;";
    var box = document.createElement("div");
    box.style.cssText =
      F +
      "background:" +
      palette.panel +
      ";color:" +
      palette.ink +
      ";border-radius:12px;padding:26px;max-width:580px;width:100%;max-height:85vh;overflow:auto;font-size:14px;line-height:1.55;box-shadow:0 20px 60px rgba(0,0,0,0.30);";
    ov.appendChild(box);
    function close() {
      document.body.removeChild(ov);
    }
    ov.addEventListener("click", function (e) {
      if (e.target === ov) close();
    });
    function mkBtn(text, primary) {
      var b = document.createElement("button");
      b.textContent = text;
      b.style.cssText =
        F +
        "border:1px solid " +
        (primary ? palette.accent : palette.line) +
        ";background:" +
        (primary ? palette.accent : "transparent") +
        ";color:" +
        (primary ? palette.panel : palette.ink) +
        ";border-radius:6px;padding:8px 16px;cursor:pointer;font-size:13.5px;font-weight:600;transition:opacity .15s ease;";
      b.onmouseenter = function () {
        b.style.opacity = "0.82";
      };
      b.onmouseleave = function () {
        b.style.opacity = "1";
      };
      return b;
    }
    function mkSelect() {
      var s = document.createElement("select");
      s.style.cssText =
        F +
        "font-size:13px;border:1px solid " +
        palette.line +
        ";border-radius:6px;padding:5px 7px;background:" +
        palette.panel +
        ";color:" +
        palette.ink +
        ";";
      return s;
    }
    var title = document.createElement("div");
    title.textContent = "Sync grades from StudIP";
    title.style.cssText =
      F +
      "font-size:20px;font-weight:700;margin-bottom:6px;letter-spacing:0.2px;";
    box.appendChild(title);
    var titleRule = document.createElement("div");
    titleRule.style.cssText =
      "height:1px;background:" + palette.line + ";margin-bottom:18px;";
    box.appendChild(titleRule);
    var step0 = document.createElement("div");
    step0.innerHTML =
      '<b>1.</b> Log in to <a href="https://elearning.uni-oldenburg.de" target="_blank" rel="noopener" style="color:' +
      palette.accent +
      ';">Stud.IP</a> first (same university single sign-on StuMS uses).';
    step0.style.cssText = F + "font-size:14px;margin-bottom:12px;";
    box.appendChild(step0);
    var step1 = document.createElement("div");
    step1.innerHTML =
      '<b>2.</b> Then open your <a href="https://stums.uni-oldenburg.de/qisserver/pages/sul/examAssessment/personExamsReadonly.xhtml?_flowId=examsOverviewForPerson-flow&navigationPosition=hisinoneMeinStudium%2CexamAssessmentForStudent&recordRequest=true" target="_blank" rel="noopener" style="color:' +
      palette.accent +
      ';">StuMS grades page</a>, you should land straight on it without logging in again.';
    step1.style.cssText = F + "font-size:14px;margin-bottom:12px;";
    box.appendChild(step1);
    var step1b = document.createElement("div");
    step1b.innerHTML =
      '<b>3.</b> On that page, click <b>"Expand all"</b> if you see it (so every module shows), then press <b>Ctrl+A</b> / <b>Cmd+A</b> to select the whole page and copy it (<b>Ctrl+C</b> / <b>Cmd+C</b>).';
    step1b.style.cssText = F + "font-size:14px;margin-bottom:12px;";
    box.appendChild(step1b);
    var note = document.createElement("div");
    note.textContent =
      "Just select and copy, like copying a table into a spreadsheet. Nothing is sent anywhere.";
    note.style.cssText =
      F +
      "font-size:12.5px;color:" +
      palette.muted +
      ";font-style:italic;margin-bottom:8px;";
    box.appendChild(note);
    var bmLabel = document.createElement("div");
    bmLabel.textContent =
      "Or, for next time, drag this to your bookmarks bar:";
    bmLabel.style.cssText =
      F + "font-size:12.5px;color:" + palette.muted + ";margin-bottom:6px;";
    box.appendChild(bmLabel);
    var bmLink = document.createElement("a");
    bmLink.href = stuMSBookmarklet9();
    bmLink.textContent = "⬇ Sync StuMS page";
    bmLink.onclick = function (e) {
      e.preventDefault();
      alert(
        "Drag this button itself to your bookmarks bar, clicking it here does nothing.",
      );
    };
    bmLink.style.cssText =
      F +
      "display:inline-block;border:1px solid " +
      palette.accent +
      ";background:transparent;color:" +
      palette.accent +
      ";border-radius:6px;padding:8px 16px;font-size:13.5px;font-weight:600;text-decoration:none;cursor:grab;margin-bottom:6px;";
    box.appendChild(bmLink);
    var bmCaption = document.createElement("div");
    bmCaption.textContent =
      "Clicking it on the StuMS page does step 3 for you automatically.";
    bmCaption.style.cssText =
      F + "font-size:12.5px;color:" + palette.muted + ";margin-bottom:18px;";
    box.appendChild(bmCaption);
    var step3 = document.createElement("div");
    step3.innerHTML = "<b>4.</b> Paste what you copied here:";
    step3.style.cssText = F + "font-size:14px;margin-bottom:8px;";
    box.appendChild(step3);
    var pasteRow = document.createElement("div");
    pasteRow.style.cssText = "display:flex;gap:8px;margin-bottom:10px;";
    var pasteBtn = mkBtn("Paste from clipboard", false);
    pasteRow.appendChild(pasteBtn);
    box.appendChild(pasteRow);
    var textarea = document.createElement("textarea");
    textarea.placeholder =
      "Paste the copied text here if the button above does not work";
    textarea.style.cssText =
      "width:100%;min-height:80px;box-sizing:border-box;border:1px solid " +
      palette.line +
      ";border-radius:6px;padding:8px;background:" +
      palette.panel +
      ";color:" +
      palette.ink +
      ";font-family:Menlo, Consolas, monospace;font-size:12px;line-height:1.4;margin-bottom:14px;";
    box.appendChild(textarea);
    pasteBtn.onclick = function () {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(
          function (t) {
            textarea.value = t;
          },
          function () {
            alert(
              "Could not read clipboard, paste manually into the box below (Cmd/Ctrl+V).",
            );
          },
        );
      } else {
        alert("Paste manually into the box below (Cmd/Ctrl+V).");
      }
    };
    var matchRow = document.createElement("div");
    matchRow.style.cssText =
      "display:flex;justify-content:flex-end;margin-bottom:14px;";
    var matchBtn = mkBtn("Match", true);
    matchRow.appendChild(matchBtn);
    box.appendChild(matchRow);
    var results = document.createElement("div");
    box.appendChild(results);
    var footer = document.createElement("div");
    footer.style.cssText =
      "display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:18px;padding-top:14px;border-top:1px solid " +
      palette.line +
      ";";
    box.appendChild(footer);
    var closeBtn = mkBtn("Close", false);
    closeBtn.onclick = close;
    footer.appendChild(closeBtn);
    var applyBtn = mkBtn("Apply updates", true);
    applyBtn.style.display = "none";
    footer.appendChild(applyBtn);
    matchBtn.onclick = function () {
      results.innerHTML = "";
      var finalRows = stuMSParseText9(textarea.value);
      if (!finalRows.length) {
        var none = document.createElement("div");
        none.textContent =
          'Could not find any finished grades in what you pasted. Make sure you clicked "Expand all" on the StuMS page before copying, and that you selected/copied the achievements table.';
        none.style.cssText = F + "font-size:13px;color:" + palette.warn + ";";
        results.appendChild(none);
        return;
      }
      var byNorm = {};
      courses.forEach(function (c) {
        var key = stuMSNormalizeTitle9(c.name);
        if (key) (byNorm[key] = byNorm[key] || []).push(c);
      });
      var byDigits = {};
      courses.forEach(function (c) {
        var code = nt(c.name);
        var d = code ? (/\d+$/.exec(code) || [])[0] : null;
        if (d) (byDigits[d] = byDigits[d] || []).push(c);
      });
      var autoMatches = [],
        review = [],
        toAdd = [],
        unchanged = [];
      finalRows.forEach(function (row) {
        var candidates = [];
        if (row.number) {
          Object.keys(byDigits).forEach(function (d) {
            if (
              row.number.length >= d.length &&
              row.number.slice(-d.length) === d
            )
              candidates = candidates.concat(byDigits[d]);
          });
        }
        if (!candidates.length) {
          var key = stuMSNormalizeTitle9(row.title);
          candidates = (byNorm[key] || []).slice();
          if (!candidates.length && key) {
            courses.forEach(function (c) {
              var cn = stuMSNormalizeTitle9(c.name);
              if (cn && (cn.indexOf(key) === 0 || key.indexOf(cn) === 0))
                candidates.push(c);
            });
          }
        }
        if (candidates.length === 1) {
          var c = candidates[0];
          if ((c.grade || "") === row.grade) {
            unchanged.push(row.title);
          } else {
            autoMatches.push({ course: c, newGrade: row.grade, checked: true });
          }
        } else if (!candidates.length) {
          var resolved = stuMSResolveCatalog9(row.number);
          if (resolved) {
            toAdd.push({ row: row, resolved: resolved, checked: true });
          } else {
            review.push(row);
          }
        } else {
          review.push(row);
        }
      });
      var cardCss =
        F +
        "display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;background:" +
        palette.paper +
        ";border:1px solid " +
        palette.line +
        ";border-radius:8px;padding:10px 12px;margin-bottom:8px;";
      var sectionHeaderCss =
        F +
        "font-weight:700;font-size:13px;margin-top:18px;margin-bottom:8px;padding-left:10px;border-left:3px solid " +
        palette.accent +
        ";letter-spacing:0.2px;";
      function pill9(bg, fg, text) {
        var s = document.createElement("span");
        s.textContent = text;
        s.style.cssText =
          F +
          "display:inline-block;background:" +
          bg +
          ";color:" +
          fg +
          ";border-radius:10px;padding:2px 9px;font-size:11.5px;font-weight:600;";
        return s;
      }
      if (autoMatches.length) {
        var h = document.createElement("div");
        h.textContent = "Matched (" + autoMatches.length + ")";
        h.style.cssText = sectionHeaderCss;
        results.appendChild(h);
        autoMatches.forEach(function (u) {
          var row = document.createElement("label");
          row.style.cssText = cardCss + "cursor:pointer;";
          var left = document.createElement("span");
          left.style.cssText = "display:flex;align-items:center;gap:9px;";
          var cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = true;
          cb.onchange = function () {
            u.checked = cb.checked;
          };
          left.appendChild(cb);
          var name = document.createElement("span");
          name.textContent = u.course.name;
          name.style.cssText = F + "font-weight:600;font-size:14px;";
          left.appendChild(name);
          row.appendChild(left);
          var right = document.createElement("span");
          right.style.cssText =
            F +
            "font-size:13px;color:" +
            palette.muted +
            ";white-space:nowrap;";
          right.innerHTML =
            (u.course.grade || "-") +
            ' <b style="color:' +
            palette.accent +
            ';">→ ' +
            u.newGrade +
            "</b>";
          row.appendChild(right);
          results.appendChild(row);
        });
      }
      if (toAdd.length) {
        var h4 = document.createElement("div");
        h4.textContent =
          "Not in your tracker yet, add as new course (" + toAdd.length + ")";
        h4.style.cssText = sectionHeaderCss;
        results.appendChild(h4);
        function cap9(s) {
          return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
        }
        var ds9 = Dr(),
          curIdx9 = ds9.indexOf(Vs());
        toAdd.forEach(function (u) {
          u.checked = true;
          u.semester = "";
          var row = document.createElement("div");
          row.style.cssText =
            cardCss + "flex-direction:column;align-items:stretch;gap:8px;";
          var titleRow = document.createElement("div");
          titleRow.style.cssText =
            "display:flex;align-items:flex-start;gap:9px;";
          var cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = true;
          cb.style.marginTop = "3px";
          cb.onchange = function () {
            u.checked = cb.checked;
          };
          titleRow.appendChild(cb);
          var name = document.createElement("span");
          name.textContent = u.resolved.name;
          name.style.cssText = F + "font-weight:600;font-size:14px;flex:1;";
          titleRow.appendChild(name);
          row.appendChild(titleRow);
          var badgeRow = document.createElement("div");
          badgeRow.style.cssText =
            "display:flex;align-items:center;gap:8px;padding-left:27px;";
          badgeRow.appendChild(
            pill9(palette.line, palette.ink, cap9(u.resolved.category)),
          );
          badgeRow.appendChild(
            pill9(palette.accent, palette.panel, "Grade " + u.row.grade),
          );
          row.appendChild(badgeRow);
          var bottom = document.createElement("div");
          bottom.style.cssText =
            F +
            "display:flex;align-items:center;gap:8px;padding-left:27px;font-size:13px;color:" +
            palette.muted +
            ";";
          var semLabel = document.createElement("span");
          semLabel.textContent = "Semester:";
          bottom.appendChild(semLabel);
          var code = nt(u.resolved.name);
          var allowed =
            code
              ? allowedFor(code)
              : null;
          var semPool = allowed && allowed.length ? allowed : ds9;
          var semOptions = semPool.filter(function (s) {
            var i = ds9.indexOf(s);
            return i >= 0 && (curIdx9 < 0 || i <= curIdx9);
          });
          if (!semOptions.length)
            semOptions = ds9.filter(function (s) {
              var i = ds9.indexOf(s);
              return curIdx9 < 0 || i <= curIdx9;
            });
          var semSelect = mkSelect();
          var optPlaceholder = document.createElement("option");
          optPlaceholder.value = "";
          optPlaceholder.textContent = "-- select semester --";
          optPlaceholder.disabled = true;
          semSelect.appendChild(optPlaceholder);
          semOptions.forEach(function (s) {
            var opt = document.createElement("option");
            opt.value = s;
            opt.textContent = s;
            semSelect.appendChild(opt);
          });
          semSelect.value = "";
          semSelect.onchange = function () {
            u.semester = semSelect.value;
          };
          bottom.appendChild(semSelect);
          row.appendChild(bottom);
          results.appendChild(row);
        });
      }
      var manualSelections = [];
      if (review.length) {
        var h2 = document.createElement("div");
        h2.textContent =
          "Needs review (" +
          review.length +
          "), pick the matching course or skip";
        h2.style.cssText =
          sectionHeaderCss +
          "border-left-color:" +
          palette.warn +
          ";color:" +
          palette.warn +
          ";";
        results.appendChild(h2);
        review.forEach(function (row) {
          var wrap = document.createElement("div");
          wrap.style.cssText = cardCss;
          var label = document.createElement("span");
          label.textContent = row.title + " (" + row.grade + ")";
          label.style.cssText = F + "flex:1;font-size:13.5px;";
          wrap.appendChild(label);
          var select = mkSelect();
          select.style.maxWidth = "220px";
          var optSkip = document.createElement("option");
          optSkip.value = "";
          optSkip.textContent = "-- skip --";
          select.appendChild(optSkip);
          courses.forEach(function (c) {
            var opt = document.createElement("option");
            opt.value = c.id;
            opt.textContent = c.name;
            select.appendChild(opt);
          });
          wrap.appendChild(select);
          results.appendChild(wrap);
          manualSelections.push({ select: select, row: row });
        });
      }
      if (unchanged.length) {
        var h3 = document.createElement("div");
        h3.textContent = unchanged.length + " already up to date.";
        h3.style.cssText =
          F + "font-size:12px;color:" + palette.muted + ";margin-top:14px;";
        results.appendChild(h3);
      }
      applyBtn.style.display =
        autoMatches.length || manualSelections.length || toAdd.length
          ? "inline-block"
          : "none";
      applyBtn.onclick = function () {
        var missingSem = toAdd.filter(function (u) {
          return u.checked && !u.semester;
        });
        if (missingSem.length) {
          alert(
            "Choose a semester for: " +
              missingSem
                .map(function (u) {
                  return u.resolved.name;
                })
                .join(", "),
          );
          return;
        }
        var ids = {};
        autoMatches
          .filter(function (u) {
            return u.checked;
          })
          .forEach(function (u) {
            ids[u.course.id] = u.newGrade;
          });
        manualSelections.forEach(function (m) {
          if (m.select.value) ids[m.select.value] = m.row.grade;
        });
        var newCourses = toAdd
          .filter(function (u) {
            return u.checked;
          })
          .map(function (u) {
            var cat = u.resolved.category;
            var ects = cat === "thesis" ? 30 : 6;
            var meta = _s(u.resolved.name, ects);
            return {
              id: $s(),
              category: cat,
              homeCategory: cat,
              name: u.resolved.name,
              ects: ects,
              semester: u.semester || "Unscheduled",
              status: "completed",
              grade: u.row.grade,
              professor: meta ? meta.professor : "",
              examType: meta ? meta.examType : "",
              notes: "",
              language: meta ? meta.language : "",
              contactHours: meta ? meta.contactHours : null,
              workloadHours: meta ? meta.workloadHours : null,
              skills: meta ? meta.skills : "",
              studipLink: meta ? meta.studipLink : "",
              offeringType: meta ? meta.offeringType : null,
              compulsory: meta ? meta.compulsory : null,
              hypothetical: !1,
            };
          });
        var updateCount = Object.keys(ids).length,
          addCount = newCourses.length;
        if (!updateCount && !addCount) {
          alert("Nothing selected to apply.");
          return;
        }
        setCourses(function (prev) {
          var updated = prev.map(function (c) {
            return ids.hasOwnProperty(c.id)
              ? Object.assign({}, c, { grade: ids[c.id], status: "completed" })
              : c;
          });
          return updated.concat(newCourses);
        });
        alert(
          "Updated " +
            updateCount +
            " grade" +
            (updateCount === 1 ? "" : "s") +
            " and added " +
            addCount +
            " new course" +
            (addCount === 1 ? "" : "s") +
            ".",
        );
        close();
      };
    };
    document.body.appendChild(ov);
  }
  var AEDS_RAG_BASE9 = "https://aeds-rag-assistant.ofurkan.co";
  var AEDS_PAL9 = {
    ink: "#1C2333",
    paper: "#F6F3EC",
    panel: "#FFFFFF",
    accent: "#2F6F6D",
    warn: "#B5652D",
    line: "#DCD6C7",
    muted: "#6B6558",
  };
  function aedsRagEscape9(s) {
    return (s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function aedsRagInline9(s) {
    s = s.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      function (_, label, url) {
        return (
          '<a href="' +
          url +
          '" target="_blank" rel="noopener noreferrer" style="color:' +
          AEDS_PAL9.accent +
          ';">' +
          label +
          "</a>"
        );
      },
    );
    s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    s = s.replace(/\*([^*]+)\*/g, "<i>$1</i>");
    s = s.replace(
      /`([^`]+)`/g,
      '<code style="background:' +
        AEDS_PAL9.line +
        ';padding:1px 4px;border-radius:3px;font-family:Menlo, Consolas, monospace;font-size:0.92em;">$1</code>',
    );
    return s;
  }
  function aedsRagFormat9(text) {
    var lines = (text || "").replace(/\r\n/g, "\n").split("\n");
    var html = "";
    var i = 0,
      n = lines.length;
    function esc(s) {
      return aedsRagEscape9(s);
    }
    function isTableSep(l) {
      return /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.indexOf("-") >= 0;
    }
    function splitRow(l) {
      var t = l.trim().replace(/^\||\|$/g, "");
      return t.split("|").map(function (c) {
        return c.trim();
      });
    }
    while (i < n) {
      var raw = lines[i];
      var trimmed = raw.trim();
      if (trimmed === "") {
        i++;
        continue;
      }
      if (trimmed.indexOf("|") >= 0 && i + 1 < n && isTableSep(lines[i + 1])) {
        var headerCells = splitRow(trimmed);
        i += 2;
        var rows = [];
        while (i < n && lines[i].trim() !== "" && lines[i].indexOf("|") >= 0) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        html +=
          '<div style="overflow-x:auto;margin:8px 0;"><table style="border-collapse:collapse;width:100%;font-size:13px;"><thead><tr>' +
          headerCells
            .map(function (c) {
              return (
                '<th style="text-align:left;border-bottom:2px solid ' +
                AEDS_PAL9.line +
                ';padding:4px 8px;white-space:nowrap;">' +
                aedsRagInline9(esc(c)) +
                "</th>"
              );
            })
            .join("") +
          "</tr></thead><tbody>" +
          rows
            .map(function (r) {
              return (
                "<tr>" +
                r
                  .map(function (c) {
                    return (
                      '<td style="border-bottom:1px solid ' +
                      AEDS_PAL9.line +
                      ';padding:4px 8px;white-space:nowrap;">' +
                      aedsRagInline9(esc(c)) +
                      "</td>"
                    );
                  })
                  .join("") +
                "</tr>"
              );
            })
            .join("") +
          "</tbody></table></div>";
        continue;
      }
      var h = /^(#{1,4})\s+(.*)$/.exec(trimmed);
      if (h) {
        var lvl = h[1].length,
          size = lvl === 1 ? 16 : lvl === 2 ? 15.5 : 15;
        html +=
          '<div style="font-weight:700;font-size:' +
          size +
          'px;margin:10px 0 4px;">' +
          aedsRagInline9(esc(h[2])) +
          "</div>";
        i++;
        continue;
      }
      if (/^[-*]\s+/.test(trimmed)) {
        var items = [];
        while (i < n && /^[-*]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
          i++;
        }
        html +=
          '<ul style="margin:4px 0;padding-left:20px;">' +
          items
            .map(function (it) {
              return (
                '<li style="margin-bottom:3px;">' +
                aedsRagInline9(esc(it)) +
                "</li>"
              );
            })
            .join("") +
          "</ul>";
        continue;
      }
      if (/^\d+\.\s+/.test(trimmed)) {
        var oitems = [];
        while (i < n && /^\d+\.\s+/.test(lines[i].trim())) {
          oitems.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
          i++;
        }
        html +=
          '<ol style="margin:4px 0;padding-left:20px;">' +
          oitems
            .map(function (it) {
              return (
                '<li style="margin-bottom:3px;">' +
                aedsRagInline9(esc(it)) +
                "</li>"
              );
            })
            .join("") +
          "</ol>";
        continue;
      }
      html +=
        '<div style="margin-bottom:4px;">' +
        aedsRagInline9(esc(raw)) +
        "</div>";
      i++;
    }
    return html;
  }
  function aedsRagCopyText9(text, cb) {
    function ok() {
      cb(true);
    }
    function fail() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      var copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (e) {}
      document.body.removeChild(ta);
      cb(copied);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, fail);
    } else {
      fail();
    }
  }
  var aedsRagState9 = {
    token: null,
    threadId: null,
    messages: [],
    open: false,
  };
  function aedsRagLoadState9() {
    try {
      aedsRagState9.token = localStorage.getItem("aedsRagToken") || null;
      aedsRagState9.threadId = localStorage.getItem("aedsRagThreadId") || null;
      var raw = localStorage.getItem("aedsRagMessages");
      aedsRagState9.messages = raw ? JSON.parse(raw) : [];
      aedsRagState9.includeCourses =
        localStorage.getItem("aedsRagIncludeCourses") === "1";
    } catch (e) {}
  }
  function aedsRagBuildCourseContext9() {
    var raw;
    try {
      raw = localStorage.getItem("ects-tracker-state");
    } catch (e) {
      return null;
    }
    if (!raw) return null;
    var state;
    try {
      state = JSON.parse(raw);
    } catch (e) {
      return null;
    }
    var courses = (state && state.courses) || [];
    if (!courses.length) return null;
    var byCat = {},
      codes = {},
      codesByCat = {},
      plannedByCat = {},
      overallGradeSum = 0,
      overallGradeEcts = 0;
    courses.forEach(function (c) {
      if (c.hypothetical) return;
      var isFail = c.status === "completed" && parseFloat(c.grade) > 4;
      var cat = c.category || "additional";
      if (!byCat[cat])
        byCat[cat] = {
          completedEcts: 0,
          completed: [],
          inProgress: [],
          planned: [],
          gradeSum: 0,
          gradeEcts: 0,
        };
      var code = typeof nt === "function" ? nt(c.name) : null;
      function addCode() {
        if (!code) return;
        codes[code] = true;
        if (!codesByCat[cat]) codesByCat[cat] = {};
        codesByCat[cat][code] = true;
      }
      if (c.status === "completed" && !isFail) {
        byCat[cat].completedEcts += c.ects || 0;
        byCat[cat].completed.push(c.name);
        addCode();
        var grade = parseFloat(c.grade);
        if (grade) {
          byCat[cat].gradeSum += (c.ects || 0) * grade;
          byCat[cat].gradeEcts += c.ects || 0;
          if (cat !== "additional") {
            overallGradeSum += (c.ects || 0) * grade;
            overallGradeEcts += c.ects || 0;
          }
        }
      } else if (c.status === "in-progress") {
        byCat[cat].inProgress.push(c.name);
        addCode();
      } else if (c.status === "planned") {
        byCat[cat].planned.push(c.name);
        if (code) {
          if (!plannedByCat[cat]) plannedByCat[cat] = {};
          plannedByCat[cat][code] = true;
        }
      }
    });
    var lines = [],
      totalCompleted = 0;
    (typeof Zs !== "undefined" ? Zs : []).forEach(function (z) {
      var g = byCat[z.id];
      if (!g) return;
      totalCompleted += g.completedEcts;
      var parts = [];
      if (g.completed.length)
        parts.push("completed: " + g.completed.join("; "));
      if (g.inProgress.length)
        parts.push("in progress: " + g.inProgress.join("; "));
      if (g.planned.length) parts.push("planned: " + g.planned.join("; "));
      if (g.gradeEcts > 0)
        parts.push(
          "GPA: " +
            (Math.round((g.gradeSum / g.gradeEcts) * 100) / 100).toFixed(2),
        );
      if (parts.length) {
        lines.push(
          z.name +
            " (" +
            g.completedEcts +
            (z.required ? "/" + z.required : "") +
            " ECTS) - " +
            parts.join(" | "),
        );
      }
    });
    if (!lines.length) return null;
    var codeList = Object.keys(codes);
    var result =
      "My ECTS Tracker progress (" +
      totalCompleted +
      "/120 ECTS completed):\n" +
      lines.join("\n");
    if (overallGradeEcts > 0)
      result +=
        "\nOverall GPA: " +
        (Math.round((overallGradeSum / overallGradeEcts) * 100) / 100).toFixed(
          2,
        ) +
        " (German scale, 1.0 best - 5.0 fail)";
    var targetGrade = parseFloat(state && state.targetGrade),
      remainingEctsForGpa = 120 - overallGradeEcts;
    if (targetGrade && remainingEctsForGpa > 0) {
      var requiredAvg =
        (targetGrade * 120 - overallGradeSum) / remainingEctsForGpa;
      result +=
        "\nTarget GPA: " +
        targetGrade.toFixed(2) +
        " (need average " +
        requiredAvg.toFixed(2) +
        " across the next " +
        remainingEctsForGpa +
        " ECTS to reach this)";
    }
    if (codeList.length) {
      result +=
        "\nCodes already completed or in progress: " + codeList.join(", ");
      var catParts = [];
      Object.keys(codesByCat).forEach(function (cat) {
        var cc = Object.keys(codesByCat[cat]);
        if (cc.length) catParts.push(cat + ": " + cc.join(", "));
      });
      if (catParts.length)
        result += "\nCodes by category: " + catParts.join("; ");
    }
    var plannedParts = [];
    Object.keys(plannedByCat).forEach(function (cat) {
      var pc = Object.keys(plannedByCat[cat]);
      if (pc.length) plannedParts.push(cat + ": " + pc.join(", "));
    });
    if (plannedParts.length)
      result += "\nPlanned codes by category: " + plannedParts.join("; ");
    return result;
  }
  function aedsRagSaveMessages9() {
    try {
      localStorage.setItem(
        "aedsRagMessages",
        JSON.stringify(aedsRagState9.messages),
      );
    } catch (e) {}
  }
  function aedsRagEnsureToken9() {
    if (aedsRagState9.token) return Promise.resolve(aedsRagState9.token);
    return fetch(AEDS_RAG_BASE9 + "/auth/guest", { method: "POST" })
      .then(function (r) {
        if (!r.ok)
          throw new Error("Could not start a session (" + r.status + ")");
        return r.json();
      })
      .then(function (data) {
        aedsRagState9.token = data.access_token;
        try {
          localStorage.setItem("aedsRagToken", data.access_token);
        } catch (e) {}
        return aedsRagState9.token;
      });
  }
  function aedsRagPostChat9(message, retried) {
    return aedsRagEnsureToken9().then(function (token) {
      return fetch(AEDS_RAG_BASE9 + "/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          message: message,
          thread_id: aedsRagState9.threadId,
        }),
      }).then(function (r) {
        if (r.status === 401 && !retried) {
          aedsRagState9.token = null;
          try {
            localStorage.removeItem("aedsRagToken");
          } catch (e) {}
          return aedsRagPostChat9(message, true);
        }
        return r
          .json()
          .catch(function () {
            return {};
          })
          .then(function (body) {
            if (!r.ok)
              throw new Error(
                body.detail || "Request failed (" + r.status + ")",
              );
            return body;
          });
      });
    });
  }
  function aedsRagSendFeedback9(queryLogId, rating, retried) {
    return aedsRagEnsureToken9().then(function (token) {
      return fetch(AEDS_RAG_BASE9 + "/chat/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ query_log_id: queryLogId, rating: rating }),
      }).then(function (r) {
        if (r.status === 401 && !retried) {
          aedsRagState9.token = null;
          try {
            localStorage.removeItem("aedsRagToken");
          } catch (e) {}
          return aedsRagSendFeedback9(queryLogId, rating, true);
        }
        if (!r.ok)
          throw new Error("Feedback request failed (" + r.status + ")");
        return true;
      });
    });
  }
  function aedsRagInit9() {
    aedsRagLoadState9();
    var F = "font-family:'Fraunces Variable', Georgia, serif;";
    var P = AEDS_PAL9;
    var styleEl = document.createElement("style");
    styleEl.textContent =
      ".aedsRagPanel9{position:fixed;right:20px;bottom:calc(var(--aeds-bubble-bottom, 20px) + 68px);width:360px;height:520px;max-height:calc(100vh - 110px);z-index:9500;opacity:0;pointer-events:none;transition:opacity .2s ease;}.aedsRagPanel9.aedsRagOpen9{opacity:1;pointer-events:auto;}@media (max-width:640px){.aedsRagPanel9{right:0;bottom:0;top:0;left:0;width:100%;height:auto;max-height:none;border-radius:0 !important;}.aedsRagInputRow9{position:fixed;left:0;right:0;bottom:0;z-index:9502;padding-bottom:calc(10px + env(safe-area-inset-bottom)) !important}.aedsRagBody9{padding-bottom:100px !important}}@keyframes aedsRagBounce9{0%,60%,100%{transform:translateY(0);opacity:0.4}30%{transform:translateY(-4px);opacity:1}}@keyframes aedsRagMsgIn9{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}@keyframes aedsRagBtnIn9{from{transform:scale(0.7);opacity:0}to{transform:scale(1);opacity:1}}.aedsRagDot9{display:inline-block;width:6px;height:6px;border-radius:50%;background:" +
      P.muted +
      ";margin:0 2px;animation:aedsRagBounce9 1.2s infinite ease-in-out;}.aedsRagDot9:nth-child(2){animation-delay:.15s}.aedsRagDot9:nth-child(3){animation-delay:.3s}.aedsRagMsg9{animation:aedsRagMsgIn9 .18s ease;}.aedsRagBody9::-webkit-scrollbar{display:none;width:0;height:0;}";
    document.head.appendChild(styleEl);
    var chatIconSvg =
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>';
    var closeIconSvg =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    var externalLinkIconSvg9 =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>';
    var trashIconSvg =
      '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';
    var copyIconSvg =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    var checkIconSvg =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    var thumbUpIconSvg =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"></path><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>';
    var thumbDownIconSvg =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"></path><path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path></svg>';
    var sendIconSvg =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>';
    var btn = document.createElement("button");
    btn.setAttribute("aria-label", "Open AEDS AI Assistant chat");
    btn.style.cssText =
      F +
      "position:fixed;right:calc(20px + env(safe-area-inset-right));bottom:calc(var(--aeds-bubble-bottom, 20px) + env(safe-area-inset-bottom));width:56px;height:56px;border-radius:50%;border:none;background:" +
      P.accent +
      ";color:" +
      P.panel +
      ";cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,0.25);z-index:9500;display:flex;align-items:center;justify-content:center;transition:transform .15s ease, box-shadow .15s ease;animation:aedsRagBtnIn9 .25s ease;";
    btn.onmouseenter = function () {
      btn.style.transform = "scale(1.06)";
      btn.style.boxShadow = "0 8px 24px rgba(0,0,0,0.3)";
    };
    btn.onmouseleave = function () {
      btn.style.transform = "scale(1)";
      btn.style.boxShadow = "0 6px 20px rgba(0,0,0,0.25)";
    };
    btn.innerHTML = chatIconSvg;
    var panel = document.createElement("div");
    panel.className = "aedsRagPanel9";
    panel.style.cssText =
      F +
      "display:flex;flex-direction:column;background:" +
      P.panel +
      ";border:1px solid " +
      P.line +
      ";border-radius:30px;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;";
    var header = document.createElement("div");
    header.style.cssText =
      F +
      "display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:" +
      P.accent +
      ";color:" +
      P.panel +
      ";flex-shrink:0;";
    var headerTitle = document.createElement("div");
    headerTitle.textContent = "AEDS AI Assistant";
    headerTitle.style.cssText = F + "font-weight:700;font-size:15px;";
    var headerLeft9 = document.createElement("div");
    headerLeft9.style.cssText = "display:flex;align-items:center;gap:6px;";
    headerLeft9.appendChild(headerTitle);
    var openLinkBtn9 = document.createElement("a");
    openLinkBtn9.href = "https://ofurkancoban.github.io/AEDS_RAG_Assistant/";
    openLinkBtn9.target = "_blank";
    openLinkBtn9.rel = "noopener noreferrer";
    openLinkBtn9.setAttribute(
      "aria-label",
      "Open AEDS AI Assistant in a new tab",
    );
    openLinkBtn9.title = "Open in a new tab";
    openLinkBtn9.style.cssText =
      F +
      "display:flex;align-items:center;color:" +
      P.panel +
      ";opacity:0.8;transition:opacity .15s ease;";
    openLinkBtn9.innerHTML = externalLinkIconSvg9;
    openLinkBtn9.onmouseenter = function () {
      openLinkBtn9.style.opacity = "1";
    };
    openLinkBtn9.onmouseleave = function () {
      openLinkBtn9.style.opacity = "0.8";
    };
    headerLeft9.appendChild(openLinkBtn9);
    header.appendChild(headerLeft9);
    var headerBtns = document.createElement("div");
    headerBtns.style.cssText = "display:flex;align-items:center;gap:10px;";
    var clearBtn = document.createElement("button");
    clearBtn.innerHTML = trashIconSvg;
    clearBtn.setAttribute("aria-label", "Clear chat history");
    clearBtn.title = "Clear chat history";
    clearBtn.style.cssText =
      F +
      "border:none;background:transparent;color:" +
      P.panel +
      ";cursor:pointer;display:flex;align-items:center;padding:2px;transition:opacity .15s ease;";
    clearBtn.onmouseenter = function () {
      clearBtn.style.opacity = "0.7";
    };
    clearBtn.onmouseleave = function () {
      clearBtn.style.opacity = "1";
    };
    function aedsRagConfirm9(message, onYes) {
      var overlay = document.createElement("div");
      overlay.style.cssText =
        "position:absolute;inset:0;background:rgba(28,35,51,0.45);display:flex;align-items:center;justify-content:center;z-index:20;padding:20px;";
      var card = document.createElement("div");
      card.style.cssText =
        F +
        "background:" +
        P.panel +
        ";color:" +
        P.ink +
        ";border-radius:12px;padding:18px;max-width:280px;width:100%;box-shadow:0 12px 30px rgba(0,0,0,0.25);";
      var msgEl = document.createElement("div");
      msgEl.textContent = message;
      msgEl.style.cssText =
        F + "font-size:14px;line-height:1.5;margin-bottom:14px;";
      card.appendChild(msgEl);
      var btnRow = document.createElement("div");
      btnRow.style.cssText = "display:flex;justify-content:flex-end;gap:8px;";
      var cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Cancel";
      cancelBtn.style.cssText =
        F +
        "border:1px solid " +
        P.line +
        ";background:transparent;color:" +
        P.ink +
        ";border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px;";
      cancelBtn.onclick = function () {
        panel.removeChild(overlay);
      };
      var yesBtn = document.createElement("button");
      yesBtn.textContent = "Clear";
      yesBtn.style.cssText =
        F +
        "border:none;background:" +
        P.warn +
        ";color:" +
        P.panel +
        ";border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px;font-weight:600;";
      yesBtn.onclick = function () {
        panel.removeChild(overlay);
        onYes();
      };
      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(yesBtn);
      card.appendChild(btnRow);
      overlay.appendChild(card);
      panel.appendChild(overlay);
    }
    clearBtn.onclick = function () {
      aedsRagConfirm9(
        "Clear this chat history? This cannot be undone.",
        function () {
          aedsRagState9.messages = [];
          aedsRagState9.threadId = null;
          try {
            localStorage.removeItem("aedsRagMessages");
            localStorage.removeItem("aedsRagThreadId");
          } catch (e) {}
          body.innerHTML = "";
          renderMessage({
            role: "assistant",
            text: "Hey! Think of me as your AEDS know-it-all, ask me about admission, deadlines, courses, or exams, and let's figure it out together.",
          });
        },
      );
    };
    headerBtns.appendChild(clearBtn);
    var closeBtn = document.createElement("button");
    closeBtn.innerHTML = closeIconSvg;
    closeBtn.setAttribute("aria-label", "Close chat");
    closeBtn.style.cssText =
      F +
      "border:none;background:transparent;color:" +
      P.panel +
      ";cursor:pointer;display:flex;align-items:center;padding:2px;transition:opacity .15s ease;";
    closeBtn.onmouseenter = function () {
      closeBtn.style.opacity = "0.7";
    };
    closeBtn.onmouseleave = function () {
      closeBtn.style.opacity = "1";
    };
    headerBtns.appendChild(closeBtn);
    header.appendChild(headerBtns);
    panel.appendChild(header);
    var body = document.createElement("div");
    body.className = "aedsRagBody9";
    body.style.cssText =
      F +
      "flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;scrollbar-width:none;padding:14px;background:" +
      P.paper +
      ";display:flex;flex-direction:column;gap:10px;";
    panel.appendChild(body);
    var inputRow = document.createElement("div");
    inputRow.className = "aedsRagInputRow9";
    inputRow.style.cssText =
      "display:flex;flex-direction:column;gap:6px;padding:8px 12px 10px;border-top:1px solid " +
      P.line +
      ";background:" +
      P.panel +
      ";flex-shrink:0;";
    var toggleRow = document.createElement("label");
    toggleRow.style.cssText =
      F +
      "display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11.5px;color:" +
      P.muted +
      ";user-select:none;";
    var toggleCheckbox = document.createElement("input");
    toggleCheckbox.type = "checkbox";
    toggleCheckbox.checked = aedsRagState9.includeCourses;
    toggleCheckbox.style.cssText =
      "margin:0;accent-color:" +
      P.accent +
      ";cursor:pointer;width:13px;height:13px;";
    toggleCheckbox.onchange = function () {
      aedsRagState9.includeCourses = toggleCheckbox.checked;
      try {
        localStorage.setItem(
          "aedsRagIncludeCourses",
          toggleCheckbox.checked ? "1" : "0",
        );
      } catch (e) {}
    };
    var toggleLabel = document.createElement("span");
    toggleLabel.textContent = "Consider my course list";
    toggleRow.appendChild(toggleCheckbox);
    toggleRow.appendChild(toggleLabel);
    inputRow.appendChild(toggleRow);
    var pillWrap = document.createElement("div");
    pillWrap.style.cssText =
      "display:flex;align-items:flex-end;gap:6px;width:100%;box-sizing:border-box;background:" +
      P.paper +
      ";border:1px solid " +
      P.line +
      ";border-radius:22px;padding:6px 6px 6px 16px;box-shadow:inset 0 1px 2px rgba(28,35,51,0.05);transition:border-color .15s ease, box-shadow .15s ease;";
    var textarea = document.createElement("textarea");
    textarea.placeholder = "Ask about the AEDS programme...";
    textarea.rows = 1;
    textarea.style.cssText =
      F +
      "flex:1;min-width:0;box-sizing:border-box;resize:none;border:none;outline:none;background:transparent;padding:6px 0;font-size:16px;color:" +
      P.ink +
      ";max-height:100px;line-height:1.4;";
    textarea.onfocus = function () {
      pillWrap.style.borderColor = P.accent;
      pillWrap.style.boxShadow = "0 0 0 3px rgba(47,111,109,0.12)";
    };
    textarea.onblur = function () {
      pillWrap.style.borderColor = P.line;
      pillWrap.style.boxShadow = "inset 0 1px 2px rgba(28,35,51,0.05)";
    };
    var sendBtn = document.createElement("button");
    sendBtn.setAttribute("aria-label", "Send message");
    sendBtn.innerHTML = sendIconSvg;
    sendBtn.style.cssText =
      "flex-shrink:0;width:34px;height:34px;border:none;border-radius:50%;background:" +
      P.accent +
      ";color:" +
      P.panel +
      ";cursor:pointer;display:flex;align-items:center;justify-content:center;transition:opacity .15s ease, transform .1s ease;";
    sendBtn.onmousedown = function () {
      sendBtn.style.transform = "scale(0.9)";
    };
    sendBtn.onmouseup = function () {
      sendBtn.style.transform = "scale(1)";
    };
    pillWrap.appendChild(textarea);
    pillWrap.appendChild(sendBtn);
    inputRow.appendChild(pillWrap);
    panel.appendChild(inputRow);
    if (window.matchMedia && window.matchMedia("(max-width:640px)").matches) {
      inputRow.style.display = "none";
    }
    document.body.appendChild(btn);
    document.body.appendChild(panel);
    function renderMessage(msg) {
      var wrap = document.createElement("div");
      wrap.className = "aedsRagMsg9";
      wrap.style.cssText =
        "display:flex;flex-direction:column;align-items:" +
        (msg.role === "user" ? "flex-end" : "flex-start") +
        ";";
      var bubble = document.createElement("div");
      var isSystem = msg.role === "system";
      bubble.style.cssText =
        F +
        "position:relative;max-width:80%;padding:10px 14px;border-radius:22px;font-size:14px;line-height:1.55;" +
        (msg.role === "user"
          ? "background:rgba(47,111,109,0.13);color:" +
            P.ink +
            ";border:1px solid rgba(47,111,109,0.28);border-bottom-right-radius:3px;box-shadow:0 1px 4px rgba(47,111,109,0.10);"
          : isSystem
            ? "background:transparent;color:" +
              P.warn +
              ";font-style:italic;font-size:12.5px;"
            : "background:" +
              P.panel +
              ";color:" +
              P.ink +
              ";border:1px solid " +
              P.line +
              ";border-bottom-left-radius:3px;box-shadow:0 1px 4px rgba(28,35,51,0.06);padding-bottom:26px;");
      bubble.innerHTML =
        msg.role === "user"
          ? aedsRagEscape9(msg.text)
          : aedsRagFormat9(msg.text);
      if (msg.role === "assistant") {
        var actionRow = document.createElement("div");
        actionRow.style.cssText =
          "position:absolute;bottom:4px;right:6px;display:flex;align-items:center;gap:0px;";
        if (msg.queryLogId) {
          var thumbUpBtn = document.createElement("button");
          thumbUpBtn.setAttribute("aria-label", "Good answer");
          thumbUpBtn.title = "Good answer";
          thumbUpBtn.innerHTML = thumbUpIconSvg;
          thumbUpBtn.style.cssText =
            F +
            "border:none;background:transparent;cursor:pointer;padding:5px;display:inline-flex;align-items:center;color:" +
            (msg.feedbackRating === 1 ? P.accent : P.muted) +
            ";";
          var thumbDownBtn = document.createElement("button");
          thumbDownBtn.setAttribute("aria-label", "Poor answer");
          thumbDownBtn.title = "Poor answer";
          thumbDownBtn.innerHTML = thumbDownIconSvg;
          thumbDownBtn.style.cssText =
            F +
            "border:none;background:transparent;cursor:pointer;padding:5px;display:inline-flex;align-items:center;color:" +
            (msg.feedbackRating === -1 ? P.warn : P.muted) +
            ";";
          thumbUpBtn.onclick = function () {
            msg.feedbackRating = 1;
            thumbUpBtn.style.color = P.accent;
            thumbDownBtn.style.color = P.muted;
            aedsRagSaveMessages9();
            aedsRagSendFeedback9(msg.queryLogId, 1).catch(function () {});
          };
          thumbDownBtn.onclick = function () {
            msg.feedbackRating = -1;
            thumbDownBtn.style.color = P.warn;
            thumbUpBtn.style.color = P.muted;
            aedsRagSaveMessages9();
            aedsRagSendFeedback9(msg.queryLogId, -1).catch(function () {});
          };
          actionRow.appendChild(thumbDownBtn);
          actionRow.appendChild(thumbUpBtn);
        }
        var copyBtn = document.createElement("button");
        copyBtn.setAttribute("aria-label", "Copy message");
        copyBtn.title = "Copy";
        copyBtn.innerHTML = copyIconSvg;
        copyBtn.style.cssText =
          F +
          "border:none;background:transparent;color:" +
          P.muted +
          ";cursor:pointer;padding:5px;display:inline-flex;align-items:center;";
        copyBtn.onclick = function () {
          aedsRagCopyText9(msg.text, function (ok) {
            copyBtn.innerHTML = ok ? checkIconSvg : copyIconSvg;
            setTimeout(function () {
              copyBtn.innerHTML = copyIconSvg;
            }, 1500);
          });
        };
        actionRow.appendChild(copyBtn);
        bubble.appendChild(actionRow);
      }
      wrap.appendChild(bubble);
      body.appendChild(wrap);
      body.scrollTop = body.scrollHeight;
    }
    aedsRagState9.messages.forEach(renderMessage);
    var chipsRow9 = null;
    if (!aedsRagState9.messages.length) {
      renderMessage({
        role: "assistant",
        text: "Hey! Think of me as your AEDS know-it-all, ask me about admission, deadlines, courses, or exams, and let's figure it out together.",
      });
      chipsRow9 = document.createElement("div");
      chipsRow9.style.cssText =
        "display:flex;flex-wrap:wrap;gap:6px;margin-top:-2px;";
      [
        "How many ECTS do I need to graduate?",
        "Which courses should I take next semester?",
      ].forEach(function (q) {
        var chip = document.createElement("button");
        chip.textContent = q;
        chip.style.cssText =
          F +
          "border:1px solid " +
          P.line +
          ";background:" +
          P.panel +
          ";color:" +
          P.ink +
          ";border-radius:16px;padding:6px 12px;font-size:12.5px;cursor:pointer;text-align:left;transition:background .15s ease;";
        chip.onmouseenter = function () {
          chip.style.background = P.paper;
        };
        chip.onmouseleave = function () {
          chip.style.background = P.panel;
        };
        chip.onclick = function () {
          textarea.value = q;
          doSend();
        };
        chipsRow9.appendChild(chip);
      });
      body.appendChild(chipsRow9);
    }
    var sending = false;
    function doSend() {
      var text = textarea.value.trim();
      if (!text || sending) return;
      textarea.value = "";
      textarea.style.height = "auto";
      if (chipsRow9) {
        body.removeChild(chipsRow9);
        chipsRow9 = null;
      }
      sending = true;
      sendBtn.disabled = true;
      sendBtn.style.opacity = "0.6";
      var userMsg = { role: "user", text: text };
      aedsRagState9.messages.push(userMsg);
      renderMessage(userMsg);
      aedsRagSaveMessages9();
      var thinking = document.createElement("div");
      thinking.className = "aedsRagMsg9";
      thinking.style.cssText =
        F +
        "align-self:flex-start;display:inline-flex;align-items:center;gap:3px;padding:11px 16px;border-radius:22px;border-bottom-left-radius:3px;background:" +
        P.panel +
        ";border:1px solid " +
        P.line +
        ";box-shadow:0 1px 4px rgba(28,35,51,0.06);";
      thinking.innerHTML =
        '<span class="aedsRagDot9"></span><span class="aedsRagDot9"></span><span class="aedsRagDot9"></span>';
      body.appendChild(thinking);
      body.scrollTop = body.scrollHeight;
      var apiMessage = text;
      if (aedsRagState9.includeCourses) {
        var courseCtx = aedsRagBuildCourseContext9();
        if (courseCtx) apiMessage = courseCtx + "\n\nQuestion: " + text;
      }
      aedsRagPostChat9(apiMessage, false)
        .then(function (res) {
          body.removeChild(thinking);
          aedsRagState9.threadId = res.thread_id;
          try {
            localStorage.setItem("aedsRagThreadId", res.thread_id);
          } catch (e) {}
          var assistantMsg = {
            role: "assistant",
            text: res.answer,
            sources: res.sources || [],
            queryLogId: res.query_log_id || null,
          };
          aedsRagState9.messages.push(assistantMsg);
          renderMessage(assistantMsg);
          aedsRagSaveMessages9();
        })
        .catch(function (err) {
          body.removeChild(thinking);
          var sysMsg = {
            role: "system",
            text:
              err && err.message
                ? err.message
                : "Something went wrong, please try again.",
          };
          aedsRagState9.messages.push(sysMsg);
          renderMessage(sysMsg);
          aedsRagSaveMessages9();
        })
        .finally(function () {
          sending = false;
          sendBtn.disabled = false;
          sendBtn.style.opacity = "1";
        });
    }
    sendBtn.onclick = doSend;
    textarea.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });
    textarea.addEventListener("input", function () {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(100, textarea.scrollHeight) + "px";
    });
    function aedsRagSyncInputPos9() {
      var isMobile9 =
        window.matchMedia && window.matchMedia("(max-width:640px)").matches;
      if (!isMobile9 || !window.visualViewport) {
        inputRow.style.transform = "";
        return;
      }
      var vv = window.visualViewport;
      var offset = window.innerHeight - vv.height - vv.offsetTop;
      inputRow.style.transform =
        offset > 1 ? "translateY(-" + offset + "px)" : "";
    }
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", aedsRagSyncInputPos9);
      window.visualViewport.addEventListener("scroll", aedsRagSyncInputPos9);
    }
    function setOpen(open) {
      aedsRagState9.open = open;
      panel.classList.toggle("aedsRagOpen9", open);
      var isMobile =
        window.matchMedia && window.matchMedia("(max-width:640px)").matches;
      btn.style.display = open && isMobile ? "none" : "flex";
      btn.innerHTML = open ? closeIconSvg : chatIconSvg;
      if (isMobile) {
        inputRow.style.display = open ? "flex" : "none";
      }
      if (open) {
        aedsRagSyncInputPos9();
        setTimeout(function () {
          textarea.focus();
        }, 120);
      }
    }
    btn.onclick = function () {
      setOpen(!aedsRagState9.open);
    };
    closeBtn.onclick = function () {
      setOpen(false);
    };
  }


export { openStuMSSyncModal9 as openStuMSSyncModal, aedsRagInit9 as initAssistant };
