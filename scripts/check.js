import { readdir, readFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const manifest = JSON.parse(await readFile("extension/manifest.json", "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions.sort(), ["scripting", "storage"]);
for (const file of [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page, ...manifest.content_scripts.flatMap(script => script.js)]) await access(`extension/${file}`);
for (const directory of ["extension", "scripts", "tests"]) {
  for (const file of await readdir(directory)) {
    if (!file.endsWith(".js")) continue;
    const result = spawnSync(process.execPath, ["--check", `${directory}/${file}`], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
}
console.log("Manifest references, permissions, and JavaScript syntax passed.");
