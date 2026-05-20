const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const flowPath = path.join("e2e", "maestro", "smoke.yaml");
const flow = fs.readFileSync(flowPath, "utf8");

assert.match(flow, /appId:/, "Maestro flow needs an appId");
assert.match(flow, /launchApp/, "Smoke flow should launch the app");
assert.match(flow, /Add task tab/, "Smoke flow should navigate to Add Task");
assert.match(flow, /assertVisible: "Saved"/, "Smoke flow should assert task creation feedback");

console.log("E2E flow validation passed.");
