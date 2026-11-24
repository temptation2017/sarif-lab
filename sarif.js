/* sarif-lab — parse SARIF reports in the browser or Node. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SarifLab = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var LEVELS = ["error", "warning", "note", "none"];

  function normalizeLevel(level) {
    var s = String(level || "").toLowerCase().trim();
    if (s === "error" || s === "warning" || s === "note" || s === "none") return s;
    if (s === "fail" || s === "critical" || s === "high" || s === "fatal") return "error";
    if (s === "medium" || s === "moderate") return "warning";
    if (s === "low" || s === "recommendation" || s === "info" || s === "informational") return "note";
    return "";
  }

  function levelRank(level) {
    var i = LEVELS.indexOf(normalizeLevel(level) || "warning");
    return i < 0 ? 1 : i;
  }

  function levelLabel(level) {
    var s = normalizeLevel(level) || "warning";
    return { error: "error", warning: "warning", note: "note", none: "none" }[s] || s;
  }

  function levelSeverity(level) {
    var s = normalizeLevel(level) || "warning";
    if (s === "error") return "bad";
    if (s === "warning") return "warn";
    if (s === "note") return "info";
    return "ok";
  }

  function extractJson(text) {
    var src = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!src) return { ok: false, error: "请先粘贴 SARIF JSON，或拖入 .sarif / .json 文件。" };
    try {
      return { ok: true, value: JSON.parse(src) };
    } catch (e1) {
      var start = src.indexOf("{");
      var end = src.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return { ok: true, value: JSON.parse(src.slice(start, end + 1)) };
        } catch (e2) {
          return { ok: false, error: "无法解析 JSON：" + ((e2 && e2.message) || String(e2)) };
        }
      }
      return { ok: false, error: "无法解析 JSON：" + ((e1 && e1.message) || String(e1)) };
    }
  }

  function textOf(msg, rule, fallback) {
    if (typeof msg === "string") return msg;
    if (!msg || typeof msg !== "object") return fallback || "";
    if (msg.text != null && String(msg.text).length) return String(msg.text);
    var id = msg.id;
    var strings = rule && rule.messageStrings;
    if (id && strings && strings[id] && strings[id].text) {
      return formatArgs(strings[id].text, msg.arguments);
    }
    if (msg.markdown != null && String(msg.markdown).length) return String(msg.markdown);
    return fallback || "";
  }

  function formatArgs(template, args) {
    if (!args || !args.length) return String(template);
    return String(template).replace(/\{(\d+)\}/g, function (_, i) {
      return args[i] != null ? String(args[i]) : _;
    });
  }

  function displayUri(uri) {
    if (uri == null || uri === "") return "";
    var s = String(uri);
    try { s = decodeURIComponent(s); } catch (e) {}
    s = s.replace(/^file:\/\/\/([A-Za-z]:)/, "$1");
    s = s.replace(/^file:\/\//, "");
    return s;
  }

  function locLine(loc) {
    if (!loc || loc.startLine == null) return loc && loc.uri ? loc.uri : "";
    var s = (loc.uri || "") + ":" + loc.startLine;
    if (loc.startColumn != null) s += ":" + loc.startColumn;
    return s;
  }

  function physical(loc) {
    if (!loc || typeof loc !== "object") return null;
    var p = loc.physicalLocation;
    if (!p) return null;
    var art = p.artifactLocation || {};
    var region = p.region || {};
    var ctx = p.contextRegion || {};
    var snippet = "";
    if (region.snippet && region.snippet.text != null) snippet = String(region.snippet.text);
    else if (ctx.snippet && ctx.snippet.text != null) snippet = String(ctx.snippet.text);
    return {
      uri: displayUri(art.uri),
      uriRaw: art.uri ? String(art.uri) : "",
      startLine: region.startLine != null ? Number(region.startLine) : null,
      startColumn: region.startColumn != null ? Number(region.startColumn) : null,
      endLine: region.endLine != null ? Number(region.endLine) : null,
      endColumn: region.endColumn != null ? Number(region.endColumn) : null,
      snippet: snippet.trim()
    };
  }

  function collectRules(run) {
    var map = {};
    var list = [];
    function add(rule) {
      if (!rule || !rule.id) return;
      map[rule.id] = rule;
      list.push(rule);
    }
    var driver = run && run.tool && run.tool.driver;
    if (driver && Array.isArray(driver.rules)) driver.rules.forEach(add);
    var exts = run && run.tool && run.tool.extensions;
    if (Array.isArray(exts)) {
      exts.forEach(function (ext) {
        if (ext && Array.isArray(ext.rules)) ext.rules.forEach(add);
      });
    }
    return { map: map, list: list, driver: driver || {} };
  }

  function findRule(run, result, rules) {
    var idx = result.ruleIndex;
    if (idx == null && result.rule && result.rule.index != null) idx = result.rule.index;
    var driverRules = run.tool && run.tool.driver && run.tool.driver.rules;
    if (idx != null && Array.isArray(driverRules) && driverRules[idx]) return driverRules[idx];
    var id = (result.rule && result.rule.id) || result.ruleId;
    if (id && rules.map[id]) return rules.map[id];
    return null;
  }

  function resultLevel(result, rule) {
    var lvl = normalizeLevel(result.level);
    if (lvl) return lvl;
    if (rule && rule.defaultConfiguration) {
      lvl = normalizeLevel(rule.defaultConfiguration.level);
      if (lvl) return lvl;
    }
    var props = result.properties || {};
    lvl = normalizeLevel(props["problem.severity"] || props.severity || props["security-severity"]);
    if (lvl) return lvl;
    if (result.kind === "pass" || result.kind === "notApplicable" || result.kind === "informational") return "note";
    return "warning";
  }

  function isSuppressed(result) {
    var list = result.suppressions;
    if (!Array.isArray(list) || !list.length) return false;
    for (var i = 0; i < list.length; i++) {
      var status = String((list[i] && list[i].status) || "").toLowerCase();
      if (status !== "rejected") return true;
    }
    return false;
  }

  function extractFlows(result, rule) {
    var flows = [];
    (result.codeFlows || []).forEach(function (cf) {
      (cf.threadFlows || []).forEach(function (tf) {
        var steps = [];
        (tf.locations || []).forEach(function (tfl, i) {
          var loc = physical(tfl.location) || { uri: "", startLine: null, snippet: "" };
          var msg = textOf(tfl.location && tfl.location.message, rule, "");
          if (!msg && tfl.importance) msg = String(tfl.importance);
          steps.push({
            index: i + 1,
            uri: loc.uri || "",
            startLine: loc.startLine,
            startColumn: loc.startColumn,
            snippet: loc.snippet || "",
            message: msg,
            importance: tfl.importance || ""
          });
        });
        if (steps.length) flows.push(steps);
      });
    });
    return flows;
  }

  function ruleHelp(rule) {
    if (!rule) return { name: "", helpUri: "", description: "", tags: [] };
    var desc = textOf(rule.shortDescription, null, "") || textOf(rule.fullDescription, null, "");
    var tags = [];
    if (rule.properties && Array.isArray(rule.properties.tags)) {
      tags = rule.properties.tags.map(function (t) { return String(t); });
    }
    return {
      name: rule.name || "",
      helpUri: rule.helpUri || "",
      description: desc,
      tags: tags
    };
  }

  function toolName(run) {
    var d = (run.tool && run.tool.driver) || {};
    return {
      name: d.name || d.fullName || "(未命名工具)",
      version: d.semanticVersion || d.version || "",
      informationUri: d.informationUri || ""
    };
  }

  function firstLocation(result) {
    var locs = result.locations;
    if (Array.isArray(locs)) {
      for (var i = 0; i < locs.length; i++) {
        var p = physical(locs[i]);
        if (p) return p;
      }
    }
    var logical = result.locations && result.locations[0] && result.locations[0].logicalLocations;
    if (Array.isArray(logical) && logical[0] && logical[0].fullyQualifiedName) {
      return { uri: String(logical[0].fullyQualifiedName), uriRaw: "", startLine: null, startColumn: null, endLine: null, endColumn: null, snippet: "" };
    }
    return { uri: "", uriRaw: "", startLine: null, startColumn: null, endLine: null, endColumn: null, snippet: "" };
  }

  function normalizeFinding(run, result, rules, runIndex) {
    var rule = findRule(run, result, rules);
    var meta = ruleHelp(rule);
    var loc = firstLocation(result);
    var fallback = meta.description || (result.ruleId || "");
    var extra = [];
    if (Array.isArray(result.locations) && result.locations.length > 1) {
      for (var i = 1; i < result.locations.length; i++) {
        var p = physical(result.locations[i]);
        if (p && (p.uri || p.startLine)) extra.push(p);
      }
    }
    var related = [];
    (result.relatedLocations || []).forEach(function (rl) {
      var p = physical(rl);
      if (!p) return;
      p.message = textOf(rl.message, rule, "");
      related.push(p);
    });
    var tool = toolName(run);
    var kind = result.kind || "fail";
    var finding = {
      runIndex: runIndex,
      tool: tool.name,
      toolVersion: tool.version,
      ruleId: result.ruleId || (rule && rule.id) || (result.rule && result.rule.id) || "",
      ruleName: meta.name,
      ruleDescription: meta.description,
      helpUri: meta.helpUri,
      tags: meta.tags,
      level: resultLevel(result, rule),
      kind: kind,
      message: textOf(result.message, rule, fallback),
      uri: loc.uri,
      startLine: loc.startLine,
      startColumn: loc.startColumn,
      snippet: loc.snippet,
      extraLocations: extra,
      related: related,
      flows: extractFlows(result, rule),
      suppressed: isSuppressed(result),
      baselineState: result.baselineState || "",
      hostedViewerUri: result.hostedViewerUri || ""
    };
    finding.place = locLine(finding);
    finding.severity = levelSeverity(finding.level);
    return finding;
  }

  function summarize(findings, tools, version, runCount) {
    var files = {};
    var rules = {};
    var s = {
      version: version || "",
      runs: runCount,
      tools: tools,
      total: 0,
      errors: 0,
      warnings: 0,
      notes: 0,
      none: 0,
      suppressed: 0,
      passed: 0,
      files: 0,
      rules: 0,
      worst: null
    };
    findings.forEach(function (f) {
      if (f.kind === "pass" || f.kind === "notApplicable") {
        s.passed++;
        return;
      }
      if (f.suppressed) s.suppressed++;
      s.total++;
      if (f.level === "error") s.errors++;
      else if (f.level === "warning") s.warnings++;
      else if (f.level === "note") s.notes++;
      else s.none++;
      if (f.uri) files[f.uri] = true;
      if (f.ruleId) rules[f.ruleId] = true;
    });
    s.files = Object.keys(files).length;
    s.rules = Object.keys(rules).length;
    if (s.errors) s.worst = "error";
    else if (s.warnings) s.worst = "warning";
    else if (s.notes) s.worst = "note";
    return s;
  }

  function parseSarif(text) {
    var extracted = extractJson(text);
    if (!extracted.ok) return extracted;
    var doc = extracted.value;
    if (Array.isArray(doc)) {
      return { ok: false, error: "这不是 SARIF 报告（根节点是数组）。需要包含 version 和 runs 的 JSON 对象。" };
    }
    if (!doc || typeof doc !== "object") {
      return { ok: false, error: "这不是 SARIF 报告。" };
    }
    if (doc.sarifLog && typeof doc.sarifLog === "object") doc = doc.sarifLog;
    if (!Array.isArray(doc.runs)) {
      return { ok: false, error: "这不是 SARIF 报告（缺少 runs 数组）。支持 SARIF 2.1.0 / 2.0 的常见导出。" };
    }
    var version = doc.version ? String(doc.version) : "";
    var findings = [];
    var tools = [];
    var seenTool = {};
    doc.runs.forEach(function (run, runIndex) {
      if (!run || typeof run !== "object") return;
      var tool = toolName(run);
      var key = tool.name + "@" + tool.version;
      if (!seenTool[key]) {
        seenTool[key] = true;
        tools.push(tool);
      }
      var rules = collectRules(run);
      var results = Array.isArray(run.results) ? run.results : [];
      results.forEach(function (result) {
        if (!result || typeof result !== "object") return;
        findings.push(normalizeFinding(run, result, rules, runIndex));
      });
    });
    findings.sort(function (a, b) {
      if (a.suppressed !== b.suppressed) return a.suppressed ? 1 : -1;
      if (levelRank(a.level) !== levelRank(b.level)) return levelRank(a.level) - levelRank(b.level);
      var ua = a.uri || "";
      var ub = b.uri || "";
      if (ua !== ub) return ua < ub ? -1 : 1;
      var la = a.startLine || 0;
      var lb = b.startLine || 0;
      if (la !== lb) return la - lb;
      return (a.ruleId || "").localeCompare(b.ruleId || "");
    });
    return {
      ok: true,
      version: version,
      findings: findings,
      tools: tools,
      summary: summarize(findings, tools, version, doc.runs.length)
    };
  }

  function filterFindings(findings, opts) {
    opts = opts || {};
    var q = String(opts.query || "").trim().toLowerCase();
    var levels = opts.levels;
    var includeSuppressed = !!opts.includeSuppressed;
    var includePass = !!opts.includePass;
    return (findings || []).filter(function (f) {
      if (f.kind === "pass" || f.kind === "notApplicable") {
        if (!includePass) return false;
      }
      if (f.suppressed && !includeSuppressed) return false;
      if (levels && levels.length && levels.indexOf(f.level) < 0) return false;
      if (!q) return true;
      var blob = [
        f.ruleId, f.ruleName, f.message, f.uri, f.tool, f.snippet, f.place,
        (f.tags || []).join(" ")
      ].join("\n").toLowerCase();
      return blob.indexOf(q) >= 0;
    });
  }

  function groupFindings(findings, mode) {
    var groups = [];
    var index = {};
    (findings || []).forEach(function (f) {
      var key;
      if (mode === "rule") key = f.ruleId || "(无规则)";
      else if (mode === "level") key = f.level || "warning";
      else if (mode === "tool") key = f.tool || "(未命名工具)";
      else key = f.uri || "(无路径)";
      if (!index[key]) {
        index[key] = { key: key, items: [] };
        groups.push(index[key]);
      }
      index[key].items.push(f);
    });
    return groups;
  }

  function fmtPlace(f) {
    return locLine(f) || "(无位置)";
  }

  function toMarkdown(report, opts) {
    if (!report || !report.ok) return "";
    opts = opts || {};
    var items = filterFindings(report.findings, opts);
    var s = report.summary;
    var lines = [];
    lines.push("# SARIF 摘要");
    lines.push("");
    var toolBits = (s.tools || []).map(function (t) {
      return t.version ? t.name + " " + t.version : t.name;
    });
    if (toolBits.length) lines.push("- 工具：" + toolBits.join("、"));
    if (s.version) lines.push("- 版本：SARIF " + s.version);
    lines.push("- 结果：" + s.total + "（error " + s.errors + "，warning " + s.warnings + "，note " + s.notes + (s.none ? "，none " + s.none : "") + "）");
    if (s.suppressed) lines.push("- 已抑制：" + s.suppressed);
    if (s.passed) lines.push("- 通过 / 不适用：" + s.passed);
    lines.push("- 文件 " + s.files + "，规则 " + s.rules);
    if (opts.query) lines.push("- 当前筛选：" + items.length + " 条" + (opts.query ? "（关键词 " + opts.query + "）" : ""));
    lines.push("");
    var groups = groupFindings(items, opts.group || "file");
    groups.forEach(function (g) {
      lines.push("## " + g.key + "（" + g.items.length + "）");
      g.items.forEach(function (f) {
        var title = (f.suppressed ? "[已抑制] " : "") + f.level + " " + (f.ruleId ? f.ruleId + "  " : "") + (f.message || "").replace(/\s+/g, " ");
        lines.push("- " + title);
        lines.push("  " + fmtPlace(f));
        if (f.snippet) {
          var snip = f.snippet.split("\n")[0].trim();
          if (snip) lines.push("  `" + snip + "`");
        }
      });
      lines.push("");
    });
    return lines.join("\n").trim() + "\n";
  }

  return {
    parseSarif: parseSarif,
    filterFindings: filterFindings,
    groupFindings: groupFindings,
    toMarkdown: toMarkdown,
    normalizeLevel: normalizeLevel,
    levelRank: levelRank,
    levelLabel: levelLabel,
    levelSeverity: levelSeverity,
    displayUri: displayUri,
    fmtPlace: fmtPlace
  };
});
