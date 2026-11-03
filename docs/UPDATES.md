# Releases and application updates

ReadFinch checks for stable releases from `https://github.com/0xlane/ReadFinch/releases/latest/download/readfinch-update.json`. Checks start 20 seconds after launch and repeat every four hours when automatic updates are enabled. The device preference is saved separately in `device-updates.json`; configuration import and WebDAV do not change it.

The Software updates page can check, download, and install on demand. Windows NSIS installations and Linux AppImages use `electron-updater` to stage updates, install on quit, or restart immediately. Windows portable packages, ad-hoc signed macOS bundles, and Linux DEB installations download the correct package and reveal it for manual installation. Development builds never contact the update service.

## Download and verification

Both metadata requests and package downloads try GitHub first. Transport failures fall back to the same public release URL prefixed with `https://gh-proxy.com/`. No provider credentials, API headers, or GitHub authentication tokens are sent. Requests use the system proxy in dedicated Electron sessions.

`readfinch-update.json.sig` is a detached Ed25519 signature over the exact manifest bytes. The public key is embedded in the application. An invalid signature stops the check without a proxy retry. File names, platform, architecture, version, size, and SHA-512 digests come from the verified manifest. Downloads are checked before installation; partial or invalid files cannot be installed. Only newer stable versions are accepted. The UI displays progress and which source is in use.

## Publishing

1. Change the version in `package.json` and `package-lock.json` and add `docs/releases/vX.Y.Z.md`.
2. Run type checks, tests, UI verification, and a secret scan. Update the multilingual README with `npm run docs:readme`.
3. Push the reviewed commit and its `vX.Y.Z` tag. `.github/workflows/release.yml` builds Windows x64, macOS arm64/x64, and Linux x64 packages.
4. The final job verifies that all required artifacts exist, signs their manifest, uploads them into a draft release, then publishes the complete release as latest. It refuses to replace an already published version.

The `UPDATE_SIGNING_PRIVATE_KEY` repository Actions secret must contain the Ed25519 PKCS#8 PEM private key corresponding to `src/shared/update-key.json`. Never commit the private key. Keep a separate private backup. A key rotation requires first shipping an app that trusts the next key; changing the public key and server signature together would strand existing installations.

The first release does not have Windows Authenticode or an Apple Developer certificate. Release-manifest signatures protect downloads from alteration by a mirror, but do not replace operating-system application signing. Automatic macOS replacement should only be enabled after setting up a consistent Apple signing and notarization identity.
