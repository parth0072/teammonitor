// TrackingDashboardView+Header.swift — dark sidebar navigation + toast view

import SwiftUI

extension TrackingDashboardView {

    // MARK: – Sidebar

    var sidebar: some View {
        VStack(spacing: 0) {

            // Logo + app name
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(LinearGradient(
                            colors: [DS.indigo, DS.indigoDark],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        ))
                        .frame(width: 34, height: 34)
                        .shadow(color: DS.indigo.opacity(0.5), radius: 8, x: 0, y: 3)
                    Text("TM")
                        .font(.system(size: 13, weight: .black))
                        .foregroundColor(.white)
                }
                Text("TeamMonitor")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(DS.sidebarTextSel)
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.top, 18)
            .padding(.bottom, 14)

            // User card
            HStack(spacing: 9) {
                ZStack {
                    Circle()
                        .fill(LinearGradient(
                            colors: [DS.indigo.opacity(0.35), DS.indigoDark.opacity(0.25)],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        ))
                        .frame(width: 32, height: 32)
                    Text(userInitials)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(DS.indigo)
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(auth.employeeName.isEmpty ? "Employee" : auth.employeeName)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(DS.sidebarTextSel)
                        .lineLimit(1)
                    Text(auth.email)
                        .font(.system(size: 10))
                        .foregroundColor(DS.sidebarText)
                        .lineLimit(1)
                }
                Spacer()

                // Live tracking indicator
                if manager.isTracking && !manager.isOnBreak {
                    Circle()
                        .fill(DS.emerald)
                        .frame(width: 7, height: 7)
                        .shadow(color: DS.emerald.opacity(0.6), radius: 4)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 9)
            .background(DS.sidebarSurface)
            .cornerRadius(9)
            .padding(.horizontal, 10)
            .padding(.bottom, 14)

            // Primary navigation (no Notes)
            VStack(spacing: 2) {
                sidebarNavItem(.tasks,    icon: "checklist",   label: "Tasks")
                sidebarNavItem(.activity, icon: "waveform",    label: "Activity")
            }

            sidebarDivider()

            // Quick actions
            sidebarActionButton("square.and.pencil",  label: "Manual Entry") { activeSheet = .manualEntry }
            sidebarActionButton("chart.bar.fill",      label: "Reports")      { activeSheet = .reports }
            sidebarActionButton("arrow.clockwise",     label: "Refresh")      { loadTasks() }

            Spacer()

            // Work status picker
            VStack(alignment: .leading, spacing: 5) {
                Text("Status")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(DS.sidebarText)
                    .textCase(.uppercase)
                    .kerning(0.5)
                    .padding(.horizontal, 14)
                Picker("", selection: $workStatus) {
                    Text("🏢  WFO").tag("WFO")
                    Text("🏠  WFH").tag("WFH")
                    Text("🌍  Remote").tag("Remote")
                }
                .pickerStyle(.menu)
                .font(.system(size: 12))
                .padding(.horizontal, 8)
            }
            .padding(.bottom, 10)

            sidebarDivider()

            // Settings + sign out
            sidebarActionButton("gearshape.fill", label: "Settings")      { activeSheet = .settings }
            sidebarActionButton("ant.fill",        label: "Report Issue")  { activeSheet = .bugReport }
            sidebarActionButton(
                "rectangle.portrait.and.arrow.right",
                label: "Sign Out",
                danger: true
            ) {
                Task {
                    if manager.isTracking { await manager.punchOut() }
                    APIService.shared.logout()
                    await MainActor.run { auth.isLoggedIn = false }
                }
            }
            .padding(.bottom, 14)
        }
        .frame(width: 188)
        .background(DS.sidebarBg)
    }

    // MARK: – Sidebar helpers

    @ViewBuilder
    private func sidebarNavItem(_ tab: DashTab, icon: String, label: String) -> some View {
        let isSelected = selectedTab == tab
        Button { withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) { selectedTab = tab } } label: {
            HStack(spacing: 9) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(isSelected ? DS.indigo : DS.sidebarText)
                    .frame(width: 17)
                Text(label)
                    .font(.system(size: 13, weight: isSelected ? .semibold : .regular))
                    .foregroundColor(isSelected ? DS.sidebarTextSel : DS.sidebarText)
                Spacer()
                if isSelected {
                    Capsule()
                        .fill(DS.indigo)
                        .frame(width: 3, height: 16)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(SidebarNavItemStyle(isSelected: isSelected))
        .padding(.horizontal, 8)
    }

    @ViewBuilder
    private func sidebarActionButton(
        _ icon: String,
        label: String,
        danger: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 9) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(danger ? DS.red.opacity(0.75) : DS.sidebarText)
                    .frame(width: 17)
                Text(label)
                    .font(.system(size: 13))
                    .foregroundColor(danger ? DS.red.opacity(0.75) : DS.sidebarText)
                Spacer()
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .contentShape(Rectangle())
        }
        .buttonStyle(SidebarNavItemStyle(isSelected: false))
        .padding(.horizontal, 8)
    }

    private func sidebarDivider() -> some View {
        Rectangle()
            .fill(DS.sidebarBorder)
            .frame(height: 1)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
    }

    // MARK: – Toast

    func toastView(_ t: ToastMessage) -> some View {
        HStack(spacing: 10) {
            Image(systemName: t.isWarning ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                .foregroundColor(t.isWarning ? DS.amber : DS.emerald)
                .font(.system(size: 14))
            Text(t.text)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(DS.text)
            Spacer()
            Button { withAnimation { toast = nil } } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(DS.textMuted)
            }.buttonStyle(.plain)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .background(.regularMaterial)
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.12), radius: 20, x: 0, y: 6)
        .padding(.horizontal, 24)
    }
}
