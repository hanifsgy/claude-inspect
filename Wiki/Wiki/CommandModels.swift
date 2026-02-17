import Foundation

enum Command {
    enum Category: String {
        case all
        case visualization
        case documents
        case analysis
    }

    struct Filter {
        let title: String
        let category: Category
    }

    struct LibraryItem {
        let systemImageName: String
        let commandName: String
        let description: String
        let showsInfo: Bool
    }

    enum ExecutionStatus: String {
        case success = "Success"
    }

    enum ExecutionAction: String {
        case download
        case link
    }

    struct ExecutionLog {
        let timestamp: String
        let status: ExecutionStatus
        let fileName: String
        let metadata: String
        let actions: [ExecutionAction]
        let isActive: Bool
    }

    enum Load {
        struct Request { }

        struct Response {
            let title: String
            let searchPlaceholder: String
            let filters: [Filter]
            let selectedFilter: Category
            let libraryItems: [LibraryItem]
            let executionLogs: [ExecutionLog]
            let selectedDestination: Home.Destination
        }

        struct ViewModel {
            let title: String
            let searchPlaceholder: String
            let filters: [Filter]
            let selectedFilter: Category
            let libraryItems: [LibraryItem]
            let executionLogs: [ExecutionLog]
            let selectedDestination: Home.Destination
        }
    }
}
