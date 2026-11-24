/* node test_sarif.js */
"use strict";
var assert = require("assert");
var lab = require("./sarif.js");
var failed = 0;
var passed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { failed++; console.log("  FAIL  " + name); console.log("        " + (e && e.stack ? e.stack : e)); }
}

function eslintDoc() {
  return {
    version: "2.1.0",
    runs: [{
      tool: {
        driver: {
          name: "ESLint",
          version: "9.0.0",
          rules: [
            { id: "no-unused-vars", defaultConfiguration: { level: "warning" } },
            { id: "eqeqeq", defaultConfiguration: { level: "error" }, helpUri: "https://eslint.org/docs/latest/rules/eqeqeq" }
          ]
        }
      },
      results: [
        {
          ruleId: "no-unused-vars",
          message: { text: "'tmpCount' is assigned a value but never used." },
          locations: [{
            physicalLocation: {
              artifactLocation: { uri: "src/cart.js" },
              region: { startLine: 18, startColumn: 7, snippet: { text: "const tmpCount = 0;" } }
            }
          }]
        },
        {
          ruleId: "eqeqeq",
          level: "error",
          message: { text: "Expected '===' and instead saw '=='." },
          locations: [{
            physicalLocation: {
              artifactLocation: { uri: "src/cart.js" },
              region: { startLine: 41, snippet: { text: "if (status == 'paid') {" } }
            }
          }]
        }
      ]
    }]
  };
}

test("empty input", function () {
  var r = lab.parseSarif("  ");
  assert.strictEqual(r.ok, false);
  assert(/粘贴/.test(r.error));
});

test("invalid JSON", function () {
  var r = lab.parseSarif("{ not json");
  assert.strictEqual(r.ok, false);
  assert(/JSON/.test(r.error));
});

test("JSON without runs is rejected", function () {
  var r = lab.parseSarif('{"version":"2.1.0"}');
  assert.strictEqual(r.ok, false);
  assert(/runs/.test(r.error));
});

test("extract JSON from surrounding log lines", function () {
  var r = lab.parseSarif("tool: done\n" + JSON.stringify({ version: "2.1.0", runs: [] }) + "\nbye");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.summary.total, 0);
  assert.strictEqual(r.version, "2.1.0");
  assert.strictEqual(r.summary.runs, 0);
});

test("parses ESLint-style SARIF and defaults level from the rule", function () {
  var r = lab.parseSarif(JSON.stringify(eslintDoc()));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.version, "2.1.0");
  assert.strictEqual(r.findings.length, 2);
  assert.strictEqual(r.summary.errors, 1);
  assert.strictEqual(r.summary.warnings, 1);
  assert.strictEqual(r.summary.files, 1);
  assert.strictEqual(r.summary.worst, "error");
  assert.strictEqual(r.findings[0].ruleId, "eqeqeq");
  assert.strictEqual(r.findings[0].level, "error");
  assert.strictEqual(r.findings[0].uri, "src/cart.js");
  assert.strictEqual(r.findings[0].startLine, 41);
  assert.strictEqual(r.findings[1].level, "warning");
  assert.strictEqual(r.findings[1].snippet, "const tmpCount = 0;");
  assert.strictEqual(r.tools[0].name, "ESLint");
});

test("resolves messageStrings with arguments", function () {
  var doc = {
    version: "2.1.0",
    runs: [{
      tool: {
        driver: {
          name: "ExampleCodeScanner",
          rules: [{
            id: "PATH001",
            messageStrings: { default: { text: "Path value {0} is joined onto a file system root without validation." } }
          }]
        }
      },
      results: [{
        ruleId: "PATH001",
        message: { id: "default", arguments: ["userPath"] },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: "src/files/store.js" },
            region: { startLine: 22 }
          }
        }]
      }]
    }]
  };
  var r = lab.parseSarif(JSON.stringify(doc));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.findings[0].message, "Path value userPath is joined onto a file system root without validation.");
});

test("looks up rule by ruleIndex and strips file:// from uri", function () {
  var doc = {
    version: "2.1.0",
    runs: [{
      tool: {
        driver: {
          name: "Demo",
          rules: [
            { id: "A", defaultConfiguration: { level: "note" } },
            { id: "B", shortDescription: { text: "B rule" }, defaultConfiguration: { level: "error" } }
          ]
        }
      },
      results: [{
        ruleIndex: 1,
        message: { text: "boom" },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: "file:///src/app.js" },
            region: { startLine: 3 }
          }
        }]
      }]
    }]
  };
  var r = lab.parseSarif(JSON.stringify(doc));
  assert.strictEqual(r.findings[0].ruleId, "B");
  assert.strictEqual(r.findings[0].level, "error");
  assert.strictEqual(r.findings[0].uri, "/src/app.js");
  assert.strictEqual(r.findings[0].place, "/src/app.js:3");
});

