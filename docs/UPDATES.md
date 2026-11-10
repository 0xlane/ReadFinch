# Releases and application updates

ReadFinch checks for stable releases from `https://github.com/0xlane/ReadFinch/releases/latest/download/readfinch-update.json`. Checks start 20 seconds after launch and repeat every four hours when automatic updates are enabled. The device preference is saved separately in `device-updates.json`; configuration import and WebDAV do not change it.

The About page can check, download, and install on demand. Windows NSIS installations and Linux AppImages use `electron-updater` to stage updates, install on quit, or restart immediately. Fixed self-signed macOS applications in writable locations offer **Restart to update** using the native helper described below. Windows portable packages, read-only macOS applications, and Linux DEB installations reveal the verified download for manual installation. Development builds never contact the update service.

## Download and verification

Both metadata requests and package downloads try GitHub first. Transport failures fall back to the same public release URL prefixed with `https://gh-proxy.com/`. No provider credentials, API headers, or GitHub authentication tokens are sent. Requests use the system proxy in dedicated Electron sessions.

`readfinch-update.json.sig` is a detached Ed25519 signature over the exact manifest bytes. The public key is embedded in the application. An invalid signature stops the check without a proxy retry. File names, platform, architecture, version, size, and SHA-512 digests come from the verified manifest. Downloads are checked before installation; partial or invalid files cannot be installed. Only newer stable versions are accepted. The About page displays progress; transport selection stays internal.

## Publishing

Before creating a release tag, run `.github/workflows/preflight.yml` on the candidate commit. It builds the same four platform/architecture combinations, runs the core and offline OCR tests, and starts the Windows packaged application for a runtime smoke test. It only has repository read permission, always packages with `--publish never`, and uploads Actions artifacts; it cannot create a GitHub Release. Wait for both this preflight and the regular three-platform CI to pass before tagging the candidate.

If packaging succeeds but publication fails, the workflow can be dispatched with `build_run_id` and `release_tag` to reuse its successful artifacts. The publishing job verifies that all four package jobs passed, that the run belongs to this repository and the exact tag commit, and that application source has not changed. Only release tooling and documentation fixes can be applied without rebuilding. Published releases are never overwritten. Debian's `amd64` and AppImage's `x86_64` filenames are normalized to Electron's `x64` architecture in the update manifest.

1. Change the version in `package.json` and `package-lock.json` and add `docs/releases/vX.Y.Z.md`.
2. Run type checks, tests, UI verification, and a secret scan. Update the multilingual README with `npm run docs:readme`.
3. Push the reviewed commit and its `vX.Y.Z` tag. `.github/workflows/release.yml` builds Windows x64, macOS arm64/x64, and Linux x64 packages.
4. The final job verifies that all required artifacts exist, signs their manifest, uploads them into a draft release, then publishes the complete release as latest. It refuses to replace an already published version.

The `UPDATE_SIGNING_PRIVATE_KEY` repository Actions secret must contain the Ed25519 PKCS#8 PEM private key corresponding to `src/shared/update-key.json`. Never commit the private key. Keep a separate private backup. A key rotation requires first shipping an app that trusts the next key; changing the public key and server signature together would strand existing installations.

The project does not have Windows Authenticode or an Apple Developer certificate. Release-manifest signatures protect downloads from alteration by a mirror, but do not replace operating-system application signing.

## macOS with the fixed self-signed identity

The macOS installer uses the existing signed manifest and DMG, so the feed remains compatible with older clients. It does not use Squirrel, require Developer ID, install trusted certificates, request administrator privileges, or modify Gatekeeper settings. The fixed code-signing identity and permissions continuity are documented in [MACOS-SIGNING.md](MACOS-SIGNING.md).

1. The app authenticates the manifest and verifies the package as usual. Background downloads never interrupt the running app; the user clicks **Restart to update** when ready.
2. The bundled `readfinch-updater` validates its parent application, copies the DMG to a private staging directory beside the installed app, rechecks its size and SHA-512, mounts it read-only, checks the bundle identifier/version/executable, and copies the new bundle.
3. Only after preparation succeeds does the app send a commit and quit. EOF before commit cancels and cleans up. The helper waits at most 60 seconds for the parent to exit; it never forcibly terminates the app.
4. The helper checks that the installed directory has not changed, then atomically exchanges the two complete bundles on the same filesystem. It reopens the original application path with the same data directory. If LaunchServices rejects the launch, it swaps the previous bundle back and attempts to reopen it. This detects launch-request failure, not crashes after LaunchServices accepts the request.
5. Failures after commit leave a bounded status record for the next launch. If rollback itself fails, the old bundle is retained in the private `.ReadFinch-update-*` directory. Configuration, credentials and notes are never copied or replaced by the helper.

Applications running from a disk image, App Translocation, symlinked locations, or unwritable directories retain manual installation. Move the application to a writable Applications folder and relaunch to enable restart installation. Existing released clients without this helper need one manual upgrade to a version containing it; subsequent updates can be installed in-app. First-launch macOS security prompts remain subject to system policy.
