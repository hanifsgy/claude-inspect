import UIKit

final class HomeContentView: UIView {

    var onNotificationTap: (() -> Void)?
    var onViewAllTap: (() -> Void)?
    var onCreateTap: (() -> Void)?
    var onBottomNavTap: ((Home.Destination) -> Void)?

    private let theme = HomeTheme()

    private let headerView = HomeHeaderView()
    private let scrollView = UIScrollView()
    private let contentStack = UIStackView()

    private let searchView = HomeSearchView()

    private let recentTitleLabel = UILabel()
    private let viewAllButton = UIButton(type: .system)
    private let recentHeaderStack = UIStackView()
    private let recentScrollView = UIScrollView()
    private let recentCardsStack = UIStackView()

    private let threadsTitleLabel = UILabel()
    private let threadsStack = UIStackView()

    private let createButton = UIButton(type: .system)
    private let bottomNavView = HomeBottomNavView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        configureViewHierarchy()
        configureStyle()
        configureLayout()
        configureActions()
        configureAccessibility()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func apply(viewModel: Home.Load.ViewModel) {
        headerView.setTitle(viewModel.title)
        renderRecentOutputs(viewModel.recentOutputs)
        renderThreads(viewModel.threads)
        bottomNavView.select(destination: viewModel.selectedDestination)
    }
}

private extension HomeContentView {
    func configureViewHierarchy() {
        addSubview(headerView)

        addSubview(scrollView)
        scrollView.addSubview(contentStack)

        contentStack.addArrangedSubview(searchView)

        contentStack.addArrangedSubview(recentHeaderStack)
        recentHeaderStack.addArrangedSubview(recentTitleLabel)
        recentHeaderStack.addArrangedSubview(viewAllButton)

        contentStack.addArrangedSubview(recentScrollView)
        recentScrollView.addSubview(recentCardsStack)

        contentStack.addArrangedSubview(threadsTitleLabel)
        contentStack.addArrangedSubview(threadsStack)

        addSubview(createButton)
        addSubview(bottomNavView)
    }

    func configureStyle() {
        backgroundColor = theme.background

        scrollView.showsVerticalScrollIndicator = false

        contentStack.axis = .vertical
        contentStack.spacing = 16

        recentHeaderStack.axis = .horizontal
        recentHeaderStack.alignment = .center

        recentTitleLabel.text = "RECENT OUTPUTS"
        recentTitleLabel.font = UIFont.systemFont(ofSize: 12, weight: .bold)
        recentTitleLabel.textColor = theme.mutedForeground

        viewAllButton.setTitle("View All >", for: .normal)
        viewAllButton.titleLabel?.font = UIFont.systemFont(ofSize: 12, weight: .semibold)
        viewAllButton.setTitleColor(theme.primary, for: .normal)

        recentScrollView.showsHorizontalScrollIndicator = false
        recentCardsStack.axis = .horizontal
        recentCardsStack.spacing = 12

        threadsTitleLabel.text = "ACTIVE THREADS"
        threadsTitleLabel.font = UIFont.systemFont(ofSize: 12, weight: .bold)
        threadsTitleLabel.textColor = theme.mutedForeground

        threadsStack.axis = .vertical
        threadsStack.spacing = 0
        threadsStack.layer.borderWidth = 1
        threadsStack.layer.borderColor = theme.border.cgColor

        createButton.setImage(UIImage(systemName: "plus"), for: .normal)
        createButton.tintColor = theme.primaryForeground
        createButton.backgroundColor = theme.primary
        createButton.layer.cornerRadius = 28
        createButton.layer.shadowColor = UIColor.black.cgColor
        createButton.layer.shadowOpacity = 0.18
        createButton.layer.shadowRadius = 8
        createButton.layer.shadowOffset = CGSize(width: 0, height: 4)
    }

    func configureLayout() {
        [headerView, scrollView, contentStack, recentScrollView, recentCardsStack, createButton, bottomNavView].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
        }

