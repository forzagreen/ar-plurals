/* جموع التكسير — searchable table + Sankey + correspondence matrix over window.PLURALS (data.js). */
(function () {
  "use strict";

  var REPO_URL = "https://github.com/forzagreen/ar-plurals"; // shows the header GitHub link
  var SEP = ""; // internal id separator (never appears in data)

  var DB = window.PLURALS || { rows: [], generated: "" };
  var ROWS = DB.rows;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  // read a themeable token so the canvas Sankey matches the active light/dark palette
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /* ----------------------------- Arabic helpers ----------------------------- */
  var DIAC = /[ً-ْٰـ]/;
  function fold(ch) {
    if ("أإآٱ".indexOf(ch) >= 0) return "ا";
    if (ch === "ى") return "ي";
    if (ch === "ة") return "ه";
    return ch;
  }
  function buildNorm(str) {
    var norm = "", map = [];
    for (var i = 0; i < str.length; i++) {
      if (DIAC.test(str[i])) continue;
      norm += fold(str[i]); map.push(i);
    }
    return { norm: norm, map: map };
  }
  function normalize(str) { return buildNorm(str).norm; }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  // diacritic-insensitive highlight of normalized query nq within str
  function hl(str, nq) {
    if (!nq) return esc(str);
    var b = buildNorm(str), hay = b.norm, out = "", pos = 0, from = 0, idx;
    var ranges = [];
    while ((idx = hay.indexOf(nq, from)) !== -1) {
      ranges.push([b.map[idx], b.map[idx + nq.length - 1] + 1]);
      from = idx + nq.length;
    }
    if (!ranges.length) return esc(str);
    ranges.forEach(function (r) {
      out += esc(str.slice(pos, r[0])) + "<mark>" + esc(str.slice(r[0], r[1])) + "</mark>";
      pos = r[1];
    });
    return out + esc(str.slice(pos));
  }

  /* ------------------------------ derived index ----------------------------- */
  var singulars = [], plurals = [], cellMap = {}, outAdj = {}, inAdj = {};
  (function build() {
    var ss = {}, ps = {};
    ROWS.forEach(function (r) {
      if (!ss[r.singular]) { ss[r.singular] = 1; singulars.push(r.singular); }
      if (!ps[r.plural]) { ps[r.plural] = 1; plurals.push(r.plural); }
      var k = r.singular + SEP + r.plural;
      (cellMap[k] = cellMap[k] || []).push(r);
      (outAdj[r.singular] = outAdj[r.singular] || {})[r.plural] = 1;
      (inAdj[r.plural] = inAdj[r.plural] || {})[r.singular] = 1;
      r._ns = normalize(r.singular);
      r._np = normalize(r.plural);
      r._n = r._ns + " " + r._np + " " + normalize(r.type + " " + r.examples);
    });
    var coll = new Intl.Collator("ar");
    singulars.sort(coll.compare);
    plurals.sort(coll.compare);
  })();
  function outDeg(s) { return Object.keys(outAdj[s] || {}).length; }
  function inDeg(p) { return Object.keys(inAdj[p] || {}).length; }
  function isSingular(p) { return !!outAdj[p]; }
  // Arabic counted-noun (تمييز) agreement for «وزن» after a preposition:
  // 1 → مفرد، 2 → مثنى، 3–10 → جمع، 11+ → مفرد منصوب.
  function countWazn(n) {
    if (n === 1) return "وزن واحد";
    if (n === 2) return "وزنين اثنين";
    if (n <= 10) return n + " أوزان";
    return n + " وزنًا";
  }

  /* --------------------------- example rendering ---------------------------- */
  function tag(type) {
    return '<span class="tag ' + (type === "صفة" ? "adj" : "noun") + '">' + type + "</span>";
  }
  // singular sits on the right (RTL), plural on the left, so the arrow points left
  function pairChip(p, nq) {
    return '<span class="pair"><b>' + hl(p.s, nq) + '</b><i>←</i><b>' + hl(p.p, nq) + "</b></span>";
  }
  // render the structured example blocks of one row
  function renderBlocks(blocks, nq) {
    if (!blocks || !blocks.length) return "";
    return blocks.map(function (b) {
      var head = "";
      if (b.cond) head += '<span class="cond">' + hl(b.cond, nq) + "</span>";
      if (b.irregular) head += '<span class="badge-shadh">شاذّ</span>';
      var pairs = (b.pairs || []).map(function (p) { return pairChip(p, nq); }).join("");
      var note = b.note ? '<span class="ex-note">' + hl(b.note, nq) + "</span>" : "";
      return '<div class="ex-block">' + (head ? '<div class="ex-head">' + head + "</div>" : "") +
        '<div class="ex-pairs">' + pairs + "</div>" + note + "</div>";
    }).join("");
  }

  /* ================================ TABLE =================================== */
  // exact: null (free search) | {s,p} (exact pattern filter from a click)
  var state = { q: "", nq: "", type: "all", mode: "flat", exact: null };

  function matchRow(r) {
    if (state.type !== "all" && r.type !== state.type) return false;
    if (state.exact) {
      if (state.exact.s != null && r.singular !== state.exact.s) return false;
      if (state.exact.p != null && r.plural !== state.exact.p) return false;
      return true;
    }
    return !state.nq || r._n.indexOf(state.nq) !== -1;
  }
  // ranking for free-text search: exact column match first, then pattern, then examples
  function tier(r) {
    if (r._ns === state.nq || r._np === state.nq) return 0;
    if (r._ns.indexOf(state.nq) !== -1 || r._np.indexOf(state.nq) !== -1) return 1;
    return 2;
  }
  function patternCell(p, nq, role) {
    return '<span class="pattern clickable" data-pattern="' + esc(p) + '" data-role="' + role +
      '">' + hl(p, nq) + "</span>";
  }

  function renderTable() {
    var rows = ROWS.filter(matchRow);
    if (!state.exact && state.nq && state.mode === "flat") {
      rows = rows.slice().sort(function (a, b) { return tier(a) - tier(b); }); // stable
    }
    $("#result-count").textContent = "عدد النتائج: " + rows.length + " من " + ROWS.length;
    renderActiveFilter();
    var table = $("#table"), empty = $("#empty");
    if (!rows.length) { table.innerHTML = ""; empty.hidden = false; return; }
    empty.hidden = true;
    if (state.mode === "flat") renderFlat(table, rows);
    else renderGrouped(table, rows, state.mode === "bySingular");
    wirePatterns(table);
  }
  function renderFlat(table, rows) {
    var h = "<thead><tr><th>المفرد</th><th>النوع</th><th>الجمع</th><th>الأمثلة</th></tr></thead><tbody>";
    rows.forEach(function (r) {
      h += "<tr><td>" + patternCell(r.singular, state.nq, "s") + "</td><td>" + tag(r.type) +
        "</td><td>" + patternCell(r.plural, state.nq, "p") + '</td><td class="col-examples">' +
        renderBlocks(r.blocks, state.nq) + "</td></tr>";
    });
    table.innerHTML = h + "</tbody>";
  }
  function renderGrouped(table, rows, bySingular) {
    var gk = bySingular ? "singular" : "plural", ok = bySingular ? "plural" : "singular";
    var gRole = bySingular ? "s" : "p", oRole = bySingular ? "p" : "s";
    var order = bySingular ? singulars : plurals;
    var buckets = {};
    rows.forEach(function (r) { (buckets[r[gk]] = buckets[r[gk]] || []).push(r); });
    var h = "<thead><tr><th>" + (bySingular ? "المفرد" : "الجمع") + "</th><th>النوع</th><th>" +
      (bySingular ? "الجمع" : "المفرد") + "</th><th>الأمثلة</th></tr></thead><tbody>";
    order.forEach(function (key) {
      var items = buckets[key]; if (!items) return;
      items.forEach(function (r, i) {
        h += "<tr" + (i === 0 ? ' class="group-start"' : "") + ">";
        if (i === 0) h += '<td class="col-group" rowspan="' + items.length + '">' +
          patternCell(key, state.nq, gRole) + '<span class="count-pill">' + items.length + "</span></td>";
        h += "<td>" + tag(r.type) + "</td><td>" + patternCell(r[ok], state.nq, oRole) +
          '</td><td class="col-examples">' + renderBlocks(r.blocks, state.nq) + "</td></tr>";
      });
    });
    table.innerHTML = h + "</tbody>";
  }
  function wirePatterns(scope) {
    scope.querySelectorAll(".pattern.clickable").forEach(function (el) {
      el.addEventListener("click", function () {
        var pat = el.getAttribute("data-pattern"), role = el.getAttribute("data-role");
        if (role === "p") filterExact({ p: pat }, "byPlural");
        else filterExact({ s: pat }, "bySingular");
      });
    });
  }
  // shared helpers (used by the Sankey focus list)
  function opt(kind, name) { return '<option value="' + kind + SEP + esc(name) + '">' + esc(name) + "</option>"; }
  function richest(list, deg) {
    return list.slice().sort(function (a, b) { return deg(b) - deg(a); })[0];
  }
  // clicking a pattern → exact filter on that wazn; a matrix cell → exact pair
  function filterExact(exact, mode) {
    state.exact = exact;
    state.q = ""; state.nq = "";
    $("#search").value = "";
    if (mode) setMode(mode);
    renderTable();
    switchView("table");
  }
  function clearFilter() {
    state.exact = null; state.q = ""; state.nq = "";
    $("#search").value = "";
    renderTable();
  }
  function setMode(mode) {
    state.mode = mode;
    var btn = document.querySelector('#mode-filter .chip[data-mode="' + mode + '"]');
    if (btn) setActive("#mode-filter", btn);
  }
  function renderActiveFilter() {
    var el = $("#active-filter");
    if (!state.exact) { el.hidden = true; el.innerHTML = ""; return; }
    var label;
    if (state.exact.s != null && state.exact.p != null)
      label = "<b>" + esc(state.exact.s) + "</b> ← <b>" + esc(state.exact.p) + "</b>";
    else if (state.exact.s != null) label = "وزن المفرد: <b>" + esc(state.exact.s) + "</b>";
    else label = "وزن الجمع: <b>" + esc(state.exact.p) + "</b>";
    el.innerHTML = '<span class="filter-chip">عرض ' + label +
      ' <button class="x" type="button" aria-label="إلغاء التصفية">✕</button></span>';
    el.hidden = false;
    el.querySelector(".x").addEventListener("click", clearFilter);
  }

  /* ================================ MATRIX ================================= */
  var matrixOrder = "degree";
  function renderMatrix() {
    var coll = new Intl.Collator("ar");
    var rowsOrder = singulars.slice(), colsOrder = plurals.slice();
    if (matrixOrder === "degree") {
      rowsOrder.sort(function (a, b) { return outDeg(b) - outDeg(a) || coll.compare(a, b); });
      colsOrder.sort(function (a, b) { return inDeg(b) - inDeg(a) || coll.compare(a, b); });
    } else {
      rowsOrder.sort(coll.compare); colsOrder.sort(coll.compare);
    }

    var h = '<table class="matrix"><thead><tr><th class="corner">' +
      '<span class="cax">أوزان الجمع ←</span><span class="rax">أوزان المفرد ↓</span></th>';
    colsOrder.forEach(function (p) {
      h += '<th class="col-h"><span class="pattern clickable" data-pattern="' + esc(p) +
        '" data-role="p" title="' + esc(p) + " — يَرِد من " + countWazn(inDeg(p)) + ' للمفرد">' + esc(p) + "</span></th>";
    });
    h += "</tr></thead><tbody>";
    rowsOrder.forEach(function (s) {
      h += '<tr><th class="row-h"><span class="pattern clickable" data-pattern="' + esc(s) +
        '" data-role="s" title="' + esc(s) + " — يُجمَع على " + countWazn(outDeg(s)) + '">' + esc(s) + "</span></th>";
      var row = outAdj[s] || {};
      colsOrder.forEach(function (p) {
        if (!row[p]) { h += '<td class="m-cell"></td>'; return; }
        var recs = cellMap[s + SEP + p] || [];
        var hasN = recs.some(function (r) { return r.type === "اسم"; });
        var hasA = recs.some(function (r) { return r.type === "صفة"; });
        var cls = hasN && hasA ? "both" : hasA ? "adj" : "noun";
        h += '<td class="m-cell on ' + cls + '" data-s="' + esc(s) + '" data-p="' + esc(p) + '"></td>';
      });
      h += "</tr>";
    });
    $("#matrix").innerHTML = h + "</tbody></table>";
    wirePatterns($("#matrix"));
    wireMatrixCells();
  }
  function wireMatrixCells() {
    var tip = $("#tooltip"), m = $("#matrix");
    m.querySelectorAll(".m-cell.on").forEach(function (c) {
      c.addEventListener("mouseenter", function () {
        var s = c.getAttribute("data-s"), p = c.getAttribute("data-p");
        var recs = cellMap[s + SEP + p] || [];
        var body = recs.map(function (r) {
          return '<div class="tip-row">' + tag(r.type) + renderBlocks(r.blocks, "") + "</div>";
        }).join("");
        tip.innerHTML = '<div class="tip-title"><b>' + esc(s) + "</b> ← <b>" + esc(p) + "</b></div>" + body;
        tip.hidden = false;
      });
      c.addEventListener("mousemove", function (e) { placeTip(e); });
      c.addEventListener("mouseleave", function () { tip.hidden = true; });
      c.addEventListener("click", function () {
        filterExact({ s: c.getAttribute("data-s"), p: c.getAttribute("data-p") }, "flat");
      });
    });
    function placeTip(e) {
      var pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
      var x = e.clientX - pad - w, y = e.clientY + pad;
      if (x < 6) x = e.clientX + pad;
      if (y + h > window.innerHeight - 6) y = e.clientY - pad - h;
      tip.style.left = Math.max(6, x) + "px";
      tip.style.top = Math.max(6, y) + "px";
    }
  }

  /* ================================ SANKEY ================================= */
  var chart = null, chartReady = false, graphDrawn = false;
  function ensureChart() {
    if (chartReady) return !!chart;
    chartReady = true;
    if (!window.echarts) { $("#sankey").style.display = "none"; $("#sankey-fallback").hidden = false; return false; }
    chart = window.echarts.init($("#sankey"), null, { renderer: "canvas" });
    window.addEventListener("resize", function () { if (chart) chart.resize(); });
    // clicking a node focuses on it — same as picking it from the dropdown
    chart.on("click", function (p) {
      if (p.dataType !== "node") return;
      var sel = $("#focus-select");
      sel.value = p.data.name;
      renderGraph(sel.value);
    });
    return true;
  }
  function nodeName(id) { return id.slice(2); }
  function buildGraph(focus) {
    var pairs = [];
    if (focus === "*") ROWS.forEach(function (r) { pairs.push([r.singular, r.plural]); });
    else {
      var kind = focus[0], name = focus.slice(2);
      if (kind === "S") Object.keys(outAdj[name] || {}).forEach(function (p) { pairs.push([name, p]); });
      else Object.keys(inAdj[name] || {}).forEach(function (s) { pairs.push([s, name]); });
    }
    var nodeSet = {}, links = [], seen = {};
    pairs.forEach(function (pr) {
      var sId = "S" + SEP + pr[0], pId = "P" + SEP + pr[1];
      nodeSet[sId] = "S"; nodeSet[pId] = "P";
      var k = sId + ">" + pId; if (seen[k]) return; seen[k] = 1;
      links.push({ source: sId, target: pId, value: (cellMap[pr[0] + SEP + pr[1]] || []).length || 1 });
    });
    var cSing = cssVar("--sankey-singular", "#1f6f54"), cPlur = cssVar("--sankey-plural", "#c8772b");
    var nodes = Object.keys(nodeSet).map(function (id) {
      var isS = nodeSet[id] === "S";
      // singular on the right (depth 1), plural on the left (depth 0) — flows R→L like Arabic
      return { name: id, depth: isS ? 1 : 0, itemStyle: { color: isS ? cSing : cPlur } };
    });
    return { nodes: nodes, links: links };
  }
  function renderGraph(focus) {
    if (!ensureChart()) return;
    var g = buildGraph(focus);
    var perCol = Math.max(
      g.nodes.filter(function (n) { return n.name[0] === "S"; }).length,
      g.nodes.filter(function (n) { return n.name[0] === "P"; }).length);
    var dense = g.nodes.length > 70;
    var fs = dense ? 12 : 16;
    var isDark = document.documentElement.dataset.theme === "dark";
    // faint base links read lighter on dark, so lift their opacity a touch there
    var lineOp = dense ? (isDark ? 0.13 : 0.08) : (isDark ? 0.4 : 0.3);
    // give every node room to breathe so the all-at-once view stays legible
    $("#sankey").style.height = Math.min(4400, Math.max(460, perCol * 26 + 90)) + "px";
    chart.resize();
    chart.setOption({
      animation: false,
      tooltip: {
        trigger: "item", confine: true,
        backgroundColor: cssVar("--tip-bg", "#fff"), borderColor: cssVar("--line", "#e3dccc"),
        textStyle: { color: cssVar("--ink", "#20303a"), fontFamily: "Noto Naskh Arabic, serif", fontSize: 15 },
        formatter: function (p) {
          if (p.dataType === "edge") {
            var s = nodeName(p.data.source), t = nodeName(p.data.target);
            var recs = cellMap[s + SEP + t] || [];
            var ex = recs.map(function (r) {
              return (r.blocks || []).map(function (b) {
                return (b.pairs || []).slice(0, 4).map(function (x) { return x.s + " ← " + x.p; }).join("، ");
              }).join("؛ ");
            }).filter(Boolean).join("<br>");
            return "<b>" + s + "</b> ← <b>" + t + "</b>" + (ex ? "<br>" + ex : "");
          }
          var nm = nodeName(p.data.name), k = p.data.name[0];
          return "<b>" + nm + "</b> — " + (k === "S"
            ? "وزن مفرد، يُجمَع على " + countWazn(outDeg(nm))
            : "وزن جمع، يَرِد من " + countWazn(inDeg(nm)) + " للمفرد");
        }
      },
      series: [{
        type: "sankey", right: 120, left: 120, top: 18, bottom: 18,
        nodeWidth: 13, nodeGap: dense ? 7 : 11, draggable: false,
        nodeAlign: "justify", layoutIterations: 64,
        emphasis: { focus: "adjacency", blurScope: "coordinateSystem", lineStyle: { opacity: 0.6 } },
        blur: { itemStyle: { opacity: 0.25 }, label: { opacity: 0.15 }, lineStyle: { opacity: 0.03 } },
        label: { fontFamily: "Noto Naskh Arabic, serif", fontSize: fs, fontWeight: "bold",
          color: cssVar("--ink", "#20303a"), formatter: function (p) { return nodeName(p.name); } },
        lineStyle: { color: "gradient", opacity: lineOp, curveness: 0.5 },
        data: g.nodes, links: g.links
      }]
    }, true);
  }
  function populateFocus() {
    var sel = $("#focus-select");
    sel.innerHTML = '<option value="*">جميع التقابُلات</option>' +
      '<optgroup label="ركّز على وزن مفرد">' + singulars.map(function (s) { return opt("S", s); }).join("") +
      '</optgroup><optgroup label="ركّز على وزن جمع">' + plurals.map(function (p) { return opt("P", p); }).join("") + "</optgroup>";
    sel.value = "*";
    sel.addEventListener("change", function () { renderGraph(sel.value); });
  }

  /* ================================= TABS ================================== */
  var VIEWS = ["table", "graph", "matrix"];
  var matrixDrawn = false;
  function switchView(view, skipHash) {
    if (VIEWS.indexOf(view) === -1) view = "table";
    document.querySelectorAll(".tab").forEach(function (t) {
      var on = t.dataset.view === view;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    VIEWS.forEach(function (v) { $("#view-" + v).classList.toggle("is-active", v === view); });
    $("#tooltip").hidden = true;
    if (view === "matrix" && !matrixDrawn) { matrixDrawn = true; renderMatrix(); }
    if (view === "graph") {
      if (!graphDrawn) { graphDrawn = true; renderGraph($("#focus-select").value); }
      else if (chart) chart.resize();
    }
    if (!skipHash && location.hash.slice(1) !== view) {
      history.replaceState(null, "", "#" + view);
    }
  }

  /* ================================ THEME ================================== */
  // choice ∈ {auto, light, dark}; "auto" follows the OS. The resolved light/dark
  // value drives CSS via <html data-theme>, and re-tints the canvas Sankey.
  var prefersDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function themeChoice() { try { return localStorage.getItem("theme") || "auto"; } catch (e) { return "auto"; } }
  function resolveTheme(choice) {
    return (choice === "dark" || (choice === "auto" && prefersDark && prefersDark.matches)) ? "dark" : "light";
  }
  function applyTheme(choice) {
    var root = document.documentElement, resolved = resolveTheme(choice);
    root.dataset.theme = resolved;
    root.dataset.themeChoice = choice;
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#14181b" : "#f5f1e8");
    document.querySelectorAll(".theme-btn").forEach(function (b) {
      var on = b.dataset.themeChoice === choice;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (graphDrawn && chart) renderGraph($("#focus-select").value); // recolor canvas viz
  }
  function setTheme(choice) {
    try { localStorage.setItem("theme", choice); } catch (e) {}
    applyTheme(choice);
  }
  function wireTheme() {
    $("#theme-toggle").addEventListener("click", function (e) {
      var b = e.target.closest(".theme-btn"); if (b) setTheme(b.dataset.themeChoice);
    });
    if (prefersDark) {
      var onSys = function () { if (themeChoice() === "auto") applyTheme("auto"); };
      if (prefersDark.addEventListener) prefersDark.addEventListener("change", onSys);
      else if (prefersDark.addListener) prefersDark.addListener(onSys);
    }
    applyTheme(themeChoice());
  }

  /* =============================== bootstrap =============================== */
  function renderStats() {
    $("#stats").innerHTML = [[ROWS.length, "تقابُلًا"], [singulars.length, "وزنًا للمفرد"], [plurals.length, "وزنًا للجمع"]]
      .map(function (it) { return '<div class="stat"><b>' + it[0] + "</b><span>" + it[1] + "</span></div>"; }).join("");
    if (DB.generated) $("#generated").textContent = "آخر تحديث للبيانات: " + DB.generated;
    if (REPO_URL) { var rl = $("#repo-link"); rl.href = REPO_URL; rl.hidden = false; }
  }
  function setActive(group, btn) {
    document.querySelectorAll(group + " .chip").forEach(function (c) { c.classList.remove("is-active"); });
    btn.classList.add("is-active");
  }
  function wire() {
    var s = $("#search"), t;
    s.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        state.exact = null; // typing leaves the exact-pattern filter
        state.q = s.value.trim(); state.nq = normalize(state.q); renderTable();
      }, 110);
    });
    $("#sankey-reset").addEventListener("click", function () {
      var sel = $("#focus-select"); sel.value = "*"; renderGraph("*");
    });
    $("#type-filter").addEventListener("click", function (e) {
      var b = e.target.closest(".chip"); if (!b) return;
      state.type = b.dataset.type; setActive("#type-filter", b); renderTable();
    });
    $("#mode-filter").addEventListener("click", function (e) {
      var b = e.target.closest(".chip"); if (!b) return;
      state.mode = b.dataset.mode; setActive("#mode-filter", b); renderTable();
    });
    $("#matrix-order").addEventListener("click", function (e) {
      var b = e.target.closest(".chip"); if (!b) return;
      matrixOrder = b.dataset.order; setActive("#matrix-order", b); renderMatrix();
    });
    document.querySelector(".tabs").addEventListener("click", function (e) {
      var b = e.target.closest(".tab"); if (b) switchView(b.dataset.view);
    });
  }

  renderStats();
  populateFocus();
  wire();
  wireTheme();
  renderTable();
  window.addEventListener("hashchange", function () { switchView(location.hash.slice(1), true); });
  if (location.hash.slice(1)) switchView(location.hash.slice(1), true);
})();
