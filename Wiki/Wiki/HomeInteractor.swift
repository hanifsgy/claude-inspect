import Foundation

protocol HomeBusinessLogic: AnyObject {
    func loadHome(request: Home.Load.Request)
}

final class HomeInteractor: HomeBusinessLogic {

    var presenter: HomePresentationLogic?

    func loadHome(request: Home.Load.Request) {
        let response = Home.Load.Response(
            title: "Terminal",
            recentOutputs: [
                Home.RecentOutput(type: "CHART", title: "Q3 Revenue Projection", generatedText: "Generated 2m ago"),
                Home.RecentOutput(type: "PDF", title: "Marketing Strategy 2025", generatedText: "Generated 1h ago"),
                Home.RecentOutput(type: "DECK", title: "Investor Update Deck", generatedText: "Generated 4h ago")
            ],
            threads: [
                Home.Thread(name: "Sarah Chen", message: "Can you run the analysis on the new dataset?", timeText: "10:42 AM", isOnline: true, isBot: false),
                Home.Thread(name: "Data Bot", message: "Chart generated successfully.", timeText: "09:15 AM", isOnline: false, isBot: true),
                Home.Thread(name: "Marcus Johnson", message: "I've attached the Q2 report for review.", timeText: "Yesterday", isOnline: false, isBot: false),
                Home.Thread(name: "Elena Rodriguez", message: "Thanks for the update!", timeText: "Yesterday", isOnline: false, isBot: false)
            ],
            selectedDestination: .chats
        )
        presenter?.presentHome(response: response)
    }
}
