import Foundation
import Darwin

@main
enum UpdateHelper {
    static func executablePath(_ pid: pid_t) -> String? {
        var buffer = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN))
        guard proc_pidpath(pid, &buffer, UInt32(buffer.count)) > 0 else { return nil }
        return URL(fileURLWithPath: String(cString: buffer)).resolvingSymlinksInPath().path
    }

    static func main() {
        // Broken IPC must not kill the helper while it is replacing/relaunching.
        signal(SIGPIPE, SIG_IGN)
        let parent = getppid()
        var installer: MacUpdateInstaller?
        var committed = false
        var parentExited = false
        defer { installer?.cleanup() }
        do {
            guard let line = readLine(), line.utf8.count < 16 * 1024,
                  let data = line.data(using: .utf8) else { throw UpdateError.invalidRequest }
            let request = try JSONDecoder().decode(UpdateRequest.self, from: data)
            // The helper only updates its own containing application on behalf
            // of that application's main process. It never requests elevation.
            let expected = URL(fileURLWithPath: request.application)
                .appendingPathComponent("Contents/Resources/native/bin/readfinch-updater").path
            guard executablePath(getpid()) == expected else {
                throw UpdateError.invalidLocation
            }
            guard executablePath(parent)?.hasPrefix(request.application + "/Contents/MacOS/") == true else {
                throw UpdateError.invalidRequest
            }
            let task = try MacUpdateInstaller(request)
            installer = task
            try task.prepare()
            print("ready")
            fflush(stdout)
            // EOF/cancellation before commit leaves the running app untouched.
            guard readLine() == "commit" else { throw UpdateError.cancelled }
            committed = true
            try task.waitForExit(parent)
            parentExited = true
            try task.replaceAndLaunch { _ in try task.launch() }
        } catch {
            print("error:" + ((error as? UpdateError)?.rawValue ?? "preparationFailed"))
            fflush(stdout)
            if committed {
                installer?.recordFailure(error)
                if parentExited { try? installer?.launch() }
            }
        }
    }
}
