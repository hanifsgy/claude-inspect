import UIKit

protocol HomeRoutingLogic: AnyObject {
    func routeToNotifications()
    func routeToRecentOutputs()
    func routeToCreate()
    func routeToBottomDestination(_ destination: Home.Destination)
}

final class HomeRouter: HomeRoutingLogic {

    weak var viewController: UIViewController?

    func routeToNotifications() {
        announce(message: "Notifications tapped")
    }

    func routeToRecentOutputs() {
        announce(message: "View all recent outputs tapped")
    }

    func routeToCreate() {
        announce(message: "Create tapped")
    }

    func routeToBottomDestination(_ destination: Home.Destination) {
        switch destination {
        case .commands:
            routeToCommands()
        case .chats:
            announce(message: "Already on Chats")
        case .analytics, .profile:
            announce(message: "Selected \(destination.rawValue.capitalized)")
        }
    }
}

private extension HomeRouter {
    func routeToCommands() {
        guard let viewController else { return }
        guard !(viewController.presentedViewController is CommandViewController) else { return }

        let commandViewController = CommandViewController()
        commandViewController.modalPresentationStyle = .fullScreen
        viewController.present(commandViewController, animated: true)
    }

    func announce(message: String) {
        guard let viewController else { return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        viewController.present(alert, animated: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            alert.dismiss(animated: true)
        }
    }
}
