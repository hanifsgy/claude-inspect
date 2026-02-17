import Foundation

enum Home {
    struct RecentOutput {
        let type: String
        let title: String
        let generatedText: String
    }

    struct Thread {
        let name: String
        let message: String
        let timeText: String
        let isOnline: Bool
        let isBot: Bool
    }

    enum Destination: String {
        case chats
        case commands
        case analytics
        case profile
    }

    enum Load {
        struct Request { }

        struct Response {
            let title: String
            let recentOutputs: [RecentOutput]
            let threads: [Thread]
            let selectedDestination: Destination
        }

        struct ViewModel {
            let title: String
            let recentOutputs: [RecentOutput]
            let threads: [Thread]
            let selectedDestination: Destination
        }
    }
}
