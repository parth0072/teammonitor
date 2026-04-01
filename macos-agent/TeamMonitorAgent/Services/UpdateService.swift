// UpdateService.swift — checks GitHub Releases for newer versions,
// downloads the zip, replaces the app, and relaunches.

import Foundation
import AppKit

private let kDismissedVersion = "tm_dismissed_update_version"

@MainActor
class UpdateService: ObservableObject {
    static let shared = UpdateService()

    @Published var updateAvailable  = false
    @Published var latestVersion    = ""
    @Published var isDownloading    = false
    @Published var downloadProgress: Double = 0
    @Published var installError: String? = nil

    private let apiURL     = "https://api.github.com/repos/parth0072/teammonitor/releases/latest"
    private let zipURL     = "https://github.com/parth0072/teammonitor/releases/latest/download/TeamMonitorAgent.zip"
    private let appBundleName = "TeamMonitorAgent.app"

    var currentVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    }

    // MARK: - Check

    /// Fetch latest release from GitHub and set updateAvailable if newer.
    /// Safe to call multiple times; no-op if already showing an update.
    func checkForUpdates() async {
        guard let url = URL(string: apiURL) else { return }
        do {
            var req = URLRequest(url: url)
            req.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
            req.timeoutInterval = 10
            let (data, _) = try await URLSession.shared.data(for: req)
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let tag  = json["tag_name"] as? String else { return }
            let remote = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
            latestVersion = remote
            if isNewer(remote, than: currentVersion) {
                updateAvailable = true
                print("[UpdateService] Update available: \(remote) (current: \(currentVersion))")
            } else {
                print("[UpdateService] Up to date (\(currentVersion))")
            }
        } catch {
            print("[UpdateService] Version check failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Download & Install

    func downloadAndInstall() async {
        guard let url = URL(string: zipURL) else { return }
        isDownloading    = true
        updateAvailable  = false   // hide banner immediately
        downloadProgress = 0
        installError     = nil

        do {
            // 1. Download zip to a temp file
            let (localURL, _) = try await URLSession.shared.download(from: url)
            downloadProgress = 0.40

            // 2. Unzip into a temp directory
            let fm     = FileManager.default
            let tmpDir = fm.temporaryDirectory.appendingPathComponent("tm-update-\(UUID().uuidString)")
            try fm.createDirectory(at: tmpDir, withIntermediateDirectories: true)

            let unzip = Process()
            unzip.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
            unzip.arguments     = ["-q", localURL.path, "-d", tmpDir.path]
            try unzip.run(); unzip.waitUntilExit()
            guard unzip.terminationStatus == 0 else {
                throw UpdateError.unzipFailed
            }
            downloadProgress = 0.65

            // 3. Find the .app inside the extracted folder
            let appSrc: URL
            let extracted = try fm.contentsOfDirectory(at: tmpDir, includingPropertiesForKeys: nil)
            if let found = extracted.first(where: { $0.lastPathComponent == appBundleName }) {
                appSrc = found
            } else if let found = extracted.first(where: { $0.pathExtension == "app" }) {
                appSrc = found
            } else {
                throw UpdateError.appNotFoundInZip
            }

            // 4. Remove quarantine flag
            let xattr = Process()
            xattr.executableURL = URL(fileURLWithPath: "/usr/bin/xattr")
            xattr.arguments     = ["-rd", "com.apple.quarantine", appSrc.path]
            try? xattr.run(); xattr.waitUntilExit()
            downloadProgress = 0.80

            // 5. Replace the running copy (wherever it is — /Applications, ~/Downloads, etc.)
            let currentAppURL = Bundle.main.bundleURL
            let appDest       = currentAppURL.deletingLastPathComponent()
                                             .appendingPathComponent(appBundleName)

            // Use a shell script so macOS doesn't block the self-replace
            let script = """
            sleep 1
            rm -rf \(appDest.path.shellEscaped)
            cp -R \(appSrc.path.shellEscaped) \(appDest.path.shellEscaped)
            xattr -rd com.apple.quarantine \(appDest.path.shellEscaped) 2>/dev/null || true
            open -n \(appDest.path.shellEscaped)
            """
            let scriptFile = tmpDir.appendingPathComponent("install.sh")
            try script.write(to: scriptFile, atomically: true, encoding: .utf8)
            try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: scriptFile.path)

            let sh = Process()
            sh.executableURL = URL(fileURLWithPath: "/bin/bash")
            sh.arguments     = [scriptFile.path]
            try sh.run()   // detached — runs after we quit
            downloadProgress = 1.0

            // 6. Quit so the install script can replace us
            try? fm.removeItem(at: tmpDir)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                NSApp.terminate(nil)
            }

        } catch {
            isDownloading = false
            installError  = error.localizedDescription
            print("[UpdateService] Install failed: \(error)")
        }
    }

    // MARK: - Dismiss

    /// Remember the user dismissed this particular version so the banner
    /// doesn't come back until a newer version appears.
    func dismissUpdate() {
        UserDefaults.standard.set(latestVersion, forKey: kDismissedVersion)
        updateAvailable = false
    }

    // MARK: - Helpers

    private func isNewer(_ remote: String, than current: String) -> Bool {
        // If user already dismissed this exact version, don't re-show.
        let dismissed = UserDefaults.standard.string(forKey: kDismissedVersion) ?? ""
        if dismissed == remote { return false }

        // Semantic version comparison: split by ".", compare numerically.
        let r = remote.split(separator: ".").compactMap { Int($0) }
        let c = current.split(separator: ".").compactMap { Int($0) }
        for i in 0..<max(r.count, c.count) {
            let rv = i < r.count ? r[i] : 0
            let cv = i < c.count ? c[i] : 0
            if rv > cv { return true }
            if rv < cv { return false }
        }
        return false
    }

}

// MARK: - Errors

private extension String {
    /// Wraps the string in single quotes and escapes any embedded single quotes,
    /// so it's safe to embed in a shell script argument.
    var shellEscaped: String { "'" + replacingOccurrences(of: "'", with: "'\\''") + "'" }
}

enum UpdateError: LocalizedError {
    case unzipFailed
    case appNotFoundInZip

    var errorDescription: String? {
        switch self {
        case .unzipFailed:       return "Failed to unzip the update package."
        case .appNotFoundInZip:  return "Could not find TeamMonitorAgent.app inside the downloaded zip."
        }
    }
}
