import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const workflowPath = path.join(scriptsDirectory, "..", ".github", "workflows", "sync-fixlang.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");

function stepBody(name, nextName) {
  const start = workflow.indexOf(`      - name: ${name}`);
  assert.notEqual(start, -1, `missing workflow step: ${name}`);
  const end = nextName === undefined ? workflow.length : workflow.indexOf(`      - name: ${nextName}`, start + 1);
  assert.notEqual(end, -1, `missing next workflow step: ${nextName}`);
  return workflow.slice(start, end);
}

const smoke = stepBody("Smoke-test the public consumer path", "Revert a cask update after a failed smoke test");
const rollback = stepBody("Revert a cask update after a failed smoke test");
const selectionStart = workflow.indexOf('selection_kind="$(jq -er \'.kind\' "$TEMP_ROOT/selection.json")"');
const selectionEnd = workflow.indexOf('readonly VERSION="$(jq -er \'.version\' "$TEMP_ROOT/selection.json")"');
assert.notEqual(selectionStart, -1, "missing release selection result");
assert.notEqual(selectionEnd, -1, "missing selected release version");
const selection = workflow.slice(selectionStart, selectionEnd);

test("smoke refuses pre-existing FixLang or tap state before mutating Homebrew", () => {
  const installedCheck = smoke.indexOf('brew list --cask fixlang >/dev/null 2>&1');
  const tapCheck = smoke.indexOf('brew tap | grep -Fx "anhdd-kuro/tap" >/dev/null');
  const firstMutation = Math.min(
    ...["tap_added_by_smoke=1", "installed_by_smoke=1", "brew tap anhdd-kuro/tap", "brew install --cask anhdd-kuro/tap/fixlang"]
      .map((needle) => smoke.indexOf(needle))
      .filter((index) => index >= 0),
  );

  assert.ok(installedCheck >= 0, "must check for an already-installed cask");
  assert.ok(tapCheck >= 0, "must check for an already-tapped source");
  assert.ok(installedCheck < firstMutation, "installed check must precede mutation");
  assert.ok(tapCheck < firstMutation, "tap check must precede mutation");
});

test("smoke cleanup touches only state owned by this run", () => {
  const cleanup = smoke.slice(smoke.indexOf("cleanup() {"), smoke.indexOf("trap cleanup EXIT"));
  assert.match(smoke, /installed_by_smoke=0/);
  assert.match(smoke, /tap_added_by_smoke=0/);
  assert.match(cleanup, /if \[ "\$installed_by_smoke" -eq 1 \]; then\n\s+brew uninstall --cask fixlang/);
  assert.match(cleanup, /if \[ "\$tap_added_by_smoke" -eq 1 \]; then\n\s+brew untap anhdd-kuro\/tap/);
  assert.doesNotMatch(cleanup, /cleanup\(\) \{\s*brew uninstall --cask fixlang/);
  assert.doesNotMatch(cleanup, /cleanup\(\) \{\s*brew untap anhdd-kuro\/tap/);
});

test("smoke logs a resolved app directory constrained to its unique temporary root", () => {
  assert.match(smoke, /mktemp -d "\$\{RUNNER_TEMP\}\/fixlang-tap-smoke\.XXXXXXXX"/);
  assert.match(smoke, /TEMP_ROOT_REAL="\$\(realpath "\$TEMP_ROOT"\)"/);
  assert.match(smoke, /APP_DIR_REAL="\$\(realpath "\$APP_DIR"\)"/);
  assert.match(smoke, /case "\$APP_DIR_REAL" in\n\s+"\$TEMP_ROOT_REAL"\/\*\)/);
  assert.match(smoke, /echo "Smoke-test appdir: \$APP_DIR_REAL"/);
  assert.match(smoke, /brew install --cask anhdd-kuro\/tap\/fixlang --appdir "\$APP_DIR_REAL"/);
});

test("the verified disk image is mounted read-only without re-verification", () => {
  const verified = workflow.indexOf('hdiutil verify "$DMG_PATH"');
  const attached = workflow.indexOf('hdiutil attach "$DMG_PATH" -readonly -nobrowse -noverify -mountpoint "$MOUNT_POINT"');
  assert.ok(verified >= 0, "DMG must be verified first");
  assert.ok(attached > verified, "mount must happen after verify with readonly/nobrowse/noverify flags");
});

test("rollback retries only benign main races and refuses competing cask edits", () => {
  assert.match(rollback, /readonly MAX_ROLLBACK_ATTEMPTS=3/);
  assert.match(rollback, /while \[ "\$attempt" -le "\$MAX_ROLLBACK_ATTEMPTS" \]; do/);
  assert.match(rollback, /merge-base --is-ancestor "\$PUBLISH_COMMIT" "\$REMOTE_HEAD"/);
  assert.match(rollback, /diff --quiet "\$PUBLISH_COMMIT" "\$REMOTE_HEAD" -- Casks\/fixlang\.rb/);
  assert.match(rollback, /Competing cask edit detected; refusing to overwrite it/);
  assert.match(rollback, /Rollback exhausted after \$MAX_ROLLBACK_ATTEMPTS attempts/);
  assert.doesNotMatch(rollback, /push\b[^\n]*(?:--force|\s-f(?:\s|$))/);
});

test("no-release validates a tracked cask through decide-cask before no-op", () => {
  const noReleaseExit = selection.indexOf('if [ "$selection_kind" = "no-valid-public-release" ]; then');
  const decision = selection.indexOf('node scripts/sync-fixlang.mjs < "$TEMP_ROOT/no-release-decision-request.json"');
  const successfulExit = selection.indexOf("exit 0", noReleaseExit);

  assert.ok(noReleaseExit >= 0, "missing no-release branch");
  assert.match(selection, /if \[ -f "\$TAP_CASK" \]; then/);
  assert.match(selection, /--rawfile existing "\$TAP_CASK"/);
  assert.match(selection, /release: null, existingCask: \$existing/);
  assert.match(selection, /existingCask: null/);
  assert.ok(decision > noReleaseExit, "no-release must invoke the tested decision helper before it exits");
  assert.ok(decision < successfulExit, "no-release must validate a tracked cask before its successful exit");
  assert.match(selection, /no-release-decision\.json/);
});

test("synchronization runs the full local workflow policy suite", () => {
  assert.match(workflow, /node --test scripts\/sync-fixlang\.test\.mjs scripts\/workflow-policy\.test\.mjs/);
});

test("release discovery uses the built-in GitHub token instead of anonymous API requests", () => {
  const synchronize = stepBody("Select, validate, render, and test the cask", "Publish the verified cask commit");

  assert.match(synchronize, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(synchronize, /gh api --paginate --slurp/);
  assert.match(synchronize, /Accept: application\/vnd\.github\+json/);
  assert.match(synchronize, /X-GitHub-Api-Version: 2022-11-28/);
  assert.match(synchronize, /jq -e 'type == "array" and all\(\.\[\]; type == "array"\)'/);
  assert.match(synchronize, /jq 'add' .*releases\.json/);
  assert.doesNotMatch(synchronize, /curl[\s\S]{0,240}api\.github\.com/);
});
