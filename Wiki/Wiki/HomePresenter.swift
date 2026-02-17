import Foundation

protocol HomePresentationLogic: AnyObject {
    func presentHome(response: Home.Load.Response)
}

protocol HomeDisplayLogic: AnyObject {
    func displayHome(viewModel: Home.Load.ViewModel)
}

final class HomePresenter: HomePresentationLogic {

    weak var viewController: HomeDisplayLogic?

    func presentHome(response: Home.Load.Response) {
        let viewModel = Home.Load.ViewModel(
            title: response.title,
            recentOutputs: response.recentOutputs,
            threads: response.threads,
            selectedDestination: response.selectedDestination
        )
        viewController?.displayHome(viewModel: viewModel)
    }
}
