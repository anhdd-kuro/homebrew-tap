import test from "node:test";
import assert from "node:assert/strict";

import {
  compareStableVersions,
  decideCaskSync,
  parseChecksumManifest,
  parseStableVersion,
  renderCask,
  selectGreatestPublicRelease,
} from "./sync-fixlang.mjs";

const DIGEST = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const DMG_123 = "FixLang-1.2.3-arm64.dmg";

test("parseStableVersion accepts only strict safe-integer stable X.Y.Z versions", () => {
  assert.deepEqual(parseStableVersion("0.0.0"), [0n, 0n, 0n]);
  assert.deepEqual(parseStableVersion("9007199254740991.12.3"), [9007199254740991n, 12n, 3n]);

  for (const version of [
    "01.2.3",
    "1.02.3",
    "1.2.03",
    "1.2.3-beta",
    "1.2.3+build",
    "1.2",
    "1.2.3.4",
    " 1.2.3",
    "1.2.3 ",
    "-1.2.3",
    "9007199254740992.0.0",
  ]) {
    assert.throws(() => parseStableVersion(version), /stable version/i, version);
  }
});

test("compareStableVersions uses BigInt component ordering", () => {
  assert.equal(compareStableVersions("9007199254740991.0.0", "9007199254740990.999.999"), 1);
  assert.equal(compareStableVersions("1.10.0", "1.2.999"), 1);
  assert.equal(compareStableVersions("1.2.3", "1.2.3"), 0);
  assert.equal(compareStableVersions("0.9.9", "1.0.0"), -1);
});

test("selectGreatestPublicRelease ignores draft, prerelease, and malformed tags", () => {
  const result = selectGreatestPublicRelease([
    { tag_name: "v1.2.3", draft: false, prerelease: false },
    { tag_name: "v2.0.0-rc.1", draft: false, prerelease: false },
    { tag_name: "v3.0.0", draft: true, prerelease: false },
    { tag_name: "v4.0.0", draft: false, prerelease: true },
    { tag_name: "release-5.0.0", draft: false, prerelease: false },
    { tag_name: "v1.12.0", draft: false, prerelease: false },
  ]);

  assert.equal(result.kind, "selected-release");
  assert.equal(result.version, "1.12.0");
  assert.equal(result.release.tag_name, "v1.12.0");
});

test("selectGreatestPublicRelease returns no release instead of falling back", () => {
  assert.deepEqual(selectGreatestPublicRelease([]), { kind: "no-valid-public-release" });
  assert.deepEqual(
    selectGreatestPublicRelease([
      { tag_name: "v1.0.0-beta", draft: false, prerelease: false },
      { tag_name: "v2.0.0", draft: true, prerelease: false },
    ]),
    { kind: "no-valid-public-release" },
  );

  const selected = selectGreatestPublicRelease([
    { tag_name: "v1.0.0", draft: false, prerelease: false },
    { tag_name: "v2.0.0", draft: false, prerelease: false },
  ]);
  assert.equal(selected.version, "2.0.0");
  assert.equal(selected.release.tag_name, "v2.0.0");
});

test("a missing valid public release is a successful no-op that cannot render or commit", () => {
  assert.deepEqual(decideCaskSync({ release: null, existingCask: null }), {
    kind: "no-op",
    reason: "no-valid-public-release",
    render: false,
    commit: false,
  });
});

test("decideCaskSync treats an equal literal cask version as a no-op", () => {
  assert.deepEqual(
    decideCaskSync({ release: { version: "1.2.3", digest: DIGEST }, existingCask: renderCask("1.2.3", DIGEST) }),
    {
      kind: "no-op",
      reason: "already-current",
      render: false,
      commit: false,
    },
  );
});

test("decideCaskSync refuses a downgrade explicitly", () => {
  assert.deepEqual(
    decideCaskSync({ release: { version: "1.2.3", digest: DIGEST }, existingCask: renderCask("2.0.0", DIGEST) }),
    {
      kind: "no-op",
      reason: "refused-downgrade",
      render: false,
      commit: false,
    },
  );
});

test("decideCaskSync rejects missing or malformed literal cask versions", () => {
  for (const existingCask of [null, "cask \"fixlang\" do\nend\n", "version \"1.2.3-beta\""]) {
    assert.throws(
      () => decideCaskSync({ release: { version: "1.2.3", digest: DIGEST }, existingCask }),
      /literal cask version/i,
    );
  }
});

test("decideCaskSync permits only a greater validated release to render and commit", () => {
  const decision = decideCaskSync({
    release: { version: "1.2.4", digest: DIGEST },
    existingCask: renderCask("1.2.3", DIGEST),
  });
  assert.equal(decision.kind, "update");
  assert.equal(decision.reason, "newer-release");
  assert.equal(decision.render, true);
  assert.equal(decision.commit, true);
  assert.equal(decision.cask, renderCask("1.2.4", DIGEST));
});

test("parseChecksumManifest accepts exactly one valid lowercase checksum for the exact DMG basename", () => {
  assert.equal(
    parseChecksumManifest(`${DIGEST}  ${DMG_123}\n`, DMG_123),
    DIGEST,
  );
});

test("parseChecksumManifest rejects duplicate, absent, malformed, and wrong-file entries", () => {
  const cases = [
    `${DIGEST}  ${DMG_123}\n${DIGEST}  ${DMG_123}\n`,
    `${DIGEST}  FixLang-1.2.4-arm64.dmg\n`,
    `${DIGEST.toUpperCase()}  ${DMG_123}\n`,
    `not-a-digest  ${DMG_123}\n`,
    `${DIGEST}  ./$(touch pwned).dmg\n`,
  ];
  for (const manifest of cases) {
    assert.throws(() => parseChecksumManifest(manifest, DMG_123), /checksum/i);
  }
});

test("renderCask emits the fixed safe arm64 cask contract", () => {
  const cask = renderCask("1.2.3", DIGEST);
  assert.equal(
    cask,
    `cask "fixlang" do\n  version "1.2.3"\n  sha256 "${DIGEST}"\n\n  url "https://github.com/anhdd-kuro/fix-lang/releases/download/v1.2.3/FixLang-1.2.3-arm64.dmg"\n  name "FixLang"\n  desc "AI-powered writing correction for selected text"\n  homepage "https://github.com/anhdd-kuro/fix-lang"\n\n  depends_on arch: :arm64\n  app "FixLang.app"\n\n  caveats do\n    unsigned_accessibility\n    <<~EOS\n      FixLang is currently unsigned. If macOS blocks an app you downloaded\n      from this trusted release, run:\n\n        xattr -dr com.apple.quarantine "/Applications/FixLang.app"\n    EOS\n  end\nend\n`,
  );
});

test("renderCask refuses unsafe input and never emits forbidden behavior", () => {
  for (const [version, digest] of [
    ["1.2.3; system('bad')", DIGEST],
    ["1.2.3", DIGEST.toUpperCase()],
    ["1.2.3", "x".repeat(64)],
  ]) {
    assert.throws(() => renderCask(version, digest), /stable version|digest/i);
  }

  const cask = renderCask("1.2.3", DIGEST);
  for (const forbidden of ["auto_updates", "livecheck", "preflight", "postflight"]) {
    assert.doesNotMatch(cask, new RegExp(forbidden));
  }
  assert.doesNotMatch(cask, /system\(|`|%x\{|\.system\(/);
  assert.match(cask, /xattr -dr com\.apple\.quarantine/);
});