        NSLayoutConstraint.activate([
            headerView.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor),
            headerView.leadingAnchor.constraint(equalTo: leadingAnchor),
            headerView.trailingAnchor.constraint(equalTo: trailingAnchor),
            headerView.heightAnchor.constraint(equalToConstant: 64),

            bottomNavView.leadingAnchor.constraint(equalTo: leadingAnchor),
            bottomNavView.trailingAnchor.constraint(equalTo: trailingAnchor),
            bottomNavView.bottomAnchor.constraint(equalTo: bottomAnchor),
            bottomNavView.heightAnchor.constraint(equalToConstant: 88),

            createButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -18),
            createButton.bottomAnchor.constraint(equalTo: bottomNavView.topAnchor, constant: -14),
            createButton.widthAnchor.constraint(equalToConstant: 56),
            createButton.heightAnchor.constraint(equalToConstant: 56),

            scrollView.topAnchor.constraint(equalTo: headerView.bottomAnchor),
            scrollView.leadingAnchor.constraint(equalTo: leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: bottomNavView.topAnchor),

            contentStack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 16),
            contentStack.leadingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.leadingAnchor, constant: 16),
            contentStack.trailingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.trailingAnchor, constant: -16),
            contentStack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -20),

            recentScrollView.heightAnchor.constraint(equalToConstant: 172),
            recentCardsStack.topAnchor.constraint(equalTo: recentScrollView.contentLayoutGuide.topAnchor),
            recentCardsStack.bottomAnchor.constraint(equalTo: recentScrollView.contentLayoutGuide.bottomAnchor),
            recentCardsStack.leadingAnchor.constraint(equalTo: recentScrollView.contentLayoutGuide.leadingAnchor),
            recentCardsStack.trailingAnchor.constraint(equalTo: recentScrollView.contentLayoutGuide.trailingAnchor),
            recentCardsStack.heightAnchor.constraint(equalTo: recentScrollView.frameLayoutGuide.heightAnchor)
        ])
    }

    func configureActions() {
        headerView.onNotificationTap = { [weak self] in self?.onNotificationTap?() }
        viewAllButton.addTarget(self, action: #selector(handleViewAll), for: .touchUpInside)
        createButton.addTarget(self, action: #selector(handleCreate), for: .touchUpInside)
        bottomNavView.onTap = { [weak self] destination in self?.onBottomNavTap?(destination) }
    }

    func configureAccessibility() {
        accessibilityIdentifier = "home.content"
        recentTitleLabel.accessibilityTraits = .header
        threadsTitleLabel.accessibilityTraits = .header

        viewAllButton.accessibilityIdentifier = "home.recent.viewAll"
        viewAllButton.accessibilityHint = "Shows all recent outputs"

        createButton.accessibilityIdentifier = "home.create"
        createButton.accessibilityLabel = "Create new"
        createButton.accessibilityHint = "Starts a new chat or command"
    }

    @objc func handleViewAll() {
        onViewAllTap?()
    }

    @objc func handleCreate() {
        onCreateTap?()
    }

    func renderRecentOutputs(_ outputs: [Home.RecentOutput]) {
        recentCardsStack.arrangedSubviews.forEach { view in
            recentCardsStack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }

        for output in outputs {
            let card = HomeRecentCardView()
            card.configure(type: output.type, title: output.title, generatedText: output.generatedText)
            recentCardsStack.addArrangedSubview(card)
        }
    }

    func renderThreads(_ threads: [Home.Thread]) {
        threadsStack.arrangedSubviews.forEach { view in
            threadsStack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }

        for (index, thread) in threads.enumerated() {
            let row = HomeThreadRowView()
            row.configure(thread: thread)
            threadsStack.addArrangedSubview(row)

            if index < threads.count - 1 {
                let divider = UIView()
                divider.backgroundColor = theme.border
                divider.translatesAutoresizingMaskIntoConstraints = false
                divider.heightAnchor.constraint(equalToConstant: 1).isActive = true
                divider.accessibilityIdentifier = "home.thread.divider.\(index)"
                threadsStack.addArrangedSubview(divider)
            }
        }
    }
}

final class HomeHeaderView: UIView {

    var onNotificationTap: (() -> Void)?

    private let theme = HomeTheme()
    private let logoView = UIView()
    private let logoImageView = UIImageView()
    private let titleLabel = UILabel()
    private let notificationButton = UIButton(type: .system)
    private let profileImageView = UIImageView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        configureViewHierarchy()
        configureStyle()
        configureLayout()
        configureAccessibility()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func setTitle(_ title: String) {
        titleLabel.text = title
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        profileImageView.layer.cornerRadius = profileImageView.bounds.width / 2
    }
}

private extension HomeHeaderView {
    func configureViewHierarchy() {
        addSubview(logoView)
        logoView.addSubview(logoImageView)
        addSubview(titleLabel)
        addSubview(notificationButton)
        addSubview(profileImageView)
    }

    func configureStyle() {
        backgroundColor = theme.background
        layer.borderWidth = 1
        layer.borderColor = theme.border.cgColor

        logoView.backgroundColor = theme.primary.withAlphaComponent(0.12)
        logoView.layer.cornerRadius = 8
        logoImageView.image = UIImage(systemName: "command")
        logoImageView.tintColor = theme.primary

        titleLabel.font = UIFont.systemFont(ofSize: 22, weight: .bold)
        titleLabel.textColor = theme.foreground

        notificationButton.setImage(UIImage(systemName: "bell.fill"), for: .normal)
        notificationButton.tintColor = theme.mutedForeground
        notificationButton.backgroundColor = theme.secondary
        notificationButton.layer.cornerRadius = 8
        notificationButton.addTarget(self, action: #selector(handleNotification), for: .touchUpInside)

        profileImageView.backgroundColor = theme.secondary
        profileImageView.image = UIImage(systemName: "person.crop.circle.fill")
        profileImageView.tintColor = theme.mutedForeground
        profileImageView.layer.borderWidth = 1
        profileImageView.layer.borderColor = theme.border.cgColor
        profileImageView.clipsToBounds = true
    }

    func configureLayout() {
        [logoView, logoImageView, titleLabel, notificationButton, profileImageView].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
        }

        NSLayoutConstraint.activate([
            logoView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            logoView.centerYAnchor.constraint(equalTo: centerYAnchor),
            logoView.widthAnchor.constraint(equalToConstant: 32),
            logoView.heightAnchor.constraint(equalToConstant: 32),

            logoImageView.centerXAnchor.constraint(equalTo: logoView.centerXAnchor),
            logoImageView.centerYAnchor.constraint(equalTo: logoView.centerYAnchor),
            logoImageView.widthAnchor.constraint(equalToConstant: 18),
            logoImageView.heightAnchor.constraint(equalToConstant: 18),

            titleLabel.leadingAnchor.constraint(equalTo: logoView.trailingAnchor, constant: 10),
            titleLabel.centerYAnchor.constraint(equalTo: centerYAnchor),

            profileImageView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            profileImageView.centerYAnchor.constraint(equalTo: centerYAnchor),
            profileImageView.widthAnchor.constraint(equalToConstant: 36),
            profileImageView.heightAnchor.constraint(equalToConstant: 36),

            notificationButton.trailingAnchor.constraint(equalTo: profileImageView.leadingAnchor, constant: -10),
            notificationButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            notificationButton.widthAnchor.constraint(equalToConstant: 36),
            notificationButton.heightAnchor.constraint(equalToConstant: 36)
        ])
    }

    func configureAccessibility() {
        accessibilityIdentifier = "home.header"
        isAccessibilityElement = false

        logoView.isAccessibilityElement = true
        logoView.accessibilityIdentifier = "home.header.logo"
        logoView.accessibilityLabel = "Terminal logo"

        titleLabel.isAccessibilityElement = true
        titleLabel.accessibilityIdentifier = "home.header.title"
        titleLabel.accessibilityTraits = .header

        notificationButton.accessibilityIdentifier = "home.header.notification"
        notificationButton.accessibilityLabel = "Notifications"
        notificationButton.accessibilityHint = "Opens latest alerts"

        profileImageView.isAccessibilityElement = true
        profileImageView.accessibilityIdentifier = "home.header.profile"
        profileImageView.accessibilityLabel = "Profile"
        profileImageView.accessibilityTraits = .image
    }

    @objc func handleNotification() {
        onNotificationTap?()
    }

}

final class HomeSearchView: UIView {

    private let theme = HomeTheme()
    private let iconView = UIImageView()
    private let textField = UITextField()
    private let shortcutStack = UIStackView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        configureViewHierarchy()
        configureStyle()
        configureLayout()
        configureAccessibility()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}

private extension HomeSearchView {
    func configureViewHierarchy() {
        addSubview(iconView)
        addSubview(textField)
        addSubview(shortcutStack)
        shortcutStack.addArrangedSubview(makeShortcutLabel(text: "CMD"))
        shortcutStack.addArrangedSubview(makeShortcutLabel(text: "K"))
    }

    func configureStyle() {
        backgroundColor = theme.input
        layer.borderWidth = 1
        layer.borderColor = theme.border.cgColor
        layer.cornerRadius = 10

        iconView.image = UIImage(systemName: "magnifyingglass")
        iconView.tintColor = theme.mutedForeground
        iconView.contentMode = .scaleAspectFit

        textField.placeholder = "Search commands, charts, or messages..."
        textField.borderStyle = .none
        textField.font = UIFont.systemFont(ofSize: 14)
        textField.textColor = theme.foreground
        textField.returnKeyType = .search

        shortcutStack.axis = .horizontal
        shortcutStack.spacing = 4
    }

    func configureLayout() {
        [iconView, textField, shortcutStack].forEach { $0.translatesAutoresizingMaskIntoConstraints = false }
        translatesAutoresizingMaskIntoConstraints = false
        heightAnchor.constraint(equalToConstant: 50).isActive = true

        NSLayoutConstraint.activate([
            iconView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            iconView.centerYAnchor.constraint(equalTo: centerYAnchor),
            iconView.widthAnchor.constraint(equalToConstant: 16),
            iconView.heightAnchor.constraint(equalToConstant: 16),

            shortcutStack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
            shortcutStack.centerYAnchor.constraint(equalTo: centerYAnchor),

            textField.leadingAnchor.constraint(equalTo: iconView.trailingAnchor, constant: 8),
            textField.trailingAnchor.constraint(equalTo: shortcutStack.leadingAnchor, constant: -8),
            textField.topAnchor.constraint(equalTo: topAnchor),
            textField.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
    }

    func configureAccessibility() {
        accessibilityIdentifier = "home.search.container"
        isAccessibilityElement = false

        textField.isAccessibilityElement = true
        textField.accessibilityIdentifier = "home.search.field"
        textField.accessibilityLabel = "Search"
        textField.accessibilityHint = "Search commands, charts, or messages"
    }

    func makeShortcutLabel(text: String) -> UILabel {
        let label = UILabel()
        label.text = text
        label.font = UIFont.monospacedSystemFont(ofSize: 10, weight: .semibold)
        label.textColor = theme.secondaryForeground
        label.backgroundColor = theme.secondary
        label.layer.borderWidth = 1
        label.layer.borderColor = theme.border.cgColor
        label.textAlignment = .center
        label.layer.cornerRadius = 4
        label.clipsToBounds = true
        label.translatesAutoresizingMaskIntoConstraints = false
        label.widthAnchor.constraint(greaterThanOrEqualToConstant: 24).isActive = true
        label.heightAnchor.constraint(equalToConstant: 16).isActive = true
        label.isAccessibilityElement = true
        label.accessibilityIdentifier = "home.search.shortcut.\(text.lowercased())"
        label.accessibilityLabel = "Keyboard shortcut \(text)"
        return label
    }
}

final class HomeRecentCardView: UIView {

    private let theme = HomeTheme()

    private let preview = UIView()
    private let typeLabel = UILabel()
    private let titleLabel = UILabel()
    private let generatedLabel = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        configureViewHierarchy()
        configureStyle()
        configureLayout()
        configureAccessibility()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(type: String, title: String, generatedText: String) {
        typeLabel.text = "  \(type)  "
        typeLabel.textColor = type == "PDF" ? theme.destructive : theme.primary
        titleLabel.text = title
        generatedLabel.text = generatedText
        accessibilityLabel = "\(title), \(type), \(generatedText)"
    }
}

private extension HomeRecentCardView {
    func configureViewHierarchy() {
        addSubview(preview)
        preview.addSubview(typeLabel)
        addSubview(titleLabel)
        addSubview(generatedLabel)
    }

    func configureStyle() {
        backgroundColor = theme.card
        layer.borderWidth = 1
        layer.borderColor = theme.border.cgColor
        translatesAutoresizingMaskIntoConstraints = false
        widthAnchor.constraint(equalToConstant: 256).isActive = true

        preview.backgroundColor = theme.muted

        typeLabel.font = UIFont.monospacedSystemFont(ofSize: 10, weight: .bold)
        typeLabel.backgroundColor = theme.background.withAlphaComponent(0.9)
        typeLabel.layer.borderWidth = 1
        typeLabel.layer.borderColor = theme.border.cgColor

        titleLabel.font = UIFont.systemFont(ofSize: 14, weight: .bold)
        titleLabel.textColor = theme.foreground

        generatedLabel.font = UIFont.monospacedSystemFont(ofSize: 11, weight: .regular)
        generatedLabel.textColor = theme.mutedForeground
    }

    func configureLayout() {
        [preview, typeLabel, titleLabel, generatedLabel].forEach { $0.translatesAutoresizingMaskIntoConstraints = false }

        NSLayoutConstraint.activate([
            preview.topAnchor.constraint(equalTo: topAnchor),
            preview.leadingAnchor.constraint(equalTo: leadingAnchor),
            preview.trailingAnchor.constraint(equalTo: trailingAnchor),
            preview.heightAnchor.constraint(equalToConstant: 106),

            typeLabel.topAnchor.constraint(equalTo: preview.topAnchor, constant: 8),
            typeLabel.trailingAnchor.constraint(equalTo: preview.trailingAnchor, constant: -8),
            typeLabel.heightAnchor.constraint(equalToConstant: 20),

            titleLabel.topAnchor.constraint(equalTo: preview.bottomAnchor, constant: 10),
            titleLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            titleLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),

            generatedLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 4),
            generatedLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            generatedLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
            generatedLabel.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -10)
        ])
    }

    func configureAccessibility() {
        accessibilityIdentifier = "home.recent.card"
        isAccessibilityElement = true
        accessibilityTraits = .button
    }
}

