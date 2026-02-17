import Foundation

enum CommandConfigurator {
    static func configure(viewController: CommandViewController) {
        let interactor = CommandInteractor()
        let presenter = CommandPresenter()
        let router = CommandRouter()

        viewController.interactor = interactor
        viewController.router = router

        interactor.presenter = presenter
        presenter.viewController = viewController
        router.viewController = viewController
    }
}
