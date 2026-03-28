// TrackingDashboardView+Tabs.swift — tab bar and all tab content views

import SwiftUI

extension TrackingDashboardView {

    // MARK: – Tab bar

    var tabBar: some View {
        HStack(spacing: 0) {
            ForEach([DashTab.tasks, .activity, .notes], id: \.self) { tab in
                Button { selectedTab = tab } label: {
                    Text(tab.rawValue)
                        .font(.system(size: 12, weight: selectedTab == tab ? .semibold : .regular))
                        .foregroundColor(selectedTab == tab ? Color(hex: "2563eb") : Color(hex: "6b7280"))
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .overlay(
                            Rectangle().frame(height: 2)
                                .foregroundColor(selectedTab == tab ? Color(hex: "2563eb") : .clear),
                            alignment: .bottom
                        )
                }.buttonStyle(.plain)
            }
            Spacer()
            HStack(spacing: 4) {
                Text("Status").font(.system(size: 12)).foregroundColor(Color(hex: "6b7280"))
                Picker("", selection: $workStatus) {
                    Text("WFO").tag("WFO")
                    Text("WFH").tag("WFH")
                    Text("Remote").tag("Remote")
                }
                .pickerStyle(.menu).frame(width: 80).font(.system(size: 12))
            }
            .padding(.trailing, 12)
        }
        .background(Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
    }

    // MARK: – Tab content router

    @ViewBuilder
    var tabContent: some View {
        switch selectedTab {
        case .tasks:    tasksTabContent
        case .activity: activityTabContent
        case .notes:    notesTabContent
        }
    }

    // MARK: – Tasks tab

    var tasksTabContent: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").font(.system(size: 12))
                    .foregroundColor(Color(hex: "9ca3af"))
                TextField("Search tasks…", text: $searchText)
                    .font(.system(size: 12)).textFieldStyle(.plain)
                Spacer()
                Button {
                    activeSheet = .newTask
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus").font(.system(size: 11, weight: .bold))
                        Text("New Task").font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Color(hex: "3b82f6")).cornerRadius(6)
                }.buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(Color(hex: "f9fafb"))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)

            ScrollView {
                LazyVStack(spacing: 0) {
                    let filtered = myTasks.filter {
                        searchText.isEmpty
                        || $0.name.localizedCaseInsensitiveContains(searchText)
                        || $0.projectName.localizedCaseInsensitiveContains(searchText)
                    }
                    if tasksLoading {
                        ProgressView().padding(.vertical, 36).frame(maxWidth: .infinity)
                    } else if filtered.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "checklist").font(.system(size: 30))
                                .foregroundColor(Color(hex: "d1d5db"))
                            Text(myTasks.isEmpty ? "No tasks assigned yet" : "No tasks match search")
                                .font(.system(size: 13)).foregroundColor(Color(hex: "9ca3af"))
                            if myTasks.isEmpty {
                                Text("Ask your admin to create a project and assign tasks, or tap + New Task")
                                    .font(.system(size: 11)).foregroundColor(Color(hex: "c4c9d4"))
                                    .multilineTextAlignment(.center).padding(.horizontal, 24)
                            }
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 36)
                    } else {
                        ForEach(filtered) { task in
                            TaskRow2(
                                task: task,
                                isActive: manager.currentTask?.id == task.id && manager.isTracking,
                                onStart: { Task { await manager.punchIn(task: task) } }
                            )
                        }
                    }
                }
            }
            .background(Color.white)
        }
    }

    // MARK: – Activity tab

    var activityTabContent: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Recent App Activity").font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: "374151"))
                Spacer()
                if !manager.isTracking {
                    Text("Punch in to start tracking")
                        .font(.system(size: 11)).foregroundColor(Color(hex: "9ca3af"))
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 8)
            .background(Color(hex: "f9fafb"))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)

            ScrollView {
                LazyVStack(spacing: 0) {
                    if manager.recentApps.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "desktopcomputer").font(.system(size: 30))
                                .foregroundColor(Color(hex: "d1d5db"))
                            Text(manager.isTracking ? "Monitoring app usage…" : "Punch in to start monitoring")
                                .font(.system(size: 13)).foregroundColor(Color(hex: "9ca3af"))
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 36)
                    } else {
                        ForEach(manager.recentApps, id: \.self) { app in
                            AppActivityRow(appName: app, isActive: app == manager.currentApp)
                        }
                    }
                }
            }
            .background(Color.white)
        }
    }

    // MARK: – Notes tab

    var notesTabContent: some View {
        VStack {
            Image(systemName: "note.text").font(.system(size: 30))
                .foregroundColor(Color(hex: "d1d5db")).padding(.top, 36)
            Text("Work notes coming soon")
                .font(.system(size: 13)).foregroundColor(Color(hex: "9ca3af"))
            Spacer()
        }
        .frame(maxWidth: .infinity).background(Color.white)
    }
}
