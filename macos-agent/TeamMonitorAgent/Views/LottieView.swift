// LottieView.swift — Lottie animation helpers for SwiftUI

import SwiftUI
import Lottie

// MARK: - Bundle existence cache (avoids repeated file-system lookups per render)

private var lottieFileCache: [String: Bool] = [:]
private func lottieFileExists(_ name: String) -> Bool {
    if let cached = lottieFileCache[name] { return cached }
    let exists = Bundle.main.url(forResource: name, withExtension: "json") != nil
    lottieFileCache[name] = exists
    return exists
}

// MARK: - Core Lottie wrapper (macOS NSViewRepresentable)

struct LottieAnimView: NSViewRepresentable {
    let name:      String
    var loopMode:  LottieLoopMode = .loop
    var speed:     CGFloat        = 1.0

    class Coordinator {
        var loadedName: String = ""
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> LottieAnimationView {
        let view = LottieAnimationView(name: name)
        view.loopMode       = loopMode
        view.animationSpeed = speed
        view.contentMode    = .scaleAspectFit
        view.play()
        context.coordinator.loadedName = name
        return view
    }

    func updateNSView(_ nsView: LottieAnimationView, context: Context) {
        if context.coordinator.loadedName != name {
            // Animation file changed — reload
            nsView.animation        = LottieAnimation.named(name)
            nsView.loopMode         = loopMode
            nsView.animationSpeed   = speed
            nsView.play()
            context.coordinator.loadedName = name
        } else if !nsView.isAnimationPlaying {
            nsView.play()
        }
    }
}

// MARK: - Safe wrapper: shows Lottie if the file exists, SF Symbol otherwise

struct LottieOrIcon: View {
    let lottieName:    String
    let icon:          String
    let iconColor:     Color
    var size:          CGFloat = 80
    var loopMode:      LottieLoopMode = .loop

    var body: some View {
        if lottieFileExists(lottieName) {
            LottieAnimView(name: lottieName, loopMode: loopMode)
                .frame(width: size, height: size)
        } else {
            ZStack {
                Circle()
                    .fill(iconColor.opacity(0.12))
                    .frame(width: size * 0.72, height: size * 0.72)
                Image(systemName: icon)
                    .font(.system(size: size * 0.3, weight: .medium))
                    .foregroundColor(iconColor.opacity(0.75))
            }
            .frame(width: size, height: size)
        }
    }
}
