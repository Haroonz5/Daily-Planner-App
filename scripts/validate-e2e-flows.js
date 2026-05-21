const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const flowDir = path.join("e2e", "maestro");
const flows = fs
  .readdirSync(flowDir)
  .filter((file) => file.endsWith(".yaml"))
  .sort();

assert.ok(flows.length >= 4, "Expected multiple Maestro flows for production coverage");

const requiredFlowContent = {
  "smoke.yaml": ["appId:", "launchApp", "Add task tab", `assertVisible: "Saved"`],
  "ai-planner.yaml": ["Plan with AI", "gym everyday except sunday", "Add to Tasks"],
  "settings-systems.yaml": ["Tester Launch Checklist", "AI Backend Status", "Widget Preview"],
  "focus-mode.yaml": ["Focus Mode", "Focus Coach"],
};

for (const [file, needles] of Object.entries(requiredFlowContent)) {
  assert.ok(flows.includes(file), `${file} is missing`);
  const flow = fs.readFileSync(path.join(flowDir, file), "utf8");
  for (const needle of needles) {
    assert.ok(flow.includes(needle), `${file} should include ${needle}`);
  }
}

for (const file of flows) {
  const flow = fs.readFileSync(path.join(flowDir, file), "utf8");
  assert.match(flow, /appId:/, `${file} needs an appId`);
  assert.match(flow, /launchApp/, `${file} should launch the app`);
}

console.log(`E2E flow validation passed for ${flows.length} Maestro flow(s).`);
