import Foundation
import FamilyControls
import ManagedSettings
import DeviceActivity

@available(iOS 16.0, *)
final class DailyDisciplineFocusShield: ObservableObject {
    static let shared = DailyDisciplineFocusShield()

    private let store = ManagedSettingsStore()
    @Published private(set) var authorized = false

    func requestAuthorization() async throws {
        // I kept this native implementation separate from the Expo app until the
        // project moves to a custom dev client. It is the real Screen Time path:
        // request FamilyControls permission, pick apps/categories, then shield
        // those apps during a strict focus session.
        try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
        await MainActor.run {
            self.authorized = AuthorizationCenter.shared.authorizationStatus == .approved
        }
    }

    func startStrictShield(selection: FamilyActivitySelection) {
        store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty ? nil : ShieldSettings.ActivityCategoryPolicy.specific(selection.categoryTokens)
        store.dateAndTime.requireAutomaticDateAndTime = true
    }

    func stopStrictShield() {
        store.clearAllSettings()
    }
}
