// NotificationOverlay.swift — floating in-app notification banner

import SwiftUI
import AppKit

// MARK: - Model

struct OverlayNotification: Identifiable {
    let id          = UUID()
    let title:      String
    let message:    String
    let isWarning:  Bool
    /// persistent = stays on screen until explicitly dismissed (no auto-dismiss)
    let persistent: Bool
    var progress:   Double = 1.0   // 1.0 → 0.0 for auto-dismiss countdown
}

// MARK: - Manager

@MainActor
final class NotificationOverlayManager: ObservableObject {
    static let shared = NotificationOverlayManager()

    @Published private(set) var notifications: [OverlayNotification] = []

    private var panel:          NotificationOverlayPanel?
    private var dismissTimers:  [UUID: Timer] = [:]
    private var progressTimers: [UUID: Timer] = [:]
    private let autoDismissDuration: TimeInterval = 6

    private init() {}

    /// Show a notification. Warnings are persistent (stay until dismissed).
    func show(title: String, message: String, isWarning: Bool) {
        // Replace any existing notification with the same title to avoid stacking
        if let idx = notifications.firstIndex(where: { $0.title == title }) {
            let old = notifications[idx].id
            cancelTimers(for: old)
            notifications.remove(at: idx)
        }

        let note = OverlayNotification(
            title: title, message: message,
            isWarning: isWarning, persistent: isWarning
        )
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            notifications.append(note)
        }
        ensurePanelVisible()

        if !note.persistent {
            scheduleProgress(for: note.id)
            scheduleDismiss(for: note.id)
        }
    }

    func dismiss(_ id: UUID) {
        cancelTimers(for: id)
        withAnimation(.easeInOut(duration: 0.25)) {
            notifications.removeAll { $0.id == id }
        }
        if notifications.isEmpty { hidePanel() }
    }

    /// Dismiss all warning (persistent) notifications — call when idle ends.
    func dismissWarnings() {
        let ids = notifications.filter(\.persistent).map(\.id)
        ids.forEach { dismiss($0) }
    }

    // MARK: - Private

    private func cancelTimers(for id: UUID) {
        dismissTimers[id]?.invalidate();  dismissTimers.removeValue(forKey: id)
        progressTimers[id]?.invalidate(); progressTimers.removeValue(forKey: id)
    }

    private func scheduleProgress(for id: UUID) {
        let start = Date()
        let dur   = autoDismissDuration
        let timer = Timer(timeInterval: 0.05, repeats: true) { [weak self] _ in
            let elapsed  = Date().timeIntervalSince(start)
            let progress = max(0.0, 1.0 - elapsed / dur)
            Task { @MainActor [weak self] in
                guard let self,
                      let idx = self.notifications.firstIndex(where: { $0.id == id })
                else { return }
                self.notifications[idx].progress = progress
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        progressTimers[id] = timer
    }

    private func scheduleDismiss(for id: UUID) {
        let timer = Timer(timeInterval: autoDismissDuration, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in self?.dismiss(id) }
        }
        RunLoop.main.add(timer, forMode: .common)
        dismissTimers[id] = timer
    }

    private func ensurePanelVisible() {
        if panel == nil { panel = NotificationOverlayPanel() }
        panel?.orderFront(nil)
        panel?.repositionToTopRight()
    }

    private func hidePanel() {
        panel?.orderOut(nil)
        panel = nil
    }
}

// MARK: - Panel

final class NotificationOverlayPanel: NSPanel {
    init() {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 340, height: 300),
            styleMask:   [.nonactivatingPanel, .fullSizeContentView, .borderless],
            backing:     .buffered,
            defer:       false
        )
        level              = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        isOpaque           = false
        backgroundColor    = .clear
        isMovable          = false
        hasShadow          = false
        ignoresMouseEvents = false

        let host = NSHostingController(rootView: NotificationOverlayView())
        host.view.wantsLayer              = true
        host.view.layer?.backgroundColor  = NSColor.clear.cgColor
        contentView = host.view

        repositionToTopRight()
    }

    func repositionToTopRight() {
        guard let screen = NSScreen.main else { return }
        let vf = screen.visibleFrame
        let w: CGFloat = 340
        setFrameTopLeftPoint(NSPoint(x: vf.maxX - w - 16, y: vf.maxY - 16))
        setContentSize(NSSize(width: w, height: 300))
    }
}

// MARK: - Container View

struct NotificationOverlayView: View {
    @ObservedObject private var manager = NotificationOverlayManager.shared

    var body: some View {
        VStack(alignment: .trailing, spacing: 10) {
            ForEach(manager.notifications) { note in
                NotificationCard(note: note, onDismiss: { manager.dismiss(note.id) })
                    .transition(.asymmetric(
                        insertion:  .move(edge: .trailing).combined(with: .opacity),
                        removal:    .move(edge: .trailing).combined(with: .opacity)
                    ))
            }
            Spacer()
        }
        .padding(.top, 4)
        .frame(width: 340, alignment: .trailing)
    }
}

// MARK: - Card

private struct NotificationCard: View {
    let note:      OverlayNotification
    let onDismiss: () -> Void

    @State private var closeHovered = false

    // Amber for warning, emerald for success
    private var accent: Color {
        note.isWarning ? Color(hex: "f59e0b") : Color(hex: "16a34a")
    }
    private var accentBg: Color {
        note.isWarning ? Color(hex: "fffbeb") : Color(hex: "f0fdf4")
    }
    private var accentBorder: Color {
        note.isWarning ? Color(hex: "fde68a") : Color(hex: "bbf7d0")
    }
    private var icon: String {
        note.isWarning ? "pause.circle.fill" : "checkmark.circle.fill"
    }

    var body: some View {
        VStack(spacing: 0) {
            // Main content row
            HStack(alignment: .top, spacing: 12) {
                // Icon
                ZStack {
                    Circle()
                        .fill(accent.opacity(0.15))
                        .frame(width: 36, height: 36)
                    Image(systemName: icon)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(accent)
                }

                // Text
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(note.title)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(Color(hex: "111827"))

                        if note.persistent {
                            Text("LIVE")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(accent)
                                .padding(.horizontal, 5).padding(.vertical, 2)
                                .background(accent.opacity(0.12))
                                .cornerRadius(4)
                        }
                    }

                    Text(note.message)
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "6b7280"))
                        .fixedSize(horizontal: false, vertical: true)
                        .lineSpacing(2)
                }

                Spacer(minLength: 4)

                // Close button
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(closeHovered ? Color(hex: "374151") : Color(hex: "9ca3af"))
                        .frame(width: 18, height: 18)
                        .background(closeHovered ? Color(hex: "e5e7eb") : Color.clear)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .onHover { closeHovered = $0 }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)

            // Bottom strip: progress bar (auto-dismiss) OR persistent indicator
            if note.persistent {
                // Subtle pulsing strip to indicate it's live/active
                HStack(spacing: 6) {
                    Circle()
                        .fill(accent)
                        .frame(width: 5, height: 5)
                    Text("Stays until you resume activity")
                        .font(.system(size: 10))
                        .foregroundColor(accent.opacity(0.8))
                    Spacer()
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 10)
            } else {
                // Auto-dismiss progress bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Rectangle().fill(accent.opacity(0.08))
                        Rectangle()
                            .fill(accent.opacity(0.45))
                            .frame(width: geo.size.width * note.progress)
                            .animation(.linear(duration: 0.05), value: note.progress)
                    }
                }
                .frame(height: 2)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(accentBg)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(accentBorder, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.08), radius: 12, x: 0, y: 4)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal, 4)
    }
}