final class HomeThreadRowView: UIView {

    private let theme = HomeTheme()

    private let avatarView = UIView()
    private let avatarLabel = UILabel()
    private let statusDot = UIView()

    private let nameLabel = UILabel()
    private let timeLabel = UILabel()
    private let messageLabel = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        configureViewHierarchy()
        configureStyle()
        configureLayout()
        configureAccessibility()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(thread: Home.Thread) {
        avatarView.backgroundColor = thread.isBot ? theme.primary : theme.secondary
        avatarLabel.textColor = thread.isBot ? theme.primaryForeground : theme.foreground
        avatarLabel.text = thread.isBot ? "DB" : String(thread.name.prefix(1))

        nameLabel.text = thread.name
        timeLabel.text = thread.timeText
        messageLabel.text = thread.message
        messageLabel.textColor = thread.isBot ? theme.foreground : theme.mutedForeground
        messageLabel.font = UIFont.systemFont(ofSize: 14, weight: thread.isBot ? .medium : .regular)

        statusDot.isHidden = !thread.isOnline
        accessibilityLabel = "\(thread.name), \(thread.message), \(thread.timeText)"
    }
}

private extension HomeThreadRowView {
    func configureViewHierarchy() {
        addSubview(avatarView)
        avatarView.addSubview(avatarLabel)
        addSubview(statusDot)
        addSubview(nameLabel)
        addSubview(timeLabel)
        addSubview(messageLabel)
    }

