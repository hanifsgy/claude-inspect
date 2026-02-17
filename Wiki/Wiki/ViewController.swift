//
//  ViewController.swift
//  Wiki
//
//  Created by Muhammad Hanif Sugiyanto on 17/02/26.
//

import UIKit

final class ViewController: UIViewController, HomeDisplayLogic {

    var interactor: HomeBusinessLogic?
    var router: HomeRoutingLogic?

    private let contentView = HomeContentView()

    init() {
        super.init(nibName: nil, bundle: nil)
        HomeConfigurator.configure(viewController: self)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        HomeConfigurator.configure(viewController: self)
    }

    override func loadView() {
        view = contentView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        bindActions()
        interactor?.loadHome(request: Home.Load.Request())
    }

    func displayHome(viewModel: Home.Load.ViewModel) {
        contentView.apply(viewModel: viewModel)
    }
}

private extension ViewController {
    func bindActions() {
        contentView.onNotificationTap = { [weak self] in
            self?.router?.routeToNotifications()
        }
        contentView.onViewAllTap = { [weak self] in
            self?.router?.routeToRecentOutputs()
        }
        contentView.onCreateTap = { [weak self] in
            self?.router?.routeToCreate()
        }
        contentView.onBottomNavTap = { [weak self] destination in
            self?.router?.routeToBottomDestination(destination)
        }
    }
}
