import UIKit

final class CommandViewController: UIViewController, CommandDisplayLogic {

    var interactor: CommandBusinessLogic?
    var router: CommandRoutingLogic?

    private let showsBottomNav: Bool
    private lazy var contentView = CommandContentView(showsBottomNav: showsBottomNav)

    init(showsBottomNav: Bool = true) {
        self.showsBottomNav = showsBottomNav
        super.init(nibName: nil, bundle: nil)
        CommandConfigurator.configure(viewController: self)
    }

    required init?(coder: NSCoder) {
        self.showsBottomNav = true
        super.init(coder: coder)
        CommandConfigurator.configure(viewController: self)
    }

    override func loadView() {
        view = contentView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        bindActions()
        interactor?.loadCommand(request: Command.Load.Request())
    }

    func displayCommand(viewModel: Command.Load.ViewModel) {
        contentView.apply(viewModel: viewModel)
    }
}

private extension CommandViewController {
    func bindActions() {
        contentView.onBottomNavTap = { [weak self] destination in
            self?.router?.routeToBottomDestination(destination)
        }
        contentView.onClearAllTap = { [weak self] in
            self?.router?.routeToClearAll()
        }
    }
}