    func configureStyle() {
        translatesAutoresizingMaskIntoConstraints = false
        heightAnchor.constraint(equalToConstant: 74).isActive = true

        avatarView.layer.borderWidth = 1
        avatarView.layer.borderColor = theme.border.cgColor
        avatarView.layer.cornerRadius = 20

        avatarLabel.textAlignment = .center
        avatarLabel.font = UIFont.systemFont(ofSize: 13, weight: .bold)

        statusDot.backgroundColor = .systemGreen
        statusDot.layer.cornerRadius = 5
        statusDot.layer.borderWidth = 1.5
        statusDot.layer.borderColor = UIColor.white.cgColor

        nameLabel.font = UIFont.systemFont(ofSize: 14, weight: .bold)
        nameLabel.textColor = theme.foreground

        timeLabel.font = UIFont.monospacedSystemFont(ofSize: 10, weight: .regular)
        timeLabel.textColor = theme.mutedForeground
        timeLabel.textAlignment = .right

        messageLabel.numberOfLines = 1
        messageLabel.lineBreakMode = .byTruncatingTail
    }

    func configureLayout() {
        [avatarView, avatarLabel, statusDot, nameLabel, timeLabel, messageLabel].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
        }

        NSLayoutConstraint.activate([
            avatarView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            avatarView.centerYAnchor.constraint(equalTo: centerYAnchor),
            avatarView.widthAnchor.constraint(equalToConstant: 40),
            avatarView.heightAnchor.constraint(equalToConstant: 40),

            avatarLabel.centerXAnchor.constraint(equalTo: avatarView.centerXAnchor),
            avatarLabel.centerYAnchor.constraint(equalTo: avatarView.centerYAnchor),

            statusDot.widthAnchor.constraint(equalToConstant: 10),
            statusDot.heightAnchor.constraint(equalToConstant: 10),
            statusDot.trailingAnchor.constraint(equalTo: avatarView.trailingAnchor, constant: 1),
            statusDot.bottomAnchor.constraint(equalTo: avatarView.bottomAnchor, constant: 1),

            nameLabel.topAnchor.constraint(equalTo: topAnchor, constant: 16),
            nameLabel.leadingAnchor.constraint(equalTo: avatarView.trailingAnchor, constant: 12),
            nameLabel.trailingAnchor.constraint(lessThanOrEqualTo: timeLabel.leadingAnchor, constant: -8),

            timeLabel.topAnchor.constraint(equalTo: topAnchor, constant: 16),
            timeLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            timeLabel.widthAnchor.constraint(equalToConstant: 80),

            messageLabel.topAnchor.constraint(equalTo: nameLabel.bottomAnchor, constant: 3),
            messageLabel.leadingAnchor.constraint(equalTo: avatarView.trailingAnchor, constant: 12),
            messageLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12)
        ])
    }

    func configureAccessibility() {
        accessibilityIdentifier = "home.thread.row"
        isAccessibilityElement = true
        accessibilityTraits = .button

        statusDot.isAccessibilityElement = true
        statusDot.accessibilityIdentifier = "home.thread.online"
        statusDot.accessibilityLabel = "Online"
    }
}

