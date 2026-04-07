// ContentView.swift

import SwiftUI

struct ContentView: View {
    @StateObject private var auth = AuthState()
    @State private var isValidating = true
    @State private var forceUpdateVersion: String? = nil
    @State private var forceUpdateUrl:     String? = nil

    var body: some View {
        Group {
            if isValidating {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Connecting…")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let required = forceUpdateVersion {
                // Admin has set a required version — block access until updated
                ForceUpdateView(requiredVersion: required, downloadURL: forceUpdateUrl)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(hex: "0f172a").ignoresSafeArea())
            } else if auth.isLoggedIn {
                TrackingDashboardView().environmentObject(auth)
            } else {
                LoginView().environmentObject(auth)
            }
        }
        .frame(minWidth: 700, minHeight: 580)
        .onReceive(NotificationCenter.default.publisher(for: .sessionExpired)) { _ in
            auth.isLoggedIn = false
        }
        .task { await restoreSession() }
    }

    private func restoreSession() async {
        let api = APIService.shared
        defer { isValidating = false }
        guard api.token != nil else { return }
        if let emp = await api.refreshEmployee() {
            // Check force update before allowing access
            if let required = emp.forceUpdateVersion {
                let current = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
                if isUpdateRequired(current: current, required: required) {
                    forceUpdateVersion = required
                    forceUpdateUrl     = emp.forceUpdateUrl
                    return
                }
            }
            auth.isLoggedIn   = true
            auth.employeeId   = emp.id
            auth.employeeName = emp.name
            auth.email        = emp.email
        } else {
            api.logout()
        }
    }
}

class AuthState: ObservableObject {
    @Published var isLoggedIn:   Bool   = false
    @Published var employeeId:   Int    = 0
    @Published var employeeName: String = ""
    @Published var email:        String = ""
}
