// ContentView.swift

import SwiftUI

struct ContentView: View {
    @StateObject private var auth = AuthState()

    var body: some View {
        Group {
            if auth.isLoggedIn { TrackingDashboardView().environmentObject(auth) }
            else               { LoginView().environmentObject(auth) }
        }
        .frame(minWidth: 700, minHeight: 580)
        .onAppear { restoreSession() }
        .onReceive(NotificationCenter.default.publisher(for: .sessionExpired)) { _ in
            auth.isLoggedIn = false
        }
    }

    /// If a token + employee were saved to Keychain on a previous login,
    /// restore AuthState so the user lands directly on the dashboard.
    private func restoreSession() {
        let api = APIService.shared
        guard let emp = api.employee, api.token != nil else { return }
        auth.isLoggedIn   = true
        auth.employeeId   = emp.id
        auth.employeeName = emp.name
        auth.email        = emp.email
    }
}

class AuthState: ObservableObject {
    @Published var isLoggedIn:   Bool   = false
    @Published var employeeId:   Int    = 0
    @Published var employeeName: String = ""
    @Published var email:        String = ""
}
