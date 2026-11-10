import Foundation
import CryptoKit
import Darwin

enum UpdateError: String, Error {
    case invalidRequest, invalidLocation, packageMismatch, invalidBundle
    case preparationFailed, cancelled, parentTimeout, applicationChanged, replacementFailed, launchFailed
}

struct UpdateCommandError: Error {
    let tool: String
    let status: Int32
}

struct UpdateRequest: Codable {
    let application: String
    let package: String
    let version: String
    let size: Int64
    let sha512: String
    let dataDirectory: String
}

// The running app authenticates the release manifest. This unprivileged helper
// rechecks its package digest on a private copy before mounting or unpacking it.
// No certificate trust settings or Gatekeeper policy are changed.
final class MacUpdateInstaller {
    let request: UpdateRequest
    let application: URL
    let workspace: URL
    let staged: URL
    private let original: (device: dev_t, inode: ino_t)
    private var preserveBackup = false
    private let fm = FileManager.default

    init(_ request: UpdateRequest) throws {
        guard request.size > 0, request.size <= 2 * 1024 * 1024 * 1024,
              Data(base64Encoded: request.sha512)?.count == 64,
              request.version.range(of: #"^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$"#, options: .regularExpression) != nil,
              request.application.hasPrefix("/"), request.package.hasPrefix("/"),
              request.dataDirectory.hasPrefix("/") else { throw UpdateError.invalidRequest }
        self.request = request
        application = URL(fileURLWithPath: request.application).standardizedFileURL
        let parent = application.deletingLastPathComponent()
        guard application.pathExtension == "app",
              application.resolvingSymlinksInPath().path == application.path,
              !application.path.contains("/AppTranslocation/"),
              access(parent.path, W_OK) == 0, access(application.path, W_OK) == 0 else {
            throw UpdateError.invalidLocation
        }
        var info = stat()
        guard lstat(application.path, &info) == 0, info.st_mode & S_IFMT == S_IFDIR else {
            throw UpdateError.invalidLocation
        }
        original = (info.st_dev, info.st_ino)
        try Self.validateBundle(application)
        let current = try Self.bundleInfo(application)["CFBundleShortVersionString"] as? String
        guard let current, Self.newer(request.version, than: current) else { throw UpdateError.invalidBundle }
        workspace = parent.appendingPathComponent(".ReadFinch-update-" + UUID().uuidString, isDirectory: true)
        staged = workspace.appendingPathComponent("ReadFinch.app", isDirectory: true)
        try fm.createDirectory(at: workspace, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
    }

    static func newer(_ next: String, than current: String) -> Bool {
        let a = next.split(separator: ".").compactMap { Int($0) }
        let b = current.split(separator: ".").compactMap { Int($0) }
        return a.count == 3 && b.count == 3 && b.lexicographicallyPrecedes(a)
    }

    static func bundleInfo(_ url: URL) throws -> [String: Any] {
        let bytes = try Data(contentsOf: url.appendingPathComponent("Contents/Info.plist"))
        guard let info = try PropertyListSerialization.propertyList(from: bytes, format: nil) as? [String: Any] else {
            throw UpdateError.invalidBundle
        }
        return info
    }

    static func validateBundle(_ url: URL, version: String? = nil) throws {
        let info = try bundleInfo(url)
        guard info["CFBundleIdentifier"] as? String == "app.readfinch.ReadFinch",
              info["CFBundlePackageType"] as? String == "APPL",
              let executable = info["CFBundleExecutable"] as? String,
              !executable.isEmpty, !executable.contains("/"), executable != ".", executable != "..",
              version == nil || info["CFBundleShortVersionString"] as? String == version else {
            throw UpdateError.invalidBundle
        }
        let binary = url.appendingPathComponent("Contents/MacOS/" + executable)
        guard binary.resolvingSymlinksInPath().path.hasPrefix(url.path + "/Contents/"),
              access(binary.path, X_OK) == 0 else { throw UpdateError.invalidBundle }
    }

    @discardableResult
    static func run(_ executable: String, _ arguments: [String], timeout: TimeInterval = 120) throws -> Data {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        // A file avoids filling a pipe while waiting for hdiutil/ditto/open.
        let output = FileManager.default.temporaryDirectory.appendingPathComponent("readfinch-update-" + UUID().uuidString)
        guard FileManager.default.createFile(atPath: output.path, contents: nil, attributes: [.posixPermissions: 0o600]) else {
            throw UpdateError.preparationFailed
        }
        defer { try? FileManager.default.removeItem(at: output) }
        let handle = try FileHandle(forWritingTo: output)
        defer { try? handle.close() }
        process.standardOutput = handle
        process.standardError = FileHandle.nullDevice
        process.standardInput = FileHandle.nullDevice
        try process.run()
        let deadline = Date().addingTimeInterval(timeout)
        while process.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.1) }
        if process.isRunning {
            process.terminate()
            Thread.sleep(forTimeInterval: 0.2)
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
            process.waitUntilExit()
            throw UpdateError.preparationFailed
        }
        guard process.terminationStatus == 0 else {
            throw UpdateCommandError(tool: URL(fileURLWithPath: executable).lastPathComponent, status: process.terminationStatus)
        }
        return try Data(contentsOf: output)
    }

