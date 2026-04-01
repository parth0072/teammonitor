#!/usr/bin/swift
// generate_icon.swift
// Generates TeamMonitor app icon as a 1024×1024 PNG, then uses sips to
// produce all required AppIcon sizes and writes them into the xcassets folder.
//
// Usage:  swift scripts/generate_icon.swift
// Run from the macos-agent/ directory.

import AppKit
import CoreGraphics
import Foundation

// ── Drawing ───────────────────────────────────────────────────────────────────

func makeIcon(size: CGFloat) -> NSImage {
    let img = NSImage(size: NSSize(width: size, height: size))
    img.lockFocus()
    defer { img.unlockFocus() }

    let ctx = NSGraphicsContext.current!.cgContext
    let s   = size

    // ── Background: deep blue rounded rect ────────────────────────────────────
    let bg = CGPath(roundedRect: CGRect(x: 0, y: 0, width: s, height: s),
                    cornerWidth: s * 0.22, cornerHeight: s * 0.22, transform: nil)
    let grad = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [
            CGColor(red: 0.071, green: 0.180, blue: 0.400, alpha: 1), // #123366
            CGColor(red: 0.039, green: 0.322, blue: 0.784, alpha: 1), // #0A52C8
        ] as CFArray,
        locations: [0, 1]
    )!
    ctx.addPath(bg)
    ctx.clip()
    ctx.drawLinearGradient(
        grad,
        start: CGPoint(x: s * 0.2, y: s),
        end:   CGPoint(x: s * 0.8, y: 0),
        options: []
    )
    ctx.resetClip()

    // ── Monitor frame ─────────────────────────────────────────────────────────
    let monW = s * 0.60, monH = s * 0.44
    let monX = (s - monW) / 2, monY = s * 0.31
    let monR = s * 0.06   // corner radius
    let lineW = s * 0.045

    // Outer bezel (white, slightly transparent)
    let bezel = CGPath(roundedRect: CGRect(x: monX, y: monY, width: monW, height: monH),
                       cornerWidth: monR, cornerHeight: monR, transform: nil)
    ctx.addPath(bezel)
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.12))
    ctx.fillPath()
    ctx.addPath(bezel)
    ctx.setStrokeColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.90))
    ctx.setLineWidth(lineW)
    ctx.strokePath()

    // Stand stem
    let stemW = s * 0.06, stemH = s * 0.12
    let stemX = (s - stemW) / 2, stemY = monY - stemH
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.85))
    ctx.fill(CGRect(x: stemX, y: stemY, width: stemW, height: stemH))

    // Stand base
    let baseW = s * 0.26, baseH = s * 0.045
    let baseX = (s - baseW) / 2, baseY = stemY - baseH
    let basePath = CGPath(roundedRect: CGRect(x: baseX, y: baseY, width: baseW, height: baseH),
                          cornerWidth: baseH / 2, cornerHeight: baseH / 2, transform: nil)
    ctx.addPath(basePath)
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.85))
    ctx.fillPath()

    // ── Activity pulse line inside the screen ─────────────────────────────────
    let pad  = lineW * 2.5
    let lx   = monX + pad + lineW / 2
    let rx   = monX + monW - pad - lineW / 2
    let cy   = monY + monH * 0.50   // vertical center of screen
    let amp  = monH * 0.28           // spike amplitude

    // 7-segment ECG-style pulse:
    // flat → rise → spike up → spike down → rise → flat
    let seg = (rx - lx) / 7
    let pts: [(CGFloat, CGFloat)] = [
        (lx,             cy),
        (lx + seg * 2,   cy),
        (lx + seg * 2.8, cy - amp),
        (lx + seg * 3.2, cy + amp * 0.5),
        (lx + seg * 3.7, cy),
        (rx,             cy),
    ]

    ctx.beginPath()
    ctx.move(to: CGPoint(x: pts[0].0, y: pts[0].1))
    for p in pts.dropFirst() { ctx.addLine(to: CGPoint(x: p.0, y: p.1)) }

    ctx.setStrokeColor(CGColor(red: 0.29, green: 0.90, blue: 0.56, alpha: 1))  // #4AE68F
    ctx.setLineWidth(lineW * 0.9)
    ctx.setLineCap(.round)
    ctx.setLineJoin(.round)
    ctx.strokePath()

    // Small glowing dot at the pulse tip
    let dotR = lineW * 1.2
    let dotX = pts[2].0, dotY = pts[2].1
    ctx.setFillColor(CGColor(red: 0.29, green: 0.90, blue: 0.56, alpha: 0.4))
    ctx.fillEllipse(in: CGRect(x: dotX - dotR * 2, y: dotY - dotR * 2, width: dotR * 4, height: dotR * 4))
    ctx.setFillColor(CGColor(red: 0.29, green: 0.90, blue: 0.56, alpha: 1))
    ctx.fillEllipse(in: CGRect(x: dotX - dotR, y: dotY - dotR, width: dotR * 2, height: dotR * 2))

    return img
}

