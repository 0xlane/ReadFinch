import Foundation
import CryptoKit
import Darwin

let fm = FileManager.default
let root = fm.temporaryDirectory.resolvingSymlinksInPath().appendingPathComponent("readfinch-update-tests-" + UUID().uuidString)
try fm.createDirectory(at: root, withIntermediateDirectories: false)
defer { try? fm.removeItem(at: root) }

func bundle(_ url: URL, version: String, identifier: String = "app.readfinch.ReadFinch") throws {
    try fm.createDirectory(at: url.appendingPathComponent("Contents/MacOS"), withIntermediateDirectories: true)
    let info = ["CFBundleIdentifier": identifier, "CFBundlePackageType": "APPL", "CFBundleShortVersionString": version, "CFBundleExecutable": "ReadFinch"]
    try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0)
        .write(to: url.appendingPathComponent("Contents/Info.plist"))
    let executable = url.appendingPathComponent("Contents/MacOS/ReadFinch")
    try Data("#!/bin/sh\nexit 0\n".utf8).write(to: executable)
    try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: executable.path)
}

func expect(_ expected: UpdateError, _ body: () throws -> Void) throws {
    do { try body(); fatalError("Expected \(expected)") }
    catch let error as UpdateError { precondition(error == expected, "Expected \(expected), got \(error)") }
}

func checkVersion(_ url: URL, _ version: String) throws {
    let info = try MacUpdateInstaller.bundleInfo(url)
    precondition(info["CFBundleShortVersionString"] as? String == version)
}

let installed = root.appendingPathComponent("Installed ReadFinch.app")
try bundle(installed, version: "1.0.0")
let contents = root.appendingPathComponent("payload")
try bundle(contents.appendingPathComponent("ReadFinch.app"), version: "1.1.0")
let dmg = root.appendingPathComponent("verified update.dmg")
print("Creating fixture DMG"); fflush(stdout)
try MacUpdateInstaller.run("/usr/bin/hdiutil", ["create", "-srcfolder", contents.path, "-volname", "ReadFinch test", "-format", "UDZO", dmg.path])
let bytes = try Data(contentsOf: dmg)
let digest = Data(SHA512.hash(data: bytes)).base64EncodedString()
func request(application: URL = installed, hash: String = digest, version: String = "1.1.0") -> UpdateRequest {
    UpdateRequest(application: application.path, package: dmg.path, version: version, size: Int64(bytes.count), sha512: hash, dataDirectory: root.appendingPathComponent("profile").path)
}
let profile = root.appendingPathComponent("profile")
try fm.createDirectory(at: profile, withIntermediateDirectories: false)
try Data("user data stays intact".utf8).write(to: profile.appendingPathComponent("notes"))

let corrupt = try MacUpdateInstaller(request(hash: Data(repeating: 0, count: 64).base64EncodedString()))
try expect(.packageMismatch) { try corrupt.prepare() }
corrupt.cleanup()
precondition(!fm.fileExists(atPath: corrupt.workspace.path))

let wrongVersion = try MacUpdateInstaller(request(version: "2.0.0"))
try expect(.invalidBundle) { try wrongVersion.prepare() }
wrongVersion.cleanup()
precondition(!fm.fileExists(atPath: wrongVersion.workspace.path))

let link = root.appendingPathComponent("Link.app")
try fm.createSymbolicLink(at: link, withDestinationURL: installed)
try expect(.invalidLocation) { _ = try MacUpdateInstaller(request(application: link)) }
try expect(.invalidBundle) { _ = try MacUpdateInstaller(request(version: "0.9.0")) }

let rollback = try MacUpdateInstaller(request())
print("Testing staging and rollback"); fflush(stdout)
try rollback.prepare()
try expect(.parentTimeout) { try rollback.waitForExit(getpid(), timeout: 0.1) }
try expect(.launchFailed) {
    try rollback.replaceAndLaunch { url in
        try checkVersion(url, "1.1.0")
        throw UpdateError.launchFailed
    }
}
try checkVersion(installed, "1.0.0")
rollback.cleanup()
precondition(!fm.fileExists(atPath: rollback.workspace.path))

