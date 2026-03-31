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

            // 5. Replace /Applications/TeamMonitorAgent.app
            let appDest = URL(fileURLWithPath: "/Applications/\(appBundleName)")
            if fm.fileExists(atPath: appDest.path) {
                try fm.removeItem(at: appDest)
            }
            try fm.copyItem(at: appSrc, to: appDest)
            downloadProgress = 1.0

            // 6. Relaunch from new location after a brief pause
            try? fm.removeItem(at: tmpDir)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                self.relaunch(appPath: appDest.path)
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

    private func relaunch(appPath: String) {
        // Use `open` CLI to start the new copy, then terminate self.
        let open = Process()
        open.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        open.arguments     = ["-n", appPath]
        try? open.run()
        // Give the new instance half a second to start before we quit
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            NSApp.terminate(nil)
        }
    }
}

// MARK: - Errors

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
