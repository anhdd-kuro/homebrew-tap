# FixLang Homebrew Tap

This tap distributes the Apple Silicon FixLang macOS app from its public
GitHub Releases. Its cask is generated only after the sync workflow has
verified a public, stable FixLang release; the tap does not build or modify
the app.

## Current bootstrap state

Until the first verified cask is created, FixLang is **not yet available**
through Homebrew. The commands below will become available after that first
sync commits `Casks/fixlang.rb`.

## Install and update

FixLang is arm64-only:

```sh
brew install --cask anhdd-kuro/tap/fixlang
```

To get a newly published cask immediately, run:

```sh
brew update
brew upgrade --cask anhdd-kuro/tap/fixlang
```

Homebrew 6 may ask you to trust this third-party cask. Review and approve the
prompt, or explicitly trust only this cask beforehand:

```sh
brew trust --cask anhdd-kuro/tap/fixlang
```

The trust command is optional and does not grant trust to the whole tap.

## macOS permissions and unsigned app warning

FixLang is currently unsigned and unnotarized. Homebrew does not bypass
Gatekeeper, launch FixLang, or grant it permissions. If you decide to trust
the downloaded app and macOS blocks it, you may run this user-controlled
command:

```sh
xattr -dr com.apple.quarantine "/Applications/FixLang.app"
```

After installing or upgrading, macOS may require Accessibility permission to
be enabled again for FixLang.

## How the cask stays current

The tap's sync workflow checks for a newer release every six hours and can
also be started manually with `workflow_dispatch`. It accepts only the newest
valid public stable release and verifies its expected arm64 DMG, checksum,
app bundle, architecture, and release ancestry before writing a cask.

The process fails closed: an invalid newest release, verification failure, or
Homebrew validation failure creates no cask update and never falls back to an
older release. With no valid public stable release, it completes as a no-op
and makes no commit.

For each generated cask, the workflow records a literal version, immutable
release URL, and SHA-256, then checks the cask with Homebrew style, audit, and
fetch validation. The tap and workflow never run `xattr`, launch the app,
grant permissions, replace public release assets, or use cross-repository
secrets.

## Maintainer recovery

If sync or validation fails, correct the underlying release or cask-generation
problem and manually dispatch the workflow again. Recovery publishes a new,
validated cask commit; it does not require force-pushing the tap or retagging
an existing FixLang release.

An actual end-to-end `brew upgrade` has not yet been proven in production: it
requires two genuine verified FixLang releases.
