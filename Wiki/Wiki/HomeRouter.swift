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
        if let tabBarController = viewController?.tabBarController {
            tabBarController.selectedIndex = tabIndex(for: destination)
            return
        }

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
    func tabIndex(for destination: Home.Destination) -> Int {
        switch destination {
        case .chats: return 0
        case .commands: return 1
        case .analytics: return 2
        case .profile: return 3
        }
    }

    func routeToCommands() {
        guard let viewController else { return }
        guard !(viewController is CommandViewController) else { return }

        switchRoot(to: CommandViewController())
    }

    func switchRoot(to nextViewController: UIViewController) {
        guard let currentViewController = viewController else { return }
        guard let window = currentViewController.view.window else { return }
        guard type(of: window.rootViewController) != type(of: nextViewController) else { return }

        UIView.transition(with: window, duration: 0.2, options: .transitionCrossDissolve) {
            window.rootViewController = nextViewController
        }
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
