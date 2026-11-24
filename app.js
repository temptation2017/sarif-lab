/* sarif-lab UI */
(function () {
  var src = document.getElementById("src");
  var out = document.getElementById("out");
  var toast = document.getElementById("toast");
  var drop = document.getElementById("drop");
  var qEl = document.getElementById("q");
  var groupEl = document.getElementById("group");
  var suppressedEl = document.getElementById("include-suppressed");
  var last = null;
  var hiddenLevels = {};

  var box = document.getElementById("samples");
  (window.SARIF_SAMPLES || []).forEach(function (s) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = s.label;
    b.addEventListener("click", function () { src.value = s.text; render(); });
    box.appendChild(b);
  });

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function opts() {
    var levels = ["error", "warning", "note", "none"].filter(function (l) { return !hiddenLevels[l]; });
    return {
      query: qEl.value,
      levels: levels,
      includeSuppressed: suppressedEl.checked,
      group: groupEl.value || "file"
    };
  }

  function flowHtml(flows) {
    if (!flows || !flows.length) return "";
    return flows.map(function (steps) {
      var parts = steps.map(function (st) {
        var place = st.uri ? (st.uri + (st.startLine != null ? ":" + st.startLine : "")) : "";
        var extra = st.message ? " — " + esc(st.message) : "";
        var snip = st.snippet ? "<div class=\"snip\">" + esc(st.snippet.split("\n")[0]) + "</div>" : "";
        return "<li><span class=\"flow-place\">" + esc(place || ("步骤 " + st.index)) + "</span>" + extra + snip + "</li>";
      }).join("");
      return "<div class=\"flow\"><div class=\"flow-title\">数据流</div><ol>" + parts + "</ol></div>";
    }).join("");
  }

  function findingHtml(f) {
    var tags = (f.tags || []).slice(0, 6).map(function (t) {
      return "<span>" + esc(t) + "</span>";
    }).join("");
    var rule = f.ruleId ? esc(f.ruleId) : "";
    var help = f.helpUri ? " <a class=\"help\" href=\"" + esc(f.helpUri) + "\" target=\"_blank\" rel=\"noopener noreferrer\">规则说明</a>" : "";
    var snip = f.snippet ? "<pre class=\"snip\">" + esc(f.snippet) + "</pre>" : "";
    var flags = "";
    if (f.suppressed) flags += "<span class=\"flag\">已抑制</span>";
    if (f.baselineState) flags += "<span class=\"flag\">" + esc(f.baselineState) + "</span>";
    if (f.tool) flags += "<span class=\"flag\">" + esc(f.tool + (f.toolVersion ? " " + f.toolVersion : "")) + "</span>";
    return "<article class=\"finding " + esc(f.severity) + "\">" +
      "<div class=\"finding-head\">" +
        "<span class=\"chip " + esc(f.severity) + "\">" + esc(f.level) + "</span>" +
        (rule ? "<span class=\"rule\">" + rule + "</span>" : "") +
        flags +
      "</div>" +
      "<div class=\"msg\">" + esc(f.message) + help + "</div>" +
      "<div class=\"place\">" + esc(SarifLab.fmtPlace(f)) + "</div>" +
      snip +
      (tags ? "<div class=\"node-flags\">" + tags + "</div>" : "") +
      flowHtml(f.flows) +
    "</article>";
  }

  function chipsHtml(s) {
    var bits = [];
    var toolBits = (s.tools || []).map(function (t) { return t.version ? t.name + " " + t.version : t.name; });
    if (toolBits.length) bits.push("<span class=\"chip info\">" + esc(toolBits.join(" · ")) + "</span>");
    if (s.version) bits.push("<span class=\"chip\">SARIF " + esc(s.version) + "</span>");
    bits.push("<span class=\"chip\">结果 " + s.total + "</span>");
    if (s.errors) bits.push("<span class=\"chip bad\">error " + s.errors + "</span>");
    if (s.warnings) bits.push("<span class=\"chip warn\">warning " + s.warnings + "</span>");
    if (s.notes) bits.push("<span class=\"chip info\">note " + s.notes + "</span>");
    if (s.none) bits.push("<span class=\"chip\">none " + s.none + "</span>");
    if (s.suppressed) bits.push("<span class=\"chip\">已抑制 " + s.suppressed + "</span>");
    if (s.passed) bits.push("<span class=\"chip ok\">通过 " + s.passed + "</span>");
    bits.push("<span class=\"chip\">文件 " + s.files + "</span>");
    bits.push("<span class=\"chip\">规则 " + s.rules + "</span>");
    if (!s.total && !s.passed && !s.suppressed) bits.push("<span class=\"chip ok\">没有发现</span>");
    return "<div class=\"chips\">" + bits.join("") + "</div>";
  }

  function render() {
    toast.hidden = true;
    var text = src.value;
    if (!text.trim()) {
      last = null;
      out.innerHTML = "<p class=\"empty\">左侧贴入 SARIF，或点一个示例。</p>";
      return;
    }
    var r = SarifLab.parseSarif(text);
    last = r;
    if (!r.ok) {
      out.innerHTML = "<p class=\"error\">" + esc(r.error) + "</p>";
      return;
    }
    var o = opts();
    var items = SarifLab.filterFindings(r.findings, o);
    var groups = SarifLab.groupFindings(items, o.group);
    var body;
    if (!items.length) {
      body = "<p class=\"empty\">当前筛选下没有条目。试着改关键词、级别，或显示已抑制项。</p>";
    } else {
      body = groups.map(function (g) {
        return "<section class=\"group\"><h2>" + esc(g.key) + " <span class=\"count\">" + g.items.length + "</span></h2>" +
          g.items.map(findingHtml).join("") + "</section>";
      }).join("");
    }
    out.innerHTML = chipsHtml(r.summary) +
      "<p class=\"shown\">正在显示 " + items.length + " / " + r.summary.total + " 条结果</p>" +
      body;
  }

  function bindLevelToggles() {
    var box = document.getElementById("levels");
    ["error", "warning", "note", "none"].forEach(function (level) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "level-toggle " + SarifLab.levelSeverity(level) + " on";
      b.dataset.level = level;
      b.textContent = level;
      b.addEventListener("click", function () {
        hiddenLevels[level] = !hiddenLevels[level];
        b.classList.toggle("on", !hiddenLevels[level]);
        render();
      });
      box.appendChild(b);
    });
  }

  function readFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      src.value = String(reader.result || "");
      render();
    };
    reader.readAsText(file);
  }

  src.addEventListener("input", render);
  qEl.addEventListener("input", render);
  groupEl.addEventListener("change", render);
  suppressedEl.addEventListener("change", render);
  document.getElementById("btn-clear").addEventListener("click", function () { src.value = ""; render(); });
  document.getElementById("btn-copy").addEventListener("click", function () {
    if (!last || !last.ok) return;
    var md = SarifLab.toMarkdown(last, opts());
    function ok() { toast.hidden = false; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(md).then(ok).catch(function () {
        fallbackCopy(md); ok();
      });
    } else {
      fallbackCopy(md); ok();
    }
  });
  function fallbackCopy(text) {
    var t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(t);
  }

  drop.addEventListener("dragover", function (e) {
    e.preventDefault();
    drop.classList.add("over");
  });
  drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
  drop.addEventListener("drop", function (e) {
    e.preventDefault();
    drop.classList.remove("over");
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    readFile(f);
  });
  document.getElementById("file").addEventListener("change", function (e) {
    readFile(e.target.files && e.target.files[0]);
    e.target.value = "";
  });

  bindLevelToggles();
  render();
})();
