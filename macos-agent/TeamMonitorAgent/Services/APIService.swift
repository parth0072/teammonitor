// APIService.swift – replaces FirebaseService, talks to the Node.js/cPanel backend

import Foundation

// MARK: - Credentials store (UserDefaults — no permission prompts for unsigned builds)
// Keychain was causing a system dialog on every launch for unsigned/dev builds.

private struct CredStore {
    static func save(_ value: String, key: String) {
        UserDefaults.standard.set(value, forKey: "tm_cred_\(key)")
    }
    static func load(key: String) -> String? {
        UserDefaults.standard.string(forKey: "tm_cred_\(key)")
    }
    static func delete(key: String) {
        UserDefaults.standard.removeObject(forKey: "tm_cred_\(key)")
    }
}

// Alias so the rest of the file is unchanged
private typealias Keychain = CredStore

// ── Switch between local dev and production ───────────────────────────────────
// Local testing:
// let API_BASE = "http://localhost:3001/api"
// Production:
let API_BASE = "https://api.alphabyteinnovation.com/teammonitor/api"

// MARK: - Models

struct LoginResponse: Decodable {
    let token: String
    let employee: EmployeeInfo
}
struct EmployeeInfo: Codable {
    let id: Int
    let name: String
    let email: String
    let role: String
    let screenshotInterval: Int
    enum CodingKeys: String, CodingKey {
        case id, name, email, role
        case screenshotInterval = "screenshot_interval"
    }
}
struct PunchInResponse: Decodable {
    let sessionId: Int
    enum CodingKeys: String, CodingKey { case sessionId }
}

// MARK: - Project / Task Models

struct ProjectItem: Decodable, Identifiable, Hashable {
    let id:            Int
    let name:          String
    let description:   String
    let color:         String
    let taskCount:     Int
    enum CodingKeys: String, CodingKey {
        case id, name, description, color
        case taskCount = "task_count"
    }
}

struct TaskItem: Decodable, Identifiable, Hashable {
    let id:              Int
    let projectId:       Int
    let name:            String
    let description:     String
    let status:          String          // todo | in_progress | done
    let projectName:     String
    let projectColor:    String
    let assignedToName:  String?
    enum CodingKeys: String, CodingKey {
        case id, name, description, status
        case projectId      = "project_id"
        case projectName    = "project_name"
        case projectColor   = "project_color"
        case assignedToName = "assigned_to_name"
    }
}

// MARK: - Reports / Activity Models

struct ActivitySummaryItem: Decodable, Identifiable {
    var id: String { appName }
    let appName:      String
    let totalSeconds: Int
    enum CodingKeys: String, CodingKey {
        case appName = "app_name", totalSeconds = "total_seconds"
    }
}

struct ActivityLogItem: Decodable, Identifiable {
    let id:              Int
    let appName:         String
    let windowTitle:     String
    let startTime:       String
    let endTime:         String
    let durationSeconds: Int
    enum CodingKeys: String, CodingKey {
        case id
        case appName         = "app_name"
        case windowTitle     = "window_title"
        case startTime       = "start_time"
        case endTime         = "end_time"
        case durationSeconds = "duration_seconds"
    }
}

struct SessionItem: Decodable, Identifiable {
    let id:           Int
    let punchIn:      String
    let punchOut:     String?
    let totalMinutes: Int
    let status:       String
    let date:         String
    enum CodingKeys: String, CodingKey {
        case id
        case punchIn      = "punch_in"
        case punchOut     = "punch_out"
        case totalMinutes = "total_minutes"
        case status, date
    }
}

// MARK: - APIService

class APIService: ObservableObject {
    static let shared = APIService()

    private(set) var token: String?
    private(set) var employee: EmployeeInfo?

    // Restore saved session from Keychain on launch
    init() {
        token    = Keychain.load(key: "auth_token")
        if let empJson = Keychain.load(key: "employee_info"),
           let emp = try? JSONDecoder().decode(EmployeeInfo.self, from: Data(empJson.utf8)) {
            employee = emp
        }
    }

    // MARK: - Auth

    func login(email: String, password: String) async throws -> EmployeeInfo {
        let body = ["email": email, "password": password]
        let resp: LoginResponse
        do {
            resp = try await post("/auth/login", body: body, auth: false)
        } catch APIError.unauthorized {
            throw APIError.loginFailed
        }
        self.token    = resp.token
        self.employee = resp.employee
        // Persist so next launch auto-restores
        Keychain.save(resp.token, key: "auth_token")
        if let data = try? JSONEncoder().encode(resp.employee),
           let str  = String(data: data, encoding: .utf8) {
            Keychain.save(str, key: "employee_info")
        }
        return resp.employee
    }

    func logout() {
        token    = nil
        employee = nil
        Keychain.delete(key: "auth_token")
        Keychain.delete(key: "employee_info")
    }

    // MARK: - Sessions

    func punchIn(taskId: Int? = nil) async throws -> Int {
        guard let token else { throw APIError.unauthorized }
        guard let url = URL(string: "\(API_BASE)/sessions/punch-in") else { throw APIError.badURL }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        var bodyDict: [String: Any] = [:]
        if let tid = taskId { bodyDict["taskId"] = tid }
        req.httpBody = try JSONSerialization.data(withJSONObject: bodyDict)

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.noResponse }
        if http.statusCode == 401 { throw APIError.unauthorized }

        // 409 = already have an active session → resume it instead of erroring
        if http.statusCode == 409 {
            struct ExistingSession: Decodable { let sessionId: Int }
            if let existing = try? JSONDecoder().decode(ExistingSession.self, from: data) {
                return existing.sessionId
            }
        }

