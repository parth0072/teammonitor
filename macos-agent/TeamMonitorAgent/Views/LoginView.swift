// LoginView.swift – uses APIService (no Firebase)

import SwiftUI

struct LoginView: View {
    @EnvironmentObject var auth: AuthState
    @State private var email    = ""
    @State private var password = ""
    @State private var errorMsg = ""
    @State private var loading  = false

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(hex:"1e293b"), Color(hex:"0f172a")], startPoint:.topLeading, endPoint:.bottomTrailing)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()
                VStack(spacing: 24) {
                    VStack(spacing: 8) {
                        Text("🖥").font(.system(size: 52))
                        Text("TeamMonitor").font(.system(size: 26, weight: .bold)).foregroundColor(.white)
                        Text("Employee Portal").font(.system(size: 14)).foregroundColor(Color(hex:"94a3b8"))
                    }.padding(.bottom, 8)

                    if !errorMsg.isEmpty {
                        HStack {
                            Image(systemName:"exclamationmark.circle.fill").foregroundColor(Color(hex:"ef4444"))
                            Text(errorMsg).foregroundColor(Color(hex:"ef4444")).font(.system(size: 13))
                        }
                        .padding(12).background(Color(hex:"ef4444").opacity(0.1)).cornerRadius(8)
                    }

                    VStack(spacing: 16) {
                        field("Email Address", placeholder:"you@company.com", text:$email, secure:false)
                        field("Password", placeholder:"••••••••", text:$password, secure:true)
                    }

                    Button(action: signIn) {
                        HStack {
                            if loading { ProgressView().scaleEffect(0.7).tint(.white) }
                            Text(loading ? "Signing in…" : "Sign In →").font(.system(size: 15, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity).padding(13)
                        .background(Color(hex:"3b82f6").opacity(loading ? 0.7 : 1))
                        .foregroundColor(.white).cornerRadius(9)
                    }.buttonStyle(.plain).disabled(loading).keyboardShortcut(.return)
                }
                .padding(36)
                .background(Color.white.opacity(0.05))
                .cornerRadius(18)
                .frame(maxWidth: 380)

                Spacer()
                Text("Your activity is monitored during working hours.")
                    .font(.system(size: 11)).foregroundColor(Color(hex:"475569")).padding(.bottom, 20)
            }.padding(.horizontal, 40)
        }
    }

    @ViewBuilder
    private func field(_ label: String, placeholder: String, text: Binding<String>, secure: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.system(size: 13, weight: .semibold)).foregroundColor(Color(hex:"94a3b8"))
            Group {
                if secure { SecureField(placeholder, text: text) } else { TextField(placeholder, text: text) }
            }
            .textFieldStyle(.plain).padding(12)
            .background(Color.white.opacity(0.08)).cornerRadius(8)
            .foregroundColor(.white).font(.system(size: 14))
        }
    }

    private func signIn() {
        guard !email.isEmpty, !password.isEmpty else { errorMsg = "Enter your email and password."; return }
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

// Color(hex:) is defined in TrackingDashboardView.swift
