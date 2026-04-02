// LottieView.swift — Lottie animation helpers for SwiftUI
//
// Add .json animation files to the Xcode project (drag into the
// TeamMonitorAgent group, check "Add to target: TeamMonitorAgent").
// Recommended free animations from https://lottiefiles.com :
//
//   empty_tasks.json  — search "empty list" or "no tasks"
//   lf_loading.json   — search "loading dots" or "three dots"
//   lf_tracking.json  — search "recording" or "pulse"
//
// The views below fall back to SF Symbols automatically if the file
// is not yet bundled, so the app always works.

import SwiftUI
import Lottie

// MARK: - Core Lottie wrapper (macOS NSViewRepresentable)

struct LottieAnimView: NSViewRepresentable {
    let name:      String
    var loopMode:  LottieLoopMode = .loop
    var speed:     CGFloat        = 1.0

    func makeNSView(context: Context) -> LottieAnimationView {
        let view = LottieAnimationView(name: name)
        view.loopMode       = loopMode
        view.animationSpeed = speed
        view.contentMode    = .scaleAspectFit
        view.play()
        return view
    }

    func updateNSView(_ nsView: LottieAnimationView, context: Context) {
        if !nsView.isAnimationPlaying { nsView.play() }
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
        if Bundle.main.url(forResource: lottieName, withExtension: "json") != nil {
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