        guard (200...299).contains(http.statusCode) else {
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
                ?? "HTTP \(http.statusCode)"
            throw APIError.server(msg)
        }
        return try JSONDecoder().decode(PunchInResponse.self, from: data).sessionId
    }

    func punchOut(sessionId: Int, totalMinutes: Int) async throws {
        let body = ["totalMinutes": totalMinutes] as [String: Any]
        try await put("/sessions/\(sessionId)/punch-out", body: body)
    }

    func heartbeat(sessionId: Int, totalMinutes: Int) async throws {
        let body = ["totalMinutes": totalMinutes] as [String: Any]
        try await put("/sessions/\(sessionId)/heartbeat", body: body)
    }

    // MARK: - Activity

    func logActivity(sessionId: Int, appName: String, windowTitle: String,
                     startTime: Date, endTime: Date, durationSeconds: Int) async throws {
        let body: [String: Any] = [
            "sessionId":       sessionId,
            "appName":         appName,
            "windowTitle":     windowTitle,
            "startTime":       iso(startTime),
            "endTime":         iso(endTime),
            "durationSeconds": durationSeconds,
        ]
        try await post("/activity", body: body)
    }

    func logIdle(sessionId: Int, idleStart: Date, idleEnd: Date) async throws {
        let body: [String: Any] = [
            "sessionId":       sessionId,
            "idleStart":       iso(idleStart),
            "idleEnd":         iso(idleEnd),
            "durationSeconds": Int(idleEnd.timeIntervalSince(idleStart)),
        ]
        try await post("/activity/idle", body: body)
    }

    // MARK: - Reports & Manual Entry

    func getMyActivitySummary(date: String) async throws -> [ActivitySummaryItem] {
        try await get("/activity/mine/summary?date=\(date)")
    }

    func getMyActivity(date: String) async throws -> [ActivityLogItem] {
        try await get("/activity/mine?date=\(date)")
    }

    func getMySessions(date: String) async throws -> [SessionItem] {
        try await get("/sessions/my?date=\(date)")
    }

    func createManualEntry(date: String, startTime: String, endTime: String, note: String) async throws {
        let body: [String: Any] = ["date": date, "startTime": startTime, "endTime": endTime, "note": note]
        try await post("/sessions/manual", body: body)
    }

    // MARK: - Screenshots

    func uploadScreenshot(_ imageData: Data, sessionId: Int, activityLevel: Int) async throws -> String {
        guard let token else { throw APIError.unauthorized }
        guard let url = URL(string: "\(API_BASE)/screenshots") else { throw APIError.badURL }

        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()

        func append(_ s: String) { body.append(Data(s.utf8)) }

        // screenshot field
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"screenshot\"; filename=\"screenshot.jpg\"\r\n")
        append("Content-Type: image/jpeg\r\n\r\n")
        body.append(imageData)
        append("\r\n")

        // sessionId field
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"sessionId\"\r\n\r\n")
        append("\(sessionId)\r\n")

        // activityLevel field
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"activityLevel\"\r\n\r\n")
        append("\(activityLevel)\r\n")

        append("--\(boundary)--\r\n")

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.httpBody = body

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? "Upload failed"
            throw APIError.server(msg)
        }

        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return json?["url"] as? String ?? ""
    }

    // MARK: - Projects & Tasks

    func getProjects() async throws -> [ProjectItem] {
        try await get("/projects")
    }

    func getMyTasks() async throws -> [TaskItem] {
        try await get("/projects/tasks/mine")
    }

    func createProject(name: String, description: String, color: String) async throws -> ProjectItem {
        let body: [String: Any] = ["name": name, "description": description, "color": color]
        return try await post("/projects", body: body)
    }

    func createTask(projectId: Int, name: String, description: String) async throws -> TaskItem {
        let body: [String: Any] = ["name": name, "description": description]
        return try await post("/projects/\(projectId)/tasks", body: body)
    }

    func updateTaskStatus(taskId: Int, status: String) async throws {
        let body: [String: Any] = ["status": status]
        try await put("/projects/tasks/\(taskId)", body: body)
    }

    // MARK: - Helpers

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let req = try makeRequest("GET", path: path)
        return try await send(req)
    }

    @discardableResult
    private func post<T: Decodable>(_ path: String, body: [String: Any], auth: Bool = true) async throws -> T {
        var req = try makeRequest("POST", path: path, auth: auth)
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await send(req)
    }

    @discardableResult
    private func post(_ path: String, body: [String: Any]) async throws -> Void {
        var req = try makeRequest("POST", path: path)
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let _: [String: Bool] = try await send(req)
    }

    private func put(_ path: String, body: [String: Any]) async throws {
        var req = try makeRequest("PUT", path: path)
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let _: [String: Bool] = try await send(req)
    }

    private func makeRequest(_ method: String, path: String, auth: Bool = true) throws -> URLRequest {
        guard let url = URL(string: "\(API_BASE)\(path)") else { throw APIError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if auth, let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        return req
    }

    private func send<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.noResponse }
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard (200...299).contains(http.statusCode) else {
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"] ?? "HTTP \(http.statusCode)"
            throw APIError.server(msg)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func iso(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }
}

enum APIError: LocalizedError {
    case badURL, noResponse, unauthorized, loginFailed, server(String)
    var errorDescription: String? {
        switch self {
        case .badURL:           return "Invalid API URL"
        case .noResponse:       return "No response from server"
        case .unauthorized:     return "Session expired. Please log in again."
        case .loginFailed:      return "Invalid email or password. Please try again."
        case .server(let msg):  return msg
        }
    }
}
