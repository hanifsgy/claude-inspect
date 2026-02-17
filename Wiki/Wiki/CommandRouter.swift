import UIKit

protocol CommandRoutingLogic: AnyObject {
    func routeToBottomDestination(_ destination: Home.Destination)
    func routeToClearAll()
}

final class CommandRouter: CommandRoutingLogic {

    weak var viewController: UIViewController?

    func routeToBottomDestination(_ destination: Home.Destination) {
        switch destination {
        case .chats:
            viewController?.dismiss(animated: true)
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
    func announce(message: String) {
        guard let viewController else { return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        viewController.present(alert, animated: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            alert.dismiss(animated: true)
        }
    }
}
