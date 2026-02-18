import UIKit

final class MainTabBarController: UITabBarController {

    override func viewDidLoad() {
        super.viewDidLoad()
        configureAppearance()
        configureTabs()
        configureAccessibility()
    }
}

private extension MainTabBarController {
    func configureAppearance() {
        tabBar.isTranslucent = false
    }

    func configureTabs() {
        let chatsViewController = ViewController(showsBottomNav: false)
        chatsViewController.tabBarItem = UITabBarItem(
            title: "Chats",
            image: UIImage(systemName: "bubble.left.and.bubble.right"),
            selectedImage: UIImage(systemName: "bubble.left.and.bubble.right.fill")
        )
        chatsViewController.tabBarItem.accessibilityIdentifier = "main.tab.chats"

        let commandViewController = CommandViewController(showsBottomNav: false)
        commandViewController.tabBarItem = UITabBarItem(
            title: "Commands",
            image: UIImage(systemName: "terminal"),
            selectedImage: UIImage(systemName: "terminal")
        )
        commandViewController.tabBarItem.accessibilityIdentifier = "main.tab.commands"

        let analyticsViewController = TabPlaceholderViewController(titleText: "Analytics")
        analyticsViewController.tabBarItem = UITabBarItem(
            title: "Analytics",
            image: UIImage(systemName: "chart.line.uptrend.xyaxis"),
            selectedImage: UIImage(systemName: "chart.line.uptrend.xyaxis")
        )
        analyticsViewController.tabBarItem.accessibilityIdentifier = "main.tab.analytics"

        let profileViewController = TabPlaceholderViewController(titleText: "Profile")
        profileViewController.tabBarItem = UITabBarItem(
            title: "Profile",
            image: UIImage(systemName: "person.crop.circle"),
            selectedImage: UIImage(systemName: "person.crop.circle.fill")
        )
        profileViewController.tabBarItem.accessibilityIdentifier = "main.tab.profile"

        viewControllers = [
            chatsViewController,
            commandViewController,
            analyticsViewController,
            profileViewController
        ]
    }

    func configureAccessibility() {
        tabBar.accessibilityIdentifier = "main.tabbar"
    }
}

final class TabPlaceholderViewController: UIViewController {

    private let titleText: String
    private let titleLabel = UILabel()

    init(titleText: String) {
        self.titleText = titleText
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureView()
        configureLayout()
        configureAccessibility()
    }
}

private extension TabPlaceholderViewController {
    func configureView() {
        view.backgroundColor = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.1, green: 0.11, blue: 0.12, alpha: 1) : .white }
        titleLabel.text = titleText
        titleLabel.textColor = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.95, green: 0.96, blue: 0.97, alpha: 1) : UIColor(red: 0.12, green: 0.12, blue: 0.14, alpha: 1) }
        titleLabel.font = UIFont.systemFont(ofSize: 24, weight: .bold)
        titleLabel.textAlignment = .center
        view.addSubview(titleLabel)
    }

    func configureLayout() {
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            titleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            titleLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }

    func configureAccessibility() {
        view.accessibilityIdentifier = "tab.placeholder.\(titleText.lowercased())"
        titleLabel.accessibilityIdentifier = "tab.placeholder.\(titleText.lowercased()).title"
        titleLabel.accessibilityTraits = .header
    }
}
