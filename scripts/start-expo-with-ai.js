#!/usr/bin/env node

const { spawn } = require("child_process");
const os = require("os");

const getLanIp = () => {
  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }

  return "127.0.0.1";
};

const aiUrl = process.env.EXPO_PUBLIC_AI_API_URL || `http://${getLanIp()}:8000`;

console.log(`Starting Expo with AI backend URL: ${aiUrl}`);
console.log("Start the Python backend in another terminal with: npm run ai:dev");

const child = spawn("npx", ["expo", "start", "-c"], {
  env: {
    ...process.env,
    EXPO_PUBLIC_AI_API_URL: aiUrl,
  },
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
