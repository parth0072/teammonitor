// NotificationOverlay.swift — floating in-app notification banner that persists on screen

import SwiftUI
import AppKit

// MARK: - Notification Model

struct OverlayNotification: Identifiable {
    let id = UUID()
    let title:     String
    let message:   String
    let isWarning: Bool
    var progress:  Double = 1.0   // 1.0 → 0.0 as timer counts down
}

// MARK: - Manager

@MainActor
final class NotificationOverlayManager: ObservableObject {
    static let shared = NotificationOverlayManager()

    @Published private(set) var notifications: [OverlayNotification] = []

    private var panel:      NotificationOverlayPanel?
    private var dismissTimers: [UUID: Timer] = [:]
    private var progressTimers: [UUID: Timer] = [:]
    private let displayDuration: TimeInterval = 8

    private init() {}

    func show(title: String, message: String, isWarning: Bool) {
        let note = OverlayNotification(title: title, message: message, isWarning: isWarning)
        notifications.append(note)
        ensurePanelVisible()
        scheduleProgress(for: note.id)
        scheduleDismiss(for: note.id)
    }

    func dismiss(_ id: UUID) {
        dismissTimers[id]?.invalidate()
        progressTimers[id]?.invalidate()
        dismissTimers.removeValue(forKey: id)
        progressTimers.removeValue(forKey: id)
        withAnimation(.easeInOut(duration: 0.25)) {
            notifications.removeAll { $0.id == id }
        }
        if notifications.isEmpty { hidePanel() }
    }

    // MARK: - Private

    private func scheduleProgress(for id: UUID) {
        let start = Date()
        let dur   = displayDuration
        let timer = Timer(timeInterval: 0.05, repeats: true) { [weak self] _ in
            guard let self else { return }
            let elapsed  = Date().timeIntervalSince(start)
            let progress = max(0, 1.0 - elapsed / dur)
            Task { @MainActor [weak self] in
                guard let self,
                      let idx = self.notifications.firstIndex(where: { $0.id == id }) else { return }
                self.notifications[idx].progress = progress
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        progressTimers[id] = timer
    }

    private func scheduleDismiss(for id: UUID) {
        let timer = Timer(timeInterval: displayDuration, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in self?.dismiss(id) }
        }
        RunLoop.main.add(timer, forMode: .common)
        dismissTimers[id] = timer
    }

    private func ensurePanelVisible() {
        if panel == nil {
            panel = NotificationOverlayPanel()
        }
        panel?.orderFront(nil)
        panel?.repositionToTopRight()
    }

    private func hidePanel() {
        panel?.orderOut(nil)
        panel = nil
    }
}

// MARK: - Panel (NSPanel)

final class NotificationOverlayPanel: NSPanel {
    init() {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 360, height: 200),
            styleMask:   [.nonactivatingPanel, .fullSizeContentView, .borderless],
            backing:     .buffered,
            defer:       false
        )

        // Float above all other windows, including full-screen
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]

        isOpaque           = false
        backgroundColor    = .clear
        isMovable          = false
        hasShadow          = false
        ignoresMouseEvents = false

        let host = NSHostingController(rootView: NotificationOverlayView())
        host.view.wantsLayer = true
        host.view.layer?.backgroundColor = NSColor.clear.cgColor
        contentView = host.view

        repositionToTopRight()
    }

    /// Keeps the panel anchored to the top-right of the primary screen.
    func repositionToTopRight() {
        guard let screen = NSScreen.main else { return }
        let sw = screen.visibleFrame.width
        let sh = screen.visibleFrame.height
        let sx = screen.visibleFrame.origin.x
        let sy = screen.visibleFrame.origin.y
        let w: CGFloat = 360
        let x = sx + sw - w - 16
        let y = sy + sh - 16
        setFrameTopLeftPoint(NSPoint(x: x, y: y))
        setContentSize(NSSize(width: w, height: 200))
    }
}

// MARK: - SwiftUI View

struct NotificationOverlayView: View {
    @ObservedObject private var manager = NotificationOverlayManager.shared

    var body: some View {
        VStack(alignment: .trailing, spacing: 8) {
            ForEach(manager.notifications) { note in
                NotificationCard(note: note, onDismiss: { manager.dismiss(note.id) })
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
            Spacer()
        }
        .padding(.top, 4)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: manager.notifications.map(\.id))
        .frame(width: 360, alignment: .trailing)
    }
}

// MARK: - Single Notification Card

private struct NotificationCard: View {
    let note:      OverlayNotification
    let onDismiss: () -> Void

    @State private var hovered = false

    private var accentColor: Color { note.isWarning ? Color(hex: "f59e0b") : Color(hex: "22c55e") }
    private var iconName:    String { note.isWarning ? "exclamationmark.triangle.fill" : "checkmark.circle.fill" }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: iconName)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(accentColor)
                    .padding(.top, 1)

                VStack(alignment: .leading, spacing: 3) {
                    Text(note.title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Color(hex: "111827"))
                        .lineLimit(1)
                    Text(note.message)
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "4b5563"))
                        .fixedSize(horizontal: false, vertical: true)
                        .lineLimit(3)
                }

                Spacer()

                Button {
                    withAnimation { onDismiss() }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(Color(hex: "9ca3af"))
                        .frame(width: 20, height: 20)
                        .background(hovered ? Color(hex: "f3f4f6") : Color.clear)
                        .cornerRadius(4)
                }
                .buttonStyle(.plain)
                .onHover { hovered = $0 }
                .padding(.top, -2)
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
            .padding(.bottom, 10)

            // Progress bar showing time remaining
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle()
                        .fill(accentColor.opacity(0.12))
                        .frame(height: 3)
                    Rectangle()
                        .fill(accentColor.opacity(0.6))
                        .frame(width: geo.size.width * note.progress, height: 3)
                        .animation(.linear(duration: 0.05), value: note.progress)
                }
            }
            .frame(height: 3)
        }
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(.regularMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(accentColor.opacity(0.25), lineWidth: 1)
                )
        )
        .shadow(color: .black.opacity(0.12), radius: 16, x: 0, y: 6)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 4)
    }
}
