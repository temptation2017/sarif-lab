/* sarif-lab fictional samples */
window.SARIF_SAMPLES = [
  {
    label: "ESLint 风格",
    text: JSON.stringify({
      version: "2.1.0",
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      runs: [{
        tool: {
          driver: {
            name: "ESLint",
            version: "9.0.0",
            informationUri: "https://eslint.org",
            rules: [
              {
                id: "no-unused-vars",
                shortDescription: { text: "Disallow unused variables" },
                defaultConfiguration: { level: "warning" },
                helpUri: "https://eslint.org/docs/latest/rules/no-unused-vars"
              },
              {
                id: "eqeqeq",
                shortDescription: { text: "Require === and !==" },
                defaultConfiguration: { level: "error" },
                helpUri: "https://eslint.org/docs/latest/rules/eqeqeq"
              }
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
                region: { startLine: 41, startColumn: 9, snippet: { text: "if (status == 'paid') {" } }
              }
            }]
          }
        ]
      }]
    }, null, 2)
  },
  {
    label: "带数据流的安全发现",
    text: JSON.stringify({
      version: "2.1.0",
      runs: [{
        tool: {
          driver: {
            name: "ExampleCodeScanner",
            version: "1.4.0",
            informationUri: "https://example.invalid/scanner",
            rules: [{
              id: "SQL001",
              name: "sql-injection",
              shortDescription: { text: "SQL query built from unsanitized input" },
              helpUri: "https://cwe.mitre.org/data/definitions/89.html",
              defaultConfiguration: { level: "error" },
              properties: { tags: ["security", "external/cwe/cwe-89"], "security-severity": "8.6" }
            }]
          }
        },
        results: [{
          ruleId: "SQL001",
          level: "error",
          message: { text: "User input reaches a SQL string without parameterization." },
          locations: [{
            physicalLocation: {
              artifactLocation: { uri: "src/db/query.js" },
              region: {
                startLine: 8,
                startColumn: 10,
                snippet: { text: "db.exec(\"SELECT * FROM items WHERE q = '\" + q + \"'\")" }
              }
            }
          }],
          codeFlows: [{
            threadFlows: [{
              locations: [
                {
                  location: {
                    message: { text: "Request query string is read." },
                    physicalLocation: {
                      artifactLocation: { uri: "src/api/search.js" },
                      region: { startLine: 12, startColumn: 11, snippet: { text: "const q = req.query.q;" } }
                    }
                  }
                },
                {
                  location: {
                    message: { text: "Value is passed into the query helper." },
                    physicalLocation: {
                      artifactLocation: { uri: "src/api/search.js" },
                      region: { startLine: 27, startColumn: 18, snippet: { text: "return searchItems(q);" } }
                    }
                  }
                },
                {
                  importance: "essential",
                  location: {
                    message: { text: "Value is concatenated into SQL." },
                    physicalLocation: {
                      artifactLocation: { uri: "src/db/query.js" },
                      region: { startLine: 8, startColumn: 10, snippet: { text: "db.exec(\"SELECT * FROM items WHERE q = '\" + q + \"'\")" } }
                    }
                  }
                }
              ]
            }]
          }]
        }]
      }]
    }, null, 2)
  },
  {
    label: "多工具 + 抑制项",
    text: JSON.stringify({
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "ESLint", version: "9.0.0", rules: [{ id: "no-console", defaultConfiguration: { level: "warning" } }] } },
          results: [
            {
              ruleId: "no-console",
              message: { text: "Unexpected console statement." },
              locations: [{
                physicalLocation: {
                  artifactLocation: { uri: "src/logger.js" },
                  region: { startLine: 3, snippet: { text: "console.log(event);" } }
                }
              }],
              suppressions: [{ kind: "inSource", status: "accepted", justification: "temporary debug in the sample app" }]
            }
          ]
        },
        {
          tool: {
            driver: {
              name: "ExampleCodeScanner",
              version: "1.4.0",
              rules: [
                { id: "PATH001", shortDescription: { text: "Unvalidated path concatenation" }, defaultConfiguration: { level: "warning" }, properties: { tags: ["security"] } },
                { id: "INFO001", shortDescription: { text: "Hard-coded sample port" }, defaultConfiguration: { level: "note" } }
              ]
            }
          },
          results: [
            {
              ruleId: "PATH001",
              message: { id: "default", arguments: ["userPath"] },
              locations: [{
                physicalLocation: {
                  artifactLocation: { uri: "src/files/store.js" },
                  region: { startLine: 22, snippet: { text: "path.join(baseDir, userPath)" } }
                }
              }]
            },
            {
              ruleId: "INFO001",
              level: "note",
              message: { text: "Service listens on a hard-coded development port." },
              locations: [{
                physicalLocation: {
                  artifactLocation: { uri: "src/server.js" },
                  region: { startLine: 6, snippet: { text: "app.listen(3456);" } }
                }
              }]
            }
          ]
        }
      ]
    }, null, 2)
  }
];

/* Fix PATH001 sample: give the rule a messageStrings entry so id+arguments resolve. */
(function () {
  var sample = window.SARIF_SAMPLES[2];
  var doc = JSON.parse(sample.text);
  doc.runs[1].tool.driver.rules[0].messageStrings = {
    default: { text: "Path value {0} is joined onto a file system root without validation." }
  };
  sample.text = JSON.stringify(doc, null, 2);
})();
