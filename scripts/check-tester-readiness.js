const fs = require("fs");
const path = require("path");

const root = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const exists = (file) => fs.existsSync(path.join(root, file));

const failures = [];
const warnings = [];
const pass = [];

const requireFile = (file, label) => {
  if (exists(file)) pass.push(`${label} exists`);
  else failures.push(`${label} is missing: ${file}`);
};

requireFile("firestore.rules", "Firestore rules");
requireFile("firebase.json", "Firebase config");
requireFile(".firebaserc", "Firebase project mapping");
requireFile("eas.json", "EAS config");
requireFile("render.yaml", "Hosted backend blueprint");
requireFile("docs/TESTER_HANDOFF.md", "Tester handoff docs");
requireFile("docs/HOSTED_BACKEND_DEPLOYMENT.md", "Hosted backend docs");

const pkg = readJson("package.json");
const eas = readJson("eas.json");
const app = readJson("app.json");

if (!pkg.scripts["deploy:rules"]?.includes("npx firebase-tools")) {
  failures.push("deploy:rules should use npx firebase-tools so global Firebase CLI is not required.");
} else {
  pass.push("Firestore rules deploy uses npx firebase-tools");
}

if (!pkg.scripts["functions:deploy"]?.includes("deploy-functions-if-blaze")) {
  failures.push("functions:deploy should use the Blaze guard script so Spark/free tester builds do not fail.");
} else {
  pass.push("Functions deploy is guarded and optional for Spark/free tester builds");
}

if (!pkg.scripts["eas:preview"]?.includes("npx eas-cli")) {
  failures.push("eas:preview should use npx eas-cli so global EAS CLI is not required.");
} else {
  pass.push("EAS preview build uses npx eas-cli");
}

if (eas.build?.preview?.env?.EXPO_PUBLIC_REQUIRE_SECURE_AI !== "true") {
  failures.push("Preview builds should set EXPO_PUBLIC_REQUIRE_SECURE_AI=true to avoid laptop localhost fallbacks.");
} else {
  pass.push("Preview builds avoid laptop AI fallbacks");
}

if (eas.build?.production?.env?.EXPO_PUBLIC_REQUIRE_SECURE_AI !== "true") {
  failures.push("Production builds should set EXPO_PUBLIC_REQUIRE_SECURE_AI=true.");
} else {
  pass.push("Production builds avoid laptop AI fallbacks");
}

const iosBundle = app.expo?.ios?.bundleIdentifier;
const androidPackage = app.expo?.android?.package;
if (!iosBundle || iosBundle.includes("example")) failures.push("iOS bundle identifier needs a real value.");
else pass.push(`iOS bundle identifier: ${iosBundle}`);
if (!androidPackage || androidPackage.includes("example")) failures.push("Android package needs a real value.");
else pass.push(`Android package: ${androidPackage}`);

const envExample = exists(".env.example") ? fs.readFileSync(path.join(root, ".env.example"), "utf8") : "";
if (!envExample.includes("EXPO_PUBLIC_AI_API_URL")) {
  warnings.push(".env.example does not mention EXPO_PUBLIC_AI_API_URL for hosted tester builds.");
}

warnings.push("Cloud Functions are optional for tester builds. Deploying them requires Firebase Blaze; the app still works without them.");
warnings.push("Friend push nudges need Cloud Functions. In-app nudges still work on Spark/free Firebase.");
warnings.push("Set EXPO_PUBLIC_AI_API_URL as an EAS secret once the hosted Go gateway is deployed.");

console.log("Tester readiness check\n");
pass.forEach((item) => console.log(`PASS ${item}`));
warnings.forEach((item) => console.log(`WARN ${item}`));

if (failures.length) {
  console.error("\nFailures:");
  failures.forEach((item) => console.error(`FAIL ${item}`));
  process.exit(1);
}

console.log("\nTester readiness passed. You can build a preview app without deploying Cloud Functions.");
