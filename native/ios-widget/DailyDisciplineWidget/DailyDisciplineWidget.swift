import WidgetKit
import SwiftUI

struct DisciplineWidgetSummary: Decodable {
    let date: String
    let completed: Int
    let total: Int
    let open: Int
    let progressPercent: Int
    let nextTaskTitle: String
    let nextTaskTime: String?
    let lockScreenLine: String
    let smallWidgetLine: String
    let largeWidgetLines: [String]
}

struct DisciplineEntry: TimelineEntry {
    let date: Date
    let summary: DisciplineWidgetSummary
}

struct DisciplineProvider: TimelineProvider {
    private let appGroup = "group.com.haroonzaman.dailydiscipline"
    private let summaryKey = "dailyDisciplineWidgetSummary"

    func placeholder(in context: Context) -> DisciplineEntry {
        DisciplineEntry(date: Date(), summary: fallbackSummary)
    }

    func getSnapshot(in context: Context, completion: @escaping (DisciplineEntry) -> Void) {
        completion(DisciplineEntry(date: Date(), summary: readSummary()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DisciplineEntry>) -> Void) {
        let entry = DisciplineEntry(date: Date(), summary: readSummary())
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }

    private func readSummary() -> DisciplineWidgetSummary {
        // I read one compact JSON blob from the App Group instead of querying
        // Firestore from the widget. That keeps the widget fast and battery-safe.
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let raw = defaults.string(forKey: summaryKey),
            let data = raw.data(using: .utf8),
            let summary = try? JSONDecoder().decode(DisciplineWidgetSummary.self, from: data)
        else {
            return fallbackSummary
        }
        return summary
    }

    private var fallbackSummary: DisciplineWidgetSummary {
        DisciplineWidgetSummary(
            date: "Today",
            completed: 0,
            total: 0,
            open: 0,
            progressPercent: 0,
            nextTaskTitle: "Open Daily Discipline",
            nextTaskTime: nil,
            lockScreenLine: "Plan the next honest task",
            smallWidgetLine: "No task snapshot yet",
            largeWidgetLines: ["Open the app once", "Your next task will appear here", "Keep the day honest"]
        )
    }
}

struct DailyDisciplineWidgetView: View {
    var entry: DisciplineProvider.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Daily Discipline")
                    .font(.caption2)
                    .fontWeight(.black)
                    .textCase(.uppercase)
                Spacer()
                Text("\(entry.summary.progressPercent)%")
                    .font(.headline)
                    .fontWeight(.black)
            }

            Text(entry.summary.nextTaskTitle)
                .font(.headline)
                .fontWeight(.bold)
                .lineLimit(2)

            Text(entry.summary.nextTaskTime ?? entry.summary.lockScreenLine)
                .font(.caption)
                .foregroundStyle(.secondary)

            Spacer(minLength: 2)

            Text("\(entry.summary.completed)/\(entry.summary.total) done")
                .font(.caption)
                .fontWeight(.semibold)
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

struct DailyDisciplineWidget: Widget {
    let kind: String = "DailyDisciplineWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DisciplineProvider()) { entry in
            DailyDisciplineWidgetView(entry: entry)
        }
        .configurationDisplayName("Daily Discipline")
        .description("See your next task, completion progress, and lock-screen discipline cue.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}