    func prepare() throws {
        let archive = workspace.appendingPathComponent("update.dmg")
        // Mount only a private snapshot whose bytes have been checked, never the
        // download path which may have changed since the app checked it.
        let descriptor = open(request.package, O_RDONLY | O_NOFOLLOW)
        guard descriptor >= 0 else { throw UpdateError.packageMismatch }
        let input = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        defer { try? input.close() }
        var metadata = stat()
        guard fstat(descriptor, &metadata) == 0, metadata.st_mode & S_IFMT == S_IFREG,
              metadata.st_size == request.size else { throw UpdateError.packageMismatch }
        let outputDescriptor = open(archive.path, O_WRONLY | O_CREAT | O_EXCL, 0o600)
        guard outputDescriptor >= 0 else { throw UpdateError.preparationFailed }
        let output = FileHandle(fileDescriptor: outputDescriptor, closeOnDealloc: true)
        defer { try? output.close() }
        var hash = SHA512()
        var count: Int64 = 0
        while let bytes = try input.read(upToCount: 1024 * 1024), !bytes.isEmpty {
            count += Int64(bytes.count)
            guard count <= request.size else { throw UpdateError.packageMismatch }
            hash.update(data: bytes)
            try output.write(contentsOf: bytes)
        }
        guard count == request.size, Data(hash.finalize()).base64EncodedString() == request.sha512 else {
            throw UpdateError.packageMismatch
        }
        try output.synchronize()
        try output.close()
        let mount = workspace.appendingPathComponent("volume", isDirectory: true)
        try fm.createDirectory(at: mount, withIntermediateDirectories: false)
        defer {
            // Also attempt detach after a timeout or partial attach.
            _ = try? Self.run("/usr/bin/hdiutil", ["detach", mount.path, "-force"], timeout: 30)
        }
        try Self.run("/usr/bin/hdiutil", ["attach", archive.path, "-readonly", "-nobrowse", "-noautoopen", "-mountpoint", mount.path])
        let source = mount.appendingPathComponent("ReadFinch.app", isDirectory: true)
        guard source.resolvingSymlinksInPath().path == source.path else { throw UpdateError.invalidBundle }
        try Self.validateBundle(source, version: request.version)
        try Self.run("/usr/bin/ditto", [source.path, staged.path])
        try Self.validateBundle(staged, version: request.version)
    }

    func waitForExit(_ parent: pid_t, timeout: TimeInterval = 60) throws {
        let deadline = Date().addingTimeInterval(timeout)
        while kill(parent, 0) == 0 || errno == EPERM {
            guard Date() < deadline else { throw UpdateError.parentTimeout }
            Thread.sleep(forTimeInterval: 0.1)
        }
    }

    func replaceAndLaunch(launch: (URL) throws -> Void) throws {
        var info = stat()
        guard lstat(application.path, &info) == 0,
              info.st_dev == original.device, info.st_ino == original.inode else {
            throw UpdateError.applicationChanged
        }
        // Both directories are on the same filesystem. RENAME_SWAP is atomic:
        // even an interruption leaves a complete application at the original path.
        guard renamex_np(staged.path, application.path, UInt32(RENAME_SWAP)) == 0 else {
            throw UpdateError.replacementFailed
        }
        do {
            try launch(application)
        } catch {
            if renamex_np(staged.path, application.path, UInt32(RENAME_SWAP)) != 0 {
                // Never remove the sole backup if rollback itself fails.
                preserveBackup = true
            }
            throw UpdateError.launchFailed
        }
    }

    func launch() throws {
        try Self.run("/usr/bin/open", ["-n", application.path, "--args", "--data-dir=" + request.dataDirectory], timeout: 30)
    }

    func recordFailure(_ error: Error) {
        let directory = URL(fileURLWithPath: request.dataDirectory).appendingPathComponent("updates", isDirectory: true)
        try? fm.createDirectory(at: directory, withIntermediateDirectories: true)
        // No raw paths, process output, or application data enter the report.
        let report: [String: Any] = ["status": "failed", "code": (error as? UpdateError)?.rawValue ?? "preparationFailed", "backupRetained": preserveBackup]
        if let data = try? JSONSerialization.data(withJSONObject: report) {
            try? data.write(to: directory.appendingPathComponent("macos-install-result.json"), options: .atomic)
        }
    }

    func cleanup() {
        // Do not recurse into a mount after a failed detach.
        let mount = workspace.appendingPathComponent("volume").path
        var a = stat(), b = stat()
        if lstat(mount, &a) == 0 && lstat(workspace.path, &b) == 0 && a.st_dev != b.st_dev { return }
        if !preserveBackup { try? fm.removeItem(at: workspace) }
    }
}
