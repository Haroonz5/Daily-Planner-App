#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const requiredFiles = [
  "render.yaml",
  "render.production.yaml",
  "ai/Dockerfile",
  "ai/main.py",
  "services/security-gateway/Dockerfile",
  "services/security-gateway/main.go",
  "services/security-gateway/migrations/001_security_audit_logs.sql",
  "services/stats-aggregator/Dockerfile",
  "docker-compose.yml",
  "docs/HOSTED_BACKEND_DEPLOYMENT.md",
  "docs/PUSH_PIPELINE.md",
  "docs/OBSERVABILITY.md",
];

const failures = [];
const warnings = [];
const passes = [];

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

for (const file of requiredFiles) {
  if (exists(file)) passes.push(`${file} exists`);
  else failures.push(`${file} is missing`);
}

if (exists("render.yaml")) {
  const render = read("render.yaml");
  [
    "daily-discipline-ai",
    "daily-discipline-security-gateway",
    "daily-discipline-stats-aggregator",
    "daily-discipline-postgres",
    "GEMINI_API_KEY",
    "ADMIN_DASHBOARD_TOKEN",
    "DATABASE_URL",
    "MAX_BODY_BYTES",
  ].forEach((needle) => {
    if (render.includes(needle)) passes.push(`render.yaml includes ${needle}`);
    else failures.push(`render.yaml does not include ${needle}`);
  });
}

if (exists("render.production.yaml")) {
  const renderProduction = read("render.production.yaml");
  if (renderProduction.includes("APP_CHECK_MODE") && renderProduction.includes("required")) {
    passes.push("render.production.yaml includes APP_CHECK_MODE required");
  } else {
    failures.push("render.production.yaml must require App Check");
  }
}

if (exists("package.json")) {
  const pkg = JSON.parse(read("package.json"));
  ["hosted:check", "hosted:preflight", "tester:build", "testflight:build"].forEach((script) => {
    if (pkg.scripts?.[script]) passes.push(`package script ${script} exists`);
    else failures.push(`package script ${script} is missing`);
  });
}

if (!process.env.HOSTED_GATEWAY_URL && !process.env.EXPO_PUBLIC_AI_API_URL) {
  warnings.push("HOSTED_GATEWAY_URL / EXPO_PUBLIC_AI_API_URL not set. Set it before running hosted:check or EAS tester builds.");
}
if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
  warnings.push("No model key found locally. That is fine for source control, but Render must have GEMINI_API_KEY or OPENAI_API_KEY.");
}
if (!process.env.ADMIN_DASHBOARD_TOKEN) {
  warnings.push("ADMIN_DASHBOARD_TOKEN not set locally. Configure it on Render before opening the admin dashboard.");
}

console.log("Hosted backend preflight\n");
passes.forEach((line) => console.log(`PASS ${line}`));
warnings.forEach((line) => console.log(`WARN ${line}`));

if (failures.length) {
  console.error("\nFailures:");
  failures.forEach((line) => console.error(`FAIL ${line}`));
  process.exit(1);
}

console.log("\nHosted backend preflight passed.");
