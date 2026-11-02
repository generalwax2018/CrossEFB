#!/usr/bin/env node
/**
 * One-time setup: creates the Android project with Capacitor, installs the
 * GDL 90 plugin and MainActivity, and adds the permissions the app needs.
 * Safe to re-run.
 */
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

if (!existsSync(join(root, "android"))) run("npx cap add android");

const javaDir = join(root, "android", "app", "src", "main", "java", "app", "crossefb");
mkdirSync(javaDir, { recursive: true });
for (const f of ["MainActivity.java", "Gdl90Plugin.java"]) copyFileSync(join(root, "native", f), join(javaDir, f));

const manifestPath = join(root, "android", "app", "src", "main", "AndroidManifest.xml");
let manifest = readFileSync(manifestPath, "utf8");
const perms = [
  "android.permission.INTERNET",
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.ACCESS_WIFI_STATE",
  "android.permission.CHANGE_WIFI_MULTICAST_STATE",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.WAKE_LOCK",
];
for (const p of perms) {
  if (!manifest.includes(`"${p}"`)) {
    manifest = manifest.replace("</manifest>", `    <uses-permission android:name="${p}" />\n</manifest>`);
  }
}
if (!manifest.includes("android.hardware.location.gps")) {
  manifest = manifest.replace(
    "</manifest>",
    '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>',
  );
}
writeFileSync(manifestPath, manifest);

run("npx cap sync android");
console.log("\nDone. Open the project with:  npm run open");
