import Foundation

protocol CommandBusinessLogic: AnyObject {
    func loadCommand(request: Command.Load.Request)
}

final class CommandInteractor: CommandBusinessLogic {

    var presenter: CommandPresentationLogic?

    func loadCommand(request: Command.Load.Request) {
        let response = Command.Load.Response(
            title: "Command Center",
            searchPlaceholder: "Search commands (e.g. /chart)...",
            filters: [
                Command.Filter(title: "ALL COMMANDS", category: .all),
                Command.Filter(title: "VISUALIZATION", category: .visualization),
                Command.Filter(title: "DOCUMENTS", category: .documents),
                Command.Filter(title: "ANALYSIS", category: .analysis)
            ],
            selectedFilter: .all,
            libraryItems: [
                Command.LibraryItem(
                    systemImageName: "chart.xyaxis.line",
                    commandName: "/generate-chart",
                    description: "Transforms raw database queries into interactive visualizations (Line, Bar, Pie, Scatter).",
                    showsInfo: true
                ),
                Command.LibraryItem(
                    systemImageName: "doc.text",
                    commandName: "/summarize-pdf",
                    description: "Extract key insights and data points from uploaded PDF documents into a concise brief.",
                    showsInfo: false
                ),
                Command.LibraryItem(
                    systemImageName: "rectangle.on.rectangle.angled",
                    commandName: "/create-deck",
                    description: "Generates a multi-slide presentation deck based on chat context or provided datasets.",
                    showsInfo: false
                )
            ],
            executionLogs: [
                Command.ExecutionLog(
                    timestamp: "14:02:45",
                    status: .success,
                    fileName: "Q3_Revenue_Comparison.png",
                    metadata: "2.4 MB \u{00B7} PNG \u{00B7} /generate-chart",
                    actions: [.download, .link],
                    isActive: true
                ),
                Command.ExecutionLog(
                    timestamp: "09:15:20",
                    status: .success,
                    fileName: "Project_Alpha_Summary.pdf",
                    metadata: "15.8 MB \u{00B7} PDF \u{00B7} /summarize-pdf",
                    actions: [.download],
                    isActive: false
                )
            ],
            selectedDestination: .commands
        )
        presenter?.presentCommand(response: response)
    }
}