final class HomeBottomNavView: UIView {

    var onTap: ((Home.Destination) -> Void)?

    private let theme = HomeTheme()
    private let stack = UIStackView()
    private var buttons: [Home.Destination: UIButton] = [:]

    override init(frame: CGRect) {
        super.init(frame: frame)
        configureViewHierarchy()
        configureStyle()
        configureLayout()
        configureButtons()
        configureAccessibility()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func select(destination: Home.Destination) {
        for (item, button) in buttons {
            let isSelected = item == destination
            let color = isSelected ? theme.primary : theme.mutedForeground
            if var configuration = button.configuration {
                configuration.baseForegroundColor = color
                button.configuration = configuration
            } else {
                button.tintColor = color
                button.setTitleColor(color, for: .normal)
            }
            button.accessibilityTraits = isSelected ? [.button, .selected] : .button
        }
    }
}

private extension HomeBottomNavView {
    func configureViewHierarchy() {
        addSubview(stack)
    }

    func configureStyle() {
        backgroundColor = theme.background
        layer.borderWidth = 1
        layer.borderColor = theme.border.cgColor

        stack.axis = .horizontal
        stack.distribution = .fillEqually
    }

    func configureLayout() {
        stack.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor)
        ])
    }

    func configureButtons() {
        let items: [(Home.Destination, String, String)] = [
            (.chats, "Chats", "bubble.left.and.bubble.right"),
            (.commands, "Commands", "terminal"),
            (.analytics, "Analytics", "chart.line.uptrend.xyaxis"),
            (.profile, "Profile", "person.crop.circle")
        ]

        for item in items {
            let button = UIButton(type: .system)
            var configuration = UIButton.Configuration.plain()
            configuration.title = item.1
            configuration.image = UIImage(systemName: item.2)
            configuration.imagePlacement = .top
            configuration.imagePadding = 4
            configuration.baseForegroundColor = theme.mutedForeground
            configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
                var transformed = incoming
                transformed.font = UIFont.systemFont(ofSize: 11, weight: .semibold)
                return transformed
            }
            button.configuration = configuration
            button.addAction(UIAction { [weak self] _ in
                self?.onTap?(item.0)
            }, for: .touchUpInside)

            button.accessibilityIdentifier = "home.bottom.\(item.1.lowercased())"
            button.accessibilityLabel = item.1
            button.accessibilityTraits = .button

            buttons[item.0] = button
            stack.addArrangedSubview(button)
        }
    }

    func configureAccessibility() {
        accessibilityIdentifier = "home.bottomNav"
        isAccessibilityElement = false
    }
}

