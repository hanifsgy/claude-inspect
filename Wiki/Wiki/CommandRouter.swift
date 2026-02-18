import UIKit

protocol CommandRoutingLogic: AnyObject {
    func routeToBottomDestination(_ destination: Home.Destination)
    func routeToClearAll()
}

final class CommandRouter: CommandRoutingLogic {

    weak var viewController: UIViewController?

    func routeToBottomDestination(_ destination: Home.Destination) {
        if let tabBarController = viewController?.tabBarController {
            tabBarController.selectedIndex = tabIndex(for: destination)
            return
        }

        switch destination {
        case .chats:
            routeToChats()
        case .commands:
            break
        case .analytics, .profile:
            announce(message: "Selected \(destination.rawValue.capitalized)")
        }
    }

    func routeToClearAll() {
        announce(message: "Execution log cleared")
    }
}

private extension CommandRouter {
    func tabIndex(for destination: Home.Destination) -> Int {
        switch destination {
        case .chats: return 0
        case .commands: return 1
        case .analytics: return 2
        case .profile: return 3
        }
    }

    func routeToChats() {
        guard let viewController else { return }
        guard !(viewController is ViewController) else { return }
        switchRoot(to: ViewController())
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