test("extracts code flow steps", function () {
  var doc = {
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "ExampleCodeScanner", rules: [{ id: "SQL001" }] } },
      results: [{
        ruleId: "SQL001",
        level: "error",
        message: { text: "taint" },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: "src/db/query.js" },
            region: { startLine: 8 }
          }
        }],
        codeFlows: [{
          threadFlows: [{
            locations: [
              { location: { message: { text: "read" }, physicalLocation: { artifactLocation: { uri: "src/api/search.js" }, region: { startLine: 12 } } } },
              { location: { message: { text: "concat" }, physicalLocation: { artifactLocation: { uri: "src/db/query.js" }, region: { startLine: 8 } } } }
            ]
          }]
        }]
      }]
    }]
  };
  var r = lab.parseSarif(JSON.stringify(doc));
  assert.strictEqual(r.findings[0].flows.length, 1);
  assert.strictEqual(r.findings[0].flows[0].length, 2);
  assert.strictEqual(r.findings[0].flows[0][0].message, "read");
  assert.strictEqual(r.findings[0].flows[0][0].uri, "src/api/search.js");
  assert.strictEqual(r.findings[0].flows[0][1].startLine, 8);
});

test("counts suppressions separately and hides them by default", function () {
  var doc = eslintDoc();
  doc.runs[0].results[0].suppressions = [{ kind: "inSource", status: "accepted" }];
  var r = lab.parseSarif(JSON.stringify(doc));
  assert.strictEqual(r.summary.total, 2);
  assert.strictEqual(r.summary.suppressed, 1);
  var visible = lab.filterFindings(r.findings, {});
  assert.strictEqual(visible.length, 1);
  assert.strictEqual(visible[0].ruleId, "eqeqeq");
  var all = lab.filterFindings(r.findings, { includeSuppressed: true });
  assert.strictEqual(all.length, 2);
});

test("rejected suppression is not treated as suppressed", function () {
  var doc = {
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "Demo" } },
      results: [{
        ruleId: "X",
        level: "warning",
        message: { text: "x" },
        suppressions: [{ status: "rejected" }]
      }]
    }]
  };
  var r = lab.parseSarif(JSON.stringify(doc));
  assert.strictEqual(r.findings[0].suppressed, false);
  assert.strictEqual(r.summary.suppressed, 0);
});

test("pass results are counted separately and hidden by default", function () {
  var doc = {
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "Demo" } },
      results: [
        { ruleId: "OK", kind: "pass", level: "none", message: { text: "passed" } },
        { ruleId: "BAD", level: "error", message: { text: "failed" } }
      ]
    }]
  };
  var r = lab.parseSarif(JSON.stringify(doc));
  assert.strictEqual(r.summary.total, 1);
  assert.strictEqual(r.summary.passed, 1);
  assert.strictEqual(lab.filterFindings(r.findings, {}).length, 1);
  assert.strictEqual(lab.filterFindings(r.findings, { includePass: true }).length, 2);
});

test("merges multiple runs and groups by file", function () {
  var doc = {
    version: "2.1.0",
    runs: [
      { tool: { driver: { name: "ESLint", version: "9.0.0" } }, results: [{ ruleId: "a", level: "warning", message: { text: "a" }, locations: [{ physicalLocation: { artifactLocation: { uri: "src/a.js" }, region: { startLine: 1 } } }] }] },
      { tool: { driver: { name: "ExampleCodeScanner" } }, results: [{ ruleId: "b", level: "note", message: { text: "b" }, locations: [{ physicalLocation: { artifactLocation: { uri: "src/b.js" }, region: { startLine: 2 } } }] }] }
    ]
  };
  var r = lab.parseSarif(JSON.stringify(doc));
  assert.strictEqual(r.summary.runs, 2);
  assert.strictEqual(r.tools.length, 2);
  var groups = lab.groupFindings(r.findings, "file");
  assert.strictEqual(groups.length, 2);
  assert.strictEqual(groups[0].key, "src/a.js");
});

test("filters by query and level", function () {
  var r = lab.parseSarif(JSON.stringify(eslintDoc()));
  var onlyErr = lab.filterFindings(r.findings, { levels: ["error"] });
  assert.strictEqual(onlyErr.length, 1);
  assert.strictEqual(onlyErr[0].ruleId, "eqeqeq");
  var q = lab.filterFindings(r.findings, { query: "tmpcount" });
  assert.strictEqual(q.length, 1);
  assert.strictEqual(q[0].ruleId, "no-unused-vars");
});

test("markdown summary includes counts and a finding", function () {
  var r = lab.parseSarif(JSON.stringify(eslintDoc()));
  var md = lab.toMarkdown(r, { group: "rule" });
  assert(/ESLint 9.0.0/.test(md));
  assert(/error 1/.test(md));
  assert(/eqeqeq/.test(md));
  assert(/src\/cart\.js:41/.test(md));
});

test("wrapped sarifLog is accepted", function () {
  var r = lab.parseSarif(JSON.stringify({ sarifLog: { version: "2.0.0", runs: [] } }));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.version, "2.0.0");
});

test("displayUri decodes and keeps Windows paths", function () {
  assert.strictEqual(lab.displayUri("file:///C:/work/app.js"), "C:/work/app.js");
  assert.strictEqual(lab.displayUri("src%2Fcart.js"), "src/cart.js");
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
