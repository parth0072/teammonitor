// LoginView.swift — modern premium login screen

import SwiftUI

struct LoginView: View {
    @EnvironmentObject var auth: AuthState
    @State private var email    = ""
    @State private var password = ""
    @State private var errorMsg = ""
    @State private var loading  = false

    var body: some View {
        ZStack {
            // Background
            LinearGradient(
                colors: [Color(hex: "0F172A"), Color(hex: "1E293B")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            // Subtle dot-grid overlay
            GeometryReader { geo in
                Canvas { ctx, size in
                    let sp: CGFloat = 28
                    var path = Path()
                    var x: CGFloat = 0
                    while x <= size.width { x += sp
                        var y: CGFloat = 0
                        while y <= size.height { y += sp
                            path.addEllipse(in: CGRect(x: x, y: y, width: 1.5, height: 1.5))
                        }
                    }
                    ctx.fill(path, with: .color(Color.white.opacity(0.04)))
                }
                .frame(width: geo.size.width, height: geo.size.height)
            }

            VStack(spacing: 0) {
                Spacer()

                // Card
                VStack(spacing: 28) {

                    // Brand mark
                    VStack(spacing: 12) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 16)
                                .fill(LinearGradient(
                                    colors: [DS.indigo, DS.indigoDark],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ))
                                .frame(width: 60, height: 60)
                                .shadow(color: DS.indigo.opacity(0.5), radius: 16, x: 0, y: 6)
                            Text("TM")
                                .font(.system(size: 22, weight: .black))
                                .foregroundColor(.white)
                        }
                        VStack(spacing: 4) {
                            Text("TeamMonitor")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundColor(.white)
                            Text("Sign in to your workspace")
                                .font(.system(size: 13))
                                .foregroundColor(Color(hex: "64748B"))
                        }
                    }

                    // Error banner
                    if !errorMsg.isEmpty {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.circle.fill")
                                .foregroundColor(DS.red)
                                .font(.system(size: 13))
                            Text(errorMsg)
                                .font(.system(size: 12))
                                .foregroundColor(DS.red)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer()
                        }
                        .padding(12)
                        .background(DS.red.opacity(0.1))
                        .cornerRadius(8)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(DS.red.opacity(0.25), lineWidth: 1))
                    }

                    // Form fields
                    VStack(spacing: 14) {
                        loginField("Email", systemImage: "envelope",
                                   placeholder: "you@company.com", text: $email, secure: false)
                        loginField("Password", systemImage: "lock",
                                   placeholder: "••••••••", text: $password, secure: true)
                    }

                    // Sign In button
                    Button(action: signIn) {
                        ZStack {
                            if loading {
                                ProgressView().scaleEffect(0.8).tint(.white)
                            } else {
                                HStack(spacing: 8) {
                                    Text("Sign In")
                                        .font(.system(size: 15, weight: .semibold))
                                    Image(systemName: "arrow.right")
                                        .font(.system(size: 13, weight: .semibold))
                                }
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 46)
                        .foregroundColor(.white)
                        .background(
                            LinearGradient(
                                colors: [DS.indigo, DS.indigoDark],
                                startPoint: .leading, endPoint: .trailing
                            )
                            .opacity(loading ? 0.7 : 1.0)
                        )
                        .cornerRadius(10)
                    }
                    .buttonStyle(.plain)
                    .disabled(loading)
                    .keyboardShortcut(.return)
                }
                .padding(32)
                .background(
                    RoundedRectangle(cornerRadius: 20)
                        .fill(Color(hex: "111827").opacity(0.95))
                        .shadow(color: .black.opacity(0.4), radius: 40, x: 0, y: 20)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(Color.white.opacity(0.07), lineWidth: 1)
                )
                .frame(maxWidth: 360)

                Spacer()

                Text("Activity is monitored during working hours.")
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "334155"))
                    .padding(.bottom, 20)
            }
            .padding(.horizontal, 40)
        }
    }

    @ViewBuilder
    private func loginField(
        _ label: String,
        systemImage: String,
        placeholder: String,
        text: Binding<String>,
        secure: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(Color(hex: "64748B"))
                .textCase(.uppercase)
                .kerning(0.6)

            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.system(size: 13))
                    .foregroundColor(Color(hex: "475569"))
                    .frame(width: 16)
                Group {
                    if secure {
                        SecureField(placeholder, text: text)
                    } else {
                        TextField(placeholder, text: text)
                    }
                }
                .textFieldStyle(.plain)
                .foregroundColor(.white)
                .font(.system(size: 14))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(Color.white.opacity(0.06))
            .cornerRadius(9)
            .overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.white.opacity(0.09), lineWidth: 1))
        }
    }

    private func signIn() {
        guard !email.isEmpty, !password.isEmpty else {
            errorMsg = "Please enter your email and password."
            return
        }
        loading = true; errorMsg = ""
        Task {
            do {
                let emp = try await APIService.shared.login(email: email, password: password)
                await MainActor.run {
                    auth.employeeId   = emp.id
                    auth.employeeName = emp.name
                    auth.email        = emp.email
                    auth.isLoggedIn   = true
                    TrackingManager.shared.isTracking = false
                    loading = false
                }
            } catch {
                await MainActor.run { errorMsg = error.localizedDescription; loading = false }
            }
        }
    }
}
