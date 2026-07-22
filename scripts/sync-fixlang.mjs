const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA256 = /^[0-9a-f]{64}$/;

/**
 * Parse a stable version without converting components through Number.
 *
 * @param {string} version
 * @returns {[bigint, bigint, bigint]}
 */
export function parseStableVersion(version) {
  if (typeof version !== "string") {
    throw new TypeError("Stable version must be a string");
  }

  const match = STABLE_VERSION.exec(version);
  if (!match) {
    throw new Error(`Invalid stable version: ${JSON.stringify(version)}`);
  }

  const components = /** @type {[bigint, bigint, bigint]} */ (
    match.slice(1).map((component) => BigInt(component))
  );
  if (components.some((component) => component > MAX_SAFE_INTEGER)) {
    throw new Error(`Stable version component exceeds JavaScript safe integer: ${version}`);
  }
  return components;
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {-1 | 0 | 1}
 */
export function compareStableVersions(left, right) {
  const leftComponents = parseStableVersion(left);
  const rightComponents = parseStableVersion(right);
  for (let index = 0; index < leftComponents.length; index += 1) {
    if (leftComponents[index] > rightComponents[index]) return 1;
    if (leftComponents[index] < rightComponents[index]) return -1;
  }
  return 0;
}

/**
 * Selects only the greatest valid public stable release. Validation of that
 * selected release must happen later; callers must never retry an older one.
 *
 * @param {Array<{tag_name?: unknown, draft?: unknown, prerelease?: unknown}>} releases
 * @returns {{kind: "no-valid-public-release"} | {kind: "selected-release", version: string, release: object}}
 */
export function selectGreatestPublicRelease(releases) {
  if (!Array.isArray(releases)) {
    throw new TypeError("Releases must be an array");
  }

  /** @type {{version: string, release: object} | null} */
  let greatest = null;
  for (const release of releases) {
    if (!release || release.draft !== false || release.prerelease !== false || typeof release.tag_name !== "string") {
      continue;
    }
    if (!release.tag_name.startsWith("v")) continue;

    const version = release.tag_name.slice(1);
    try {
      parseStableVersion(version);
    } catch {
      continue;
    }

    if (greatest === null || compareStableVersions(version, greatest.version) > 0) {
      greatest = { version, release };
    }
  }

  return greatest === null
    ? { kind: "no-valid-public-release" }
    : { kind: "selected-release", version: greatest.version, release: greatest.release };
}

/**
 * Extract the one exact digest needed for a release asset. The manifest is
 * treated as data; no line is passed to a shell or renderer.
 *
 * @param {string} manifest
 * @param {string} basename
 * @returns {string}
 */
export function parseChecksumManifest(manifest, basename) {
  if (typeof manifest !== "string" || typeof basename !== "string" || basename.length === 0) {
    throw new TypeError("Checksum manifest and basename must be non-empty strings");
  }

  const matches = [];
  for (const line of manifest.split(/\r?\n/)) {
    const match = /^([0-9a-f]{64}) {1,2}\*?([^\r\n]+)$/.exec(line);
    if (match?.[2] === basename) matches.push(match[1]);
  }
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one valid checksum for ${basename}`);
  }
  return matches[0];
}

/**
 * @param {string} cask
 * @returns {string}
 */
export function parseLiteralCaskVersion(cask) {
  if (typeof cask !== "string") {
    throw new Error("Missing literal cask version");
  }
  const matches = [...cask.matchAll(/^\s*version\s+"([^"]+)"\s*$/gm)];
  if (matches.length !== 1) {
    throw new Error("Missing or ambiguous literal cask version");
  }
  try {
    parseStableVersion(matches[0][1]);
  } catch (error) {
    throw new Error(`Malformed literal cask version: ${error.message}`);
  }

  const digestMatches = [...cask.matchAll(/^\s*sha256\s+"([0-9a-f]{64})"\s*$/gm)];
  if (digestMatches.length !== 1) {
    throw new Error("Existing cask contract must contain one literal lowercase SHA-256 digest");
  }

  const version = matches[0][1];
  const digest = digestMatches[0][1];
  if (cask !== renderCask(version, digest)) {
    throw new Error("Existing cask contract does not match the canonical FixLang cask");
  }
  return version;
}

/**
 * @param {string} version
 * @param {string} digest
 * @returns {string}
 */
export function renderCask(version, digest) {
  parseStableVersion(version);
  if (typeof digest !== "string" || !SHA256.test(digest)) {
    throw new Error("Invalid lowercase SHA-256 digest");
  }

  return `cask "fixlang" do
  version "${version}"
  sha256 "${digest}"

  url "https://github.com/anhdd-kuro/fix-lang/releases/download/v${version}/FixLang-${version}-arm64.dmg"
  name "FixLang"
  desc "AI-powered writing correction for selected text"
  homepage "https://github.com/anhdd-kuro/fix-lang"

  depends_on arch: :arm64
  app "FixLang.app"

  caveats do
    unsigned_accessibility
    <<~EOS
      FixLang is currently unsigned. If macOS blocks an app you downloaded
      from this trusted release, run:

        xattr -dr com.apple.quarantine "/Applications/FixLang.app"
    EOS
  end
end
`;
}

/**
 * Decide whether a previously validated release may modify the cask. Existing
 * cask content is validated before every decision, including no-release runs.
 *
 * @param {{release: null | {version: string, digest: string}, existingCask: string | null, allowInitialCreate?: boolean}} request
 * @returns {{kind: "no-op", reason: string, render: false, commit: false} | {kind: "update", reason: string, render: true, commit: true, cask: string}}
 */
export function decideCaskSync({ release, existingCask, allowInitialCreate = false }) {
  const existingVersion = existingCask === null ? null : parseLiteralCaskVersion(existingCask);
  if (release === null) {
    return { kind: "no-op", reason: "no-valid-public-release", render: false, commit: false };
  }
  if (!release || typeof release !== "object") {
    throw new TypeError("Release must be null or a validated release object");
  }

  if (existingVersion === null && !allowInitialCreate) {
    throw new Error("Missing literal cask version");
  }

  const cask = renderCask(release.version, release.digest);
  if (existingVersion === null) {
    return { kind: "update", reason: "initial-release", render: true, commit: true, cask };
  }

  const comparison = compareStableVersions(release.version, existingVersion);
  if (comparison === 0) {
    return { kind: "no-op", reason: "already-current", render: false, commit: false };
  }
  if (comparison < 0) {
    return { kind: "no-op", reason: "refused-downgrade", render: false, commit: false };
  }
  return { kind: "update", reason: "newer-release", render: true, commit: true, cask };
}

/**
 * Dependency-injected CLI wrapper. The workflow supplies only already-fetched
 * JSON through stdin; this module performs no network, Git, or macOS calls.
 *
 * @param {{input?: AsyncIterable<string | Uint8Array>, output?: {write(value: string): unknown}}} [io]
 * @returns {Promise<void>}
 */
export async function runCli(io = {}) {
  const input = io.input ?? process.stdin;
  const output = io.output ?? process.stdout;
  let source = "";
  for await (const chunk of input) source += chunk.toString();
  const request = JSON.parse(source);

  let result;
  switch (request.action) {
    case "select-release":
      result = selectGreatestPublicRelease(request.releases);
      break;
    case "decide-cask":
      result = decideCaskSync(request);
      break;
    case "parse-checksum":
      result = { digest: parseChecksumManifest(request.manifest, request.basename) };
      break;
    default:
      throw new Error("Unsupported action");
  }
  output.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
