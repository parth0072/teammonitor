// NotificationOverlay.swift — floating in-app notification banner

import SwiftUI
import AppKit

// MARK: - Model

struct OverlayNotification: Identifiable {
    let id          = UUID()
    let title:      String
    let message:    String
    let isWarning:  Bool
    let persistent: Bool       // warning = stays until dismissed
    var progress:   Double = 1.0
}

// MARK: - Manager

@MainActor
final class NotificationOverlayManager: ObservableObject {
    static let shared = NotificationOverlayManager()

    @Published private(set) var notifications: [OverlayNotification] = []

    private var panel:          NotificationOverlayPanel?
    private var dismissTimers:  [UUID: Timer] = [:]
    private var progressTimers: [UUID: Timer] = [:]
    private let autoDismiss: TimeInterval = 6

    private init() {}

    func show(title: String, message: String, isWarning: Bool) {
        // Replace existing notification with same title
        if let idx = notifications.firstIndex(where: { $0.title == title }) {
            cancelTimers(for: notifications[idx].id)
            notifications.remove(at: idx)
        }
        let note = OverlayNotification(title: title, message: message,
                                       isWarning: isWarning, persistent: isWarning)
        withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) {
            notifications.append(note)
        }
        ensurePanelVisible()
        if !note.persistent {
            scheduleProgress(for: note.id)
            scheduleDismiss(for: note.id)
        }
        // Sound feedback
        NSSound(named: isWarning ? NSSound.Name("Funk") : NSSound.Name("Pop"))?.play()
    }

    func dismiss(_ id: UUID) {
        cancelTimers(for: id)
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            notifications.removeAll { $0.id == id }
        }
        if notifications.isEmpty { hidePanel() }
    }

    func dismissWarnings() {
        notifications.filter(\.persistent).map(\.id).forEach { dismiss($0) }
    }

    // MARK: Private

    private func cancelTimers(for id: UUID) {
        dismissTimers[id]?.invalidate();  dismissTimers.removeValue(forKey: id)
        progressTimers[id]?.invalidate(); progressTimers.removeValue(forKey: id)
    }

    private func scheduleProgress(for id: UUID) {
        let start = Date(); let dur = autoDismiss
        let t = Timer(timeInterval: 0.04, repeats: true) { [weak self] _ in
            let p = max(0.0, 1.0 - Date().timeIntervalSince(start) / dur)
            Task { @MainActor [weak self] in
                guard let self, let i = self.notifications.firstIndex(where: { $0.id == id }) else { return }
                self.notifications[i].progress = p
            }
        }
        RunLoop.main.add(t, forMode: .common); progressTimers[id] = t
    }

    private func scheduleDismiss(for id: UUID) {
        let t = Timer(timeInterval: autoDismiss, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in self?.dismiss(id) }
        }
        RunLoop.main.add(t, forMode: .common); dismissTimers[id] = t
    }

    private func ensurePanelVisible() {
        if panel == nil { panel = NotificationOverlayPanel() }
        panel?.orderFront(nil)
        panel?.repositionToTopRight()
    }

    private func hidePanel() {
        panel?.orderOut(nil); panel = nil
    }
}

// MARK: - Panel

final class NotificationOverlayPanel: NSPanel {
    init() {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 348, height: 300),
            styleMask:   [.nonactivatingPanel, .fullSizeContentView, .borderless],
            backing:     .buffered, defer: false
        )
        level              = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        isOpaque           = false
        backgroundColor    = .clear
        isMovable          = false
        hasShadow          = false
        ignoresMouseEvents = false

        let host = NSHostingController(rootView: NotificationOverlayView())
        host.view.wantsLayer             = true
        host.view.layer?.backgroundColor = NSColor.clear.cgColor
        contentView = host.view
        repositionToTopRight()
    }

    func repositionToTopRight() {
        guard let screen = NSScreen.main else { return }
        let vf = screen.visibleFrame
        setFrameTopLeftPoint(NSPoint(x: vf.maxX - 348 - 16, y: vf.maxY - 16))
        setContentSize(NSSize(width: 348, height: 300))
    }
}

// MARK: - Container

struct NotificationOverlayView: View {
    @ObservedObject private var mgr = NotificationOverlayManager.shared

    var body: some View {
        VStack(alignment: .trailing, spacing: 10) {
            ForEach(mgr.notifications) { note in
                NotificationCard(note: note, onDismiss: { mgr.dismiss(note.id) })
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing).combined(with: .opacity),
                        removal:   .move(edge: .trailing).combined(with: .opacity)
                    ))
            }
            Spacer()
        }
        .padding(.top, 4)
        .frame(width: 348, alignment: .trailing)
    }
}

// MARK: - Card

private struct NotificationCard: View {
    let note:      OverlayNotification
    let onDismiss: () -> Void

