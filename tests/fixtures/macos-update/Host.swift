import Foundation

@main
enum Host {
    static func main() throws {
        let request = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
        let values = try JSONSerialization.jsonObject(with: request) as! [String: Any]
        let app = values["application"] as! String
        let process = Process()
        process.executableURL = URL(fileURLWithPath: app + "/Contents/Resources/native/bin/readfinch-updater")
        let input = Pipe(), output = Pipe()
        process.standardInput = input
        process.standardOutput = output
        process.standardError = FileHandle.standardError
        try process.run()
        try input.fileHandleForWriting.write(contentsOf: request + Data("\n".utf8))
        var line = Data()
        while let byte = try output.fileHandleForReading.read(upToCount: 1), !byte.isEmpty {
            line.append(byte)
            if byte == Data("\n".utf8) { break }
        }
        guard String(data: line, encoding: .utf8) == "ready\n" else {
            throw NSError(domain: "helper was not ready: " + (String(data: line, encoding: .utf8) ?? "empty"), code: 1)
        }
        let current = try Data(contentsOf: URL(fileURLWithPath: app + "/Contents/Info.plist"))
        let info = try PropertyListSerialization.propertyList(from: current, format: nil) as! [String: Any]
        precondition(info["CFBundleShortVersionString"] as? String == "1.0.0", "The helper must not replace a running app before commit")
        try input.fileHandleForWriting.write(contentsOf: Data("commit\n".utf8))
        // The real helper must outlive this process, wait for its exit and use
        // LaunchServices to open the new fixture at exactly the same path.
    }
}
