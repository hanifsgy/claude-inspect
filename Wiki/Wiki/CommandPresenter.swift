import Foundation

protocol CommandPresentationLogic: AnyObject {
    func presentCommand(response: Command.Load.Response)
}

protocol CommandDisplayLogic: AnyObject {
    func displayCommand(viewModel: Command.Load.ViewModel)
}

final class CommandPresenter: CommandPresentationLogic {

    weak var viewController: CommandDisplayLogic?

    func presentCommand(response: Command.Load.Response) {
        let viewModel = Command.Load.ViewModel(
            title: response.title,
            searchPlaceholder: response.searchPlaceholder,
            filters: response.filters,
            selectedFilter: response.selectedFilter,
            libraryItems: response.libraryItems,
            executionLogs: response.executionLogs,
            selectedDestination: response.selectedDestination
        )
        viewController?.displayCommand(viewModel: viewModel)
    }
}