    @State private var closeHovered = false
    @State private var pulsing      = false

    // Warning → amber; Resumed/info → emerald
    private var accent: Color      { note.isWarning ? Color(hex: "F59E0B") : Color(hex: "10B981") }
    private var accentSoft: Color  { note.isWarning ? Color(hex: "FCD34D") : Color(hex: "34D399") }
    private var baseBg: Color      { note.isWarning ? Color(hex: "2D1A00") : Color(hex: "0A2018") }
    private var iconName: String   { note.isWarning ? "exclamationmark.triangle.fill" : "checkmark.circle.fill" }

    var body: some View {
        VStack(spacing: 0) {
            mainRow
            footerStrip
        }
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: Color(hex: "0F172A").opacity(0.35), radius: 20, x: 0, y: 8)
        .shadow(color: accent.opacity(note.isWarning ? 0.18 : 0.10), radius: 14, x: 0, y: 4)
        .padding(.horizontal, 4)
        .onAppear { withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) { pulsing = true } }
    }

    // MARK: Main content

    private var mainRow: some View {
        HStack(alignment: .top, spacing: 13) {
            iconBadge
            textBlock
            Spacer(minLength: 4)
            closeBtn
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, note.persistent ? 10 : 12)
    }

    private var iconBadge: some View {
        ZStack {
            // Outer glow ring (pulse for persistent)
            if note.persistent {
                Circle()
                    .stroke(accent.opacity(pulsing ? 0.35 : 0.10), lineWidth: 2)
                    .frame(width: 44, height: 44)
                    .scaleEffect(pulsing ? 1.08 : 1.0)
            }
            // Filled circle
            Circle()
                .fill(
                    LinearGradient(
                        colors: [accentSoft.opacity(0.25), accent.opacity(0.15)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
                .frame(width: 38, height: 38)
            Image(systemName: iconName)
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(accentSoft)
        }
        .frame(width: 44)
    }

    private var textBlock: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 7) {
                Text(note.title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)

                if note.persistent {
                    HStack(spacing: 3) {
                        Circle()
                            .fill(accent)
                            .frame(width: 4, height: 4)
                            .opacity(pulsing ? 1 : 0.4)
                        Text("LIVE")
                            .font(.system(size: 9, weight: .heavy))
                            .foregroundColor(accentSoft)
                    }
                    .padding(.horizontal, 6).padding(.vertical, 3)
                    .background(accent.opacity(0.18))
                    .clipShape(Capsule())
                }
            }

            Text(note.message)
                .font(.system(size: 12, weight: .regular))
                .foregroundColor(Color(hex: "94A3B8"))
                .fixedSize(horizontal: false, vertical: true)
                .lineSpacing(2.5)
                .lineLimit(3)
        }
    }

    private var closeBtn: some View {
        Button(action: onDismiss) {
            Image(systemName: "xmark")
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(closeHovered ? Color.white : Color(hex: "64748B"))
                .frame(width: 22, height: 22)
                .background(closeHovered ? Color(hex: "334155") : Color.clear)
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
        .onHover { closeHovered = $0 }
        .padding(.top, 1)
    }

    // MARK: Footer

    @ViewBuilder
    private var footerStrip: some View {
        if note.persistent {
            // Subtle info row
            HStack(spacing: 6) {
                Image(systemName: "clock.arrow.circlepath")
                    .font(.system(size: 9))
                    .foregroundColor(Color(hex: "475569"))
                Text("Waiting for activity · stays until you return")
                    .font(.system(size: 10))
                    .foregroundColor(Color(hex: "475569"))
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 11)
        } else {
            // Progress bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle().fill(Color(hex: "1E293B"))
                    Rectangle()
                        .fill(
                            LinearGradient(colors: [accent, accentSoft],
                                           startPoint: .leading, endPoint: .trailing)
                        )
                        .frame(width: geo.size.width * note.progress)
                        .animation(.linear(duration: 0.04), value: note.progress)
                }
            }
            .frame(height: 2)
        }
    }

    // MARK: Background

    private var cardBackground: some View {
        ZStack {
            // Tinted base — amber for warnings, dark green for success
            RoundedRectangle(cornerRadius: 16)
                .fill(baseBg)

            // Accent colour wash over the base
            RoundedRectangle(cornerRadius: 16)
                .fill(accent.opacity(0.10))

            // Top edge shimmer
            VStack {
                LinearGradient(
                    colors: [Color.white.opacity(0.07), Color.clear],
                    startPoint: .top, endPoint: .bottom
                )
                .frame(height: 40)
                Spacer()
            }
            .clipShape(RoundedRectangle(cornerRadius: 16))

            // Border
            RoundedRectangle(cornerRadius: 16)
                .stroke(accent.opacity(0.55), lineWidth: 1)
        }
    }
}