let changed = try MacUpdateInstaller(request())
try changed.prepare()
let moved = root.appendingPathComponent("Moved.app")
try fm.moveItem(at: installed, to: moved)
try bundle(installed, version: "1.0.0")
try expect(.applicationChanged) { try changed.replaceAndLaunch { _ in fatalError("Must not launch") } }
changed.cleanup()

let success = try MacUpdateInstaller(request())
try success.prepare()
var launches = 0
try success.replaceAndLaunch { url in
    launches += 1
    precondition(url.path == installed.path)
    try checkVersion(url, "1.1.0")
    try checkVersion(success.staged, "1.0.0")
}
precondition(launches == 1)
success.cleanup()
precondition(!fm.fileExists(atPath: success.workspace.path))
let notes = try String(contentsOf: profile.appendingPathComponent("notes"), encoding: .utf8)
precondition(notes == "user data stays intact")
print("Verified DMG integrity, bundle/version checks, cancellation cleanup, parent timeout, atomic replacement, launch-failure rollback and profile preservation")
fflush(stdout)

// End-to-end process handoff. All paths are private test fixtures, never the
// user's installed app. The new bundle's executable only writes a receipt.
let hostApp = root.appendingPathComponent("Host.app")
try bundle(hostApp, version: "1.0.0")
let helperPath = hostApp.appendingPathComponent("Contents/Resources/native/bin/readfinch-updater")
try fm.createDirectory(at: helperPath.deletingLastPathComponent(), withIntermediateDirectories: true)
try fm.copyItem(atPath: CommandLine.arguments[1], toPath: helperPath.path)
let hostBinary = hostApp.appendingPathComponent("Contents/MacOS/ReadFinch")
try fm.removeItem(at: hostBinary)
try fm.copyItem(atPath: CommandLine.arguments[2], toPath: hostBinary.path)
let nextRoot = root.appendingPathComponent("next-payload")
let nextApp = nextRoot.appendingPathComponent("ReadFinch.app")
try bundle(nextApp, version: "1.1.0")
let nextBinary = nextApp.appendingPathComponent("Contents/MacOS/ReadFinch")
try Data("#!/bin/sh\nfor arg in \"$@\"; do\n case \"$arg\" in --data-dir=*) printf launched > \"${arg#--data-dir=}/relaunch-receipt\" ;; esac\ndone\n".utf8).write(to: nextBinary)
try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: nextBinary.path)
let nextDMG = root.appendingPathComponent("handoff.dmg")
print("Creating handoff fixture"); fflush(stdout)
try MacUpdateInstaller.run("/usr/bin/hdiutil", ["create", "-srcfolder", nextRoot.path, "-volname", "ReadFinch handoff test", "-format", "UDZO", nextDMG.path])
let nextBytes = try Data(contentsOf: nextDMG)
let job = UpdateRequest(application: hostApp.path, package: nextDMG.path, version: "1.1.0", size: Int64(nextBytes.count), sha512: Data(SHA512.hash(data: nextBytes)).base64EncodedString(), dataDirectory: profile.path)
let jobFile = root.appendingPathComponent("job.json")
try JSONEncoder().encode(job).write(to: jobFile)
print("Starting native host"); fflush(stdout)
let hostProcess = Process()
hostProcess.executableURL = hostBinary
hostProcess.arguments = [jobFile.path]
hostProcess.standardOutput = FileHandle.standardOutput
hostProcess.standardError = FileHandle.standardError
try hostProcess.run()
hostProcess.waitUntilExit()
precondition(hostProcess.terminationStatus == 0)
let receipt = profile.appendingPathComponent("relaunch-receipt")
let deadline = Date().addingTimeInterval(30)
while !fm.fileExists(atPath: receipt.path) && Date() < deadline { Thread.sleep(forTimeInterval: 0.1) }
precondition(fm.fileExists(atPath: receipt.path), "The replacement app was not relaunched")
try checkVersion(hostApp, "1.1.0")
while Date() < deadline {
    let pending = try fm.contentsOfDirectory(atPath: root.path).contains { $0.hasPrefix(".ReadFinch-update-") }
    if !pending { break }
    Thread.sleep(forTimeInterval: 0.1)
}
let leftover = try fm.contentsOfDirectory(atPath: root.path).filter { $0.hasPrefix(".ReadFinch-update-") }
precondition(leftover.isEmpty)
print("Verified real helper ready/commit IPC, parent exit, bundle replacement and LaunchServices relaunch")