// ── Save PNG ──────────────────────────────────────────────────────────────────

func savePNG(_ image: NSImage, to path: String) {
    guard let tiff = image.tiffRepresentation,
          let rep  = NSBitmapImageRep(data: tiff),
          let png  = rep.representation(using: .png, properties: [:]) else {
        print("ERROR: could not render PNG for \(path)"); return
    }
    try! png.write(to: URL(fileURLWithPath: path))
}

// ── Main ──────────────────────────────────────────────────────────────────────

let scriptDir   = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent()
// Resolve relative paths robustly — run from macos-agent/ or scripts/
let base        = scriptDir.deletingLastPathComponent()   // macos-agent/
let xcassetsDir = base.appendingPathComponent(
    "TeamMonitorAgent/Assets.xcassets/AppIcon.appiconset"
).path

// Generate 1024×1024 master
let masterPath = "\(xcassetsDir)/icon_1024.png"
savePNG(makeIcon(size: 1024), to: masterPath)
print("Generated master icon: \(masterPath)")

// All required macOS AppIcon sizes
let sizes: [(size: Int, scale: Int)] = [
    (16, 1), (16, 2),
    (32, 1), (32, 2),
    (128, 1), (128, 2),
    (256, 1), (256, 2),
    (512, 1), (512, 2),
]

for entry in sizes {
    let px       = entry.size * entry.scale
    let filename = "icon_\(entry.size)x\(entry.size)@\(entry.scale)x.png"
    let outPath  = "\(xcassetsDir)/\(filename)"
    let task     = Process()
    task.launchPath  = "/usr/bin/sips"
    task.arguments   = ["-z", "\(px)", "\(px)", masterPath, "--out", outPath]
    task.launch(); task.waitUntilExit()
    print("  \(px)×\(px) → \(filename)")
}

// ── Update Contents.json ──────────────────────────────────────────────────────

let contents = """
{
  "images": [
    {"filename":"icon_16x16@1x.png",   "idiom":"mac","scale":"1x","size":"16x16"},
    {"filename":"icon_16x16@2x.png",   "idiom":"mac","scale":"2x","size":"16x16"},
    {"filename":"icon_32x32@1x.png",   "idiom":"mac","scale":"1x","size":"32x32"},
    {"filename":"icon_32x32@2x.png",   "idiom":"mac","scale":"2x","size":"32x32"},
    {"filename":"icon_128x128@1x.png", "idiom":"mac","scale":"1x","size":"128x128"},
    {"filename":"icon_128x128@2x.png", "idiom":"mac","scale":"2x","size":"128x128"},
    {"filename":"icon_256x256@1x.png", "idiom":"mac","scale":"1x","size":"256x256"},
    {"filename":"icon_256x256@2x.png", "idiom":"mac","scale":"2x","size":"256x256"},
    {"filename":"icon_512x512@1x.png", "idiom":"mac","scale":"1x","size":"512x512"},
    {"filename":"icon_512x512@2x.png", "idiom":"mac","scale":"2x","size":"512x512"}
  ],
  "info": { "author": "xcode", "version": 1 }
}
"""
try! contents.write(
    toFile: "\(xcassetsDir)/Contents.json",
    atomically: true, encoding: .utf8
)
print("Updated Contents.json")
print("Done. Rebuild the app in Xcode to pick up the new icon.")