private struct HomeTheme {
    let background = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.1, green: 0.11, blue: 0.12, alpha: 1) : .white }
    let foreground = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.95, green: 0.96, blue: 0.97, alpha: 1) : UIColor(red: 0.12, green: 0.12, blue: 0.14, alpha: 1) }
    let primary = UIColor(red: 0.06, green: 0.47, blue: 0.95, alpha: 1)
    let primaryForeground = UIColor.white
    let secondary = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.18, green: 0.19, blue: 0.21, alpha: 1) : UIColor(red: 0.95, green: 0.96, blue: 0.98, alpha: 1) }
    let secondaryForeground = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.86, green: 0.87, blue: 0.9, alpha: 1) : UIColor(red: 0.33, green: 0.36, blue: 0.41, alpha: 1) }
    let border = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.24, green: 0.25, blue: 0.28, alpha: 1) : UIColor(red: 0.88, green: 0.9, blue: 0.93, alpha: 1) }
    let muted = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.17, green: 0.18, blue: 0.2, alpha: 1) : UIColor(red: 0.95, green: 0.96, blue: 0.97, alpha: 1) }
    let mutedForeground = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.65, green: 0.67, blue: 0.71, alpha: 1) : UIColor(red: 0.46, green: 0.49, blue: 0.53, alpha: 1) }
    let input = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.15, green: 0.16, blue: 0.18, alpha: 1) : UIColor(red: 0.98, green: 0.98, blue: 0.99, alpha: 1) }
    let card = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.14, green: 0.15, blue: 0.17, alpha: 1) : UIColor(red: 0.99, green: 0.99, blue: 1, alpha: 1) }
    let destructive = UIColor.systemRed
}
