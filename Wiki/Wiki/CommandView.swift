import UIKit

final class CommandContentView: UIView {

    var onBottomNavTap: ((Home.Destination) -> Void)?
    var onClearAllTap: (() -> Void)?

    private let theme = CommandTheme()

    private let headerView = UIView()
    private let titleLabel = UILabel()
    private let searchContainerView = UIView()
    private let searchIconView = UIImageView()
    private let searchTextField = UITextField()
    private let filtersScrollView = UIScrollView()
    private let filtersStack = UIStackView()
    private var filterButtons: [Command.Category: UIButton] = [:]

    private let scrollView = UIScrollView()
    private let scrollContentView = UIView()

    private let librarySectionView = UIView()
    private let libraryTitleLabel = UILabel()
    private let libraryCardsStack = UIStackView()

    private let executionSectionView = UIView()
    private let executionHeaderStack = UIStackView()
    private let executionTitleLabel = UILabel()
    private let clearAllButton = UIButton(type: .system)
    private let executionItemsStack = UIStackView()

    private let bottomNavView = CommandBottomNavView()

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

    func apply(viewModel: Command.Load.ViewModel) {
        titleLabel.text = viewModel.title
        searchTextField.placeholder = viewModel.searchPlaceholder
        renderFilters(viewModel.filters, selected: viewModel.selectedFilter)
        renderLibraryItems(viewModel.libraryItems)
        renderExecutionLogs(viewModel.executionLogs)
        bottomNavView.select(destination: viewModel.selectedDestination)
    }
}

private extension CommandContentView {
    func configureViewHierarchy() {
        addSubview(headerView)
        headerView.addSubview(titleLabel)
        headerView.addSubview(searchContainerView)
        searchContainerView.addSubview(searchIconView)
        searchContainerView.addSubview(searchTextField)
        headerView.addSubview(filtersScrollView)
        filtersScrollView.addSubview(filtersStack)

        addSubview(scrollView)
        scrollView.addSubview(scrollContentView)

        scrollContentView.addSubview(librarySectionView)
        librarySectionView.addSubview(libraryTitleLabel)
        librarySectionView.addSubview(libraryCardsStack)

        scrollContentView.addSubview(executionSectionView)
        executionSectionView.addSubview(executionHeaderStack)
        executionHeaderStack.addArrangedSubview(executionTitleLabel)
        executionHeaderStack.addArrangedSubview(clearAllButton)
        executionSectionView.addSubview(executionItemsStack)

        addSubview(bottomNavView)
    }

    func configureStyle() {
        backgroundColor = theme.background

        headerView.backgroundColor = theme.background
        headerView.layer.borderWidth = 1
        headerView.layer.borderColor = theme.border.cgColor

        titleLabel.font = UIFont.systemFont(ofSize: 24, weight: .bold)
        titleLabel.textColor = theme.foreground

        searchContainerView.backgroundColor = theme.input
        searchContainerView.layer.borderWidth = 1
        searchContainerView.layer.borderColor = theme.border.cgColor

        searchIconView.image = UIImage(systemName: "magnifyingglass")
        searchIconView.tintColor = theme.mutedForeground
        searchIconView.contentMode = .scaleAspectFit

        searchTextField.font = UIFont.systemFont(ofSize: 14)
        searchTextField.textColor = theme.foreground
        searchTextField.returnKeyType = .search

        filtersScrollView.showsHorizontalScrollIndicator = false
        filtersStack.axis = .horizontal
        filtersStack.spacing = 8

        scrollView.showsVerticalScrollIndicator = false

        libraryTitleLabel.text = "SYSTEM LIBRARY"
        libraryTitleLabel.font = UIFont.systemFont(ofSize: 11, weight: .bold)
        libraryTitleLabel.textColor = theme.mutedForeground

        libraryCardsStack.axis = .vertical
        libraryCardsStack.spacing = 12

        executionSectionView.backgroundColor = theme.muted.withAlphaComponent(0.3)
        executionSectionView.layer.borderWidth = 1
        executionSectionView.layer.borderColor = theme.border.cgColor

        executionHeaderStack.axis = .horizontal
        executionHeaderStack.alignment = .center

        executionTitleLabel.text = "EXECUTION LOG"
        executionTitleLabel.font = UIFont.systemFont(ofSize: 11, weight: .bold)
        executionTitleLabel.textColor = theme.mutedForeground

        clearAllButton.setTitle("CLEAR ALL", for: .normal)
        clearAllButton.titleLabel?.font = UIFont.systemFont(ofSize: 10, weight: .bold)
        clearAllButton.setTitleColor(theme.primary, for: .normal)

        executionItemsStack.axis = .vertical
        executionItemsStack.spacing = 12
    }

    func configureLayout() {
        [
            headerView,
            titleLabel,
            searchContainerView,
            searchIconView,
            searchTextField,
            filtersScrollView,
            filtersStack,
            scrollView,
            scrollContentView,
            librarySectionView,
            libraryTitleLabel,
            libraryCardsStack,
            executionSectionView,
            executionHeaderStack,
            executionItemsStack,
            bottomNavView
        ].forEach { $0.translatesAutoresizingMaskIntoConstraints = false }

        NSLayoutConstraint.activate([
            headerView.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor),
            headerView.leadingAnchor.constraint(equalTo: leadingAnchor),
            headerView.trailingAnchor.constraint(equalTo: trailingAnchor),

            titleLabel.topAnchor.constraint(equalTo: headerView.topAnchor, constant: 16),
            titleLabel.leadingAnchor.constraint(equalTo: headerView.leadingAnchor, constant: 20),
            titleLabel.trailingAnchor.constraint(equalTo: headerView.trailingAnchor, constant: -20),

            searchContainerView.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 14),
            searchContainerView.leadingAnchor.constraint(equalTo: headerView.leadingAnchor, constant: 20),
            searchContainerView.trailingAnchor.constraint(equalTo: headerView.trailingAnchor, constant: -20),
            searchContainerView.heightAnchor.constraint(equalToConstant: 44),

            searchIconView.leadingAnchor.constraint(equalTo: searchContainerView.leadingAnchor, constant: 10),
            searchIconView.centerYAnchor.constraint(equalTo: searchContainerView.centerYAnchor),
            searchIconView.widthAnchor.constraint(equalToConstant: 16),
            searchIconView.heightAnchor.constraint(equalToConstant: 16),

            searchTextField.leadingAnchor.constraint(equalTo: searchIconView.trailingAnchor, constant: 8),
            searchTextField.trailingAnchor.constraint(equalTo: searchContainerView.trailingAnchor, constant: -10),
            searchTextField.topAnchor.constraint(equalTo: searchContainerView.topAnchor),
            searchTextField.bottomAnchor.constraint(equalTo: searchContainerView.bottomAnchor),

            filtersScrollView.topAnchor.constraint(equalTo: searchContainerView.bottomAnchor, constant: 12),
            filtersScrollView.leadingAnchor.constraint(equalTo: headerView.leadingAnchor, constant: 20),
            filtersScrollView.trailingAnchor.constraint(equalTo: headerView.trailingAnchor, constant: -20),
            filtersScrollView.heightAnchor.constraint(equalToConstant: 30),
            filtersScrollView.bottomAnchor.constraint(equalTo: headerView.bottomAnchor, constant: -14),

            filtersStack.topAnchor.constraint(equalTo: filtersScrollView.contentLayoutGuide.topAnchor),
            filtersStack.bottomAnchor.constraint(equalTo: filtersScrollView.contentLayoutGuide.bottomAnchor),
            filtersStack.leadingAnchor.constraint(equalTo: filtersScrollView.contentLayoutGuide.leadingAnchor),
            filtersStack.trailingAnchor.constraint(equalTo: filtersScrollView.contentLayoutGuide.trailingAnchor),
            filtersStack.heightAnchor.constraint(equalTo: filtersScrollView.frameLayoutGuide.heightAnchor),

            bottomNavView.leadingAnchor.constraint(equalTo: leadingAnchor),
            bottomNavView.trailingAnchor.constraint(equalTo: trailingAnchor),
            bottomNavView.bottomAnchor.constraint(equalTo: bottomAnchor),
            bottomNavView.heightAnchor.constraint(equalToConstant: 88),

            scrollView.topAnchor.constraint(equalTo: headerView.bottomAnchor),
            scrollView.leadingAnchor.constraint(equalTo: leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: bottomNavView.topAnchor),

            scrollContentView.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor),
            scrollContentView.leadingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.leadingAnchor),
            scrollContentView.trailingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.trailingAnchor),
            scrollContentView.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor),
            scrollContentView.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor),

            librarySectionView.topAnchor.constraint(equalTo: scrollContentView.topAnchor),
            librarySectionView.leadingAnchor.constraint(equalTo: scrollContentView.leadingAnchor),
            librarySectionView.trailingAnchor.constraint(equalTo: scrollContentView.trailingAnchor),

            libraryTitleLabel.topAnchor.constraint(equalTo: librarySectionView.topAnchor, constant: 20),
            libraryTitleLabel.leadingAnchor.constraint(equalTo: librarySectionView.leadingAnchor, constant: 20),
            libraryTitleLabel.trailingAnchor.constraint(equalTo: librarySectionView.trailingAnchor, constant: -20),

            libraryCardsStack.topAnchor.constraint(equalTo: libraryTitleLabel.bottomAnchor, constant: 12),
            libraryCardsStack.leadingAnchor.constraint(equalTo: librarySectionView.leadingAnchor, constant: 20),
            libraryCardsStack.trailingAnchor.constraint(equalTo: librarySectionView.trailingAnchor, constant: -20),
            libraryCardsStack.bottomAnchor.constraint(equalTo: librarySectionView.bottomAnchor, constant: -20),

            executionSectionView.topAnchor.constraint(equalTo: librarySectionView.bottomAnchor),
            executionSectionView.leadingAnchor.constraint(equalTo: scrollContentView.leadingAnchor),
            executionSectionView.trailingAnchor.constraint(equalTo: scrollContentView.trailingAnchor),
            executionSectionView.bottomAnchor.constraint(equalTo: scrollContentView.bottomAnchor),

            executionHeaderStack.topAnchor.constraint(equalTo: executionSectionView.topAnchor, constant: 20),
            executionHeaderStack.leadingAnchor.constraint(equalTo: executionSectionView.leadingAnchor, constant: 20),
            executionHeaderStack.trailingAnchor.constraint(equalTo: executionSectionView.trailingAnchor, constant: -20),

            executionItemsStack.topAnchor.constraint(equalTo: executionHeaderStack.bottomAnchor, constant: 12),
            executionItemsStack.leadingAnchor.constraint(equalTo: executionSectionView.leadingAnchor, constant: 20),
            executionItemsStack.trailingAnchor.constraint(equalTo: executionSectionView.trailingAnchor, constant: -20),
            executionItemsStack.bottomAnchor.constraint(equalTo: executionSectionView.bottomAnchor, constant: -20)
        ])
    }

    func configureActions() {
        clearAllButton.addTarget(self, action: #selector(handleClearAll), for: .touchUpInside)
        bottomNavView.onTap = { [weak self] destination in
            self?.onBottomNavTap?(destination)
        }
    }

    func configureAccessibility() {
        accessibilityIdentifier = "command.content"
        isAccessibilityElement = false

        headerView.accessibilityIdentifier = "command.header"
        titleLabel.accessibilityIdentifier = "command.header.title"
        titleLabel.accessibilityTraits = .header

        searchContainerView.accessibilityIdentifier = "command.search.container"
        searchIconView.isAccessibilityElement = true
        searchIconView.accessibilityIdentifier = "command.search.icon"
        searchIconView.accessibilityTraits = .image
        searchTextField.accessibilityIdentifier = "command.search.field"
        searchTextField.accessibilityLabel = "Command search"
        searchTextField.accessibilityHint = "Search command presets"

        filtersScrollView.accessibilityIdentifier = "command.filters.scroll"
        filtersStack.accessibilityIdentifier = "command.filters.stack"

        scrollView.accessibilityIdentifier = "command.scroll"
        librarySectionView.accessibilityIdentifier = "command.section.library"
        libraryTitleLabel.accessibilityIdentifier = "command.library.title"
        executionSectionView.accessibilityIdentifier = "command.section.execution"
        executionTitleLabel.accessibilityIdentifier = "command.execution.title"
        clearAllButton.accessibilityIdentifier = "command.execution.clearAll"
        clearAllButton.accessibilityHint = "Clears all execution entries"
    }

    func renderFilters(_ filters: [Command.Filter], selected: Command.Category) {
        filterButtons.removeAll()
        filtersStack.arrangedSubviews.forEach { view in
            filtersStack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }

        for filter in filters {
            let button = UIButton(type: .system)
            var configuration = UIButton.Configuration.plain()
            configuration.title = filter.title
            configuration.contentInsets = NSDirectionalEdgeInsets(top: 5, leading: 10, bottom: 5, trailing: 10)
            configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
                var transformed = incoming
                transformed.font = UIFont.systemFont(ofSize: 11, weight: .bold)
                return transformed
            }
            button.configuration = configuration
            button.layer.borderWidth = 1
            button.layer.cornerRadius = 6
            styleFilterButton(button, selected: filter.category == selected)

            button.accessibilityIdentifier = "command.filter.\(filter.category.rawValue)"
            button.accessibilityLabel = filter.title
            button.accessibilityTraits = filter.category == selected ? [.button, .selected] : .button

            filterButtons[filter.category] = button
            filtersStack.addArrangedSubview(button)
        }
    }

    func styleFilterButton(_ button: UIButton, selected: Bool) {
        if selected {
            button.backgroundColor = theme.primary
            button.layer.borderColor = theme.primary.cgColor
            if var configuration = button.configuration {
                configuration.baseForegroundColor = theme.primaryForeground
                button.configuration = configuration
            }
        } else {
            button.backgroundColor = theme.secondary
            button.layer.borderColor = theme.border.cgColor
            if var configuration = button.configuration {
                configuration.baseForegroundColor = theme.secondaryForeground
                button.configuration = configuration
            }
        }
    }

    func renderLibraryItems(_ items: [Command.LibraryItem]) {
        libraryCardsStack.arrangedSubviews.forEach { view in
            libraryCardsStack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }

        for (index, item) in items.enumerated() {
            let card = CommandLibraryCardView()
            card.configure(item: item, index: index)
            libraryCardsStack.addArrangedSubview(card)
        }
    }

    func renderExecutionLogs(_ logs: [Command.ExecutionLog]) {
        executionItemsStack.arrangedSubviews.forEach { view in
            executionItemsStack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }

        for (index, log) in logs.enumerated() {
            let itemView = CommandExecutionLogItemView()
            itemView.configure(log: log, index: index)
            executionItemsStack.addArrangedSubview(itemView)
        }
    }

    @objc func handleClearAll() {
        onClearAllTap?()
    }
}

final class CommandLibraryCardView: UIView {

    private let theme = CommandTheme()

    private let rowStack = UIStackView()
    private let iconContainer = UIView()
    private let iconImageView = UIImageView()
    private let commandNameLabel = UILabel()
    private let infoButton = UIButton(type: .system)
    private let descriptionLabel = UILabel()

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

    func configure(item: Command.LibraryItem, index: Int) {
        iconImageView.image = UIImage(systemName: item.systemImageName)
        commandNameLabel.text = item.commandName
        descriptionLabel.text = item.description
        infoButton.isHidden = !item.showsInfo

        accessibilityIdentifier = "command.library.card.\(index)"
        iconContainer.accessibilityIdentifier = "command.library.card.\(index).iconContainer"
        iconImageView.accessibilityIdentifier = "command.library.card.\(index).icon"
        commandNameLabel.accessibilityIdentifier = "command.library.card.\(index).name"
        infoButton.accessibilityIdentifier = "command.library.card.\(index).info"
        descriptionLabel.accessibilityIdentifier = "command.library.card.\(index).description"
        accessibilityLabel = "\(item.commandName). \(item.description)"
    }
}

private extension CommandLibraryCardView {
    func configureViewHierarchy() {
        addSubview(rowStack)
        rowStack.addArrangedSubview(iconContainer)
        iconContainer.addSubview(iconImageView)
        rowStack.addArrangedSubview(commandNameLabel)
        rowStack.addArrangedSubview(UIView())
        rowStack.addArrangedSubview(infoButton)
        addSubview(descriptionLabel)
    }

    func configureStyle() {
        backgroundColor = theme.card
        layer.borderWidth = 1
        layer.borderColor = theme.border.cgColor

        rowStack.axis = .horizontal
        rowStack.alignment = .center
        rowStack.spacing = 8

        iconContainer.backgroundColor = theme.primary.withAlphaComponent(0.1)
        iconContainer.layer.cornerRadius = 4

        iconImageView.tintColor = theme.primary
        iconImageView.contentMode = .scaleAspectFit

        commandNameLabel.font = UIFont.monospacedSystemFont(ofSize: 14, weight: .bold)
        commandNameLabel.textColor = theme.foreground

        infoButton.setImage(UIImage(systemName: "info.circle"), for: .normal)
        infoButton.tintColor = theme.mutedForeground

        descriptionLabel.font = UIFont.systemFont(ofSize: 12, weight: .regular)
        descriptionLabel.textColor = theme.mutedForeground
        descriptionLabel.numberOfLines = 0
    }

    func configureLayout() {
        [rowStack, iconContainer, iconImageView, descriptionLabel].forEach { $0.translatesAutoresizingMaskIntoConstraints = false }

        NSLayoutConstraint.activate([
            rowStack.topAnchor.constraint(equalTo: topAnchor, constant: 12),
            rowStack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            rowStack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),

            iconContainer.widthAnchor.constraint(equalToConstant: 32),
            iconContainer.heightAnchor.constraint(equalToConstant: 32),

            iconImageView.centerXAnchor.constraint(equalTo: iconContainer.centerXAnchor),
            iconImageView.centerYAnchor.constraint(equalTo: iconContainer.centerYAnchor),
            iconImageView.widthAnchor.constraint(equalToConstant: 18),
            iconImageView.heightAnchor.constraint(equalToConstant: 18),

            descriptionLabel.topAnchor.constraint(equalTo: rowStack.bottomAnchor, constant: 10),
            descriptionLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            descriptionLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            descriptionLabel.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -12)
        ])
    }

    func configureAccessibility() {
        isAccessibilityElement = true
        accessibilityTraits = .button

        rowStack.isAccessibilityElement = false
        iconContainer.isAccessibilityElement = true
        iconContainer.accessibilityTraits = .image
        iconImageView.isAccessibilityElement = true
        iconImageView.accessibilityTraits = .image
        commandNameLabel.isAccessibilityElement = true
        infoButton.accessibilityLabel = "More info"
        descriptionLabel.isAccessibilityElement = true
    }
}

final class CommandExecutionLogItemView: UIView {

    private let theme = CommandTheme()

    private let timelineColumn = UIView()
    private let timelineDot = UIView()
    private let timelineLine = UIView()

    private let bodyStack = UIStackView()
    private let headerStack = UIStackView()
    private let timeLabel = UILabel()
    private let statusLabel = UILabel()

    private let cardView = UIView()
    private let cardHeaderStack = UIStackView()
    private let fileNameLabel = UILabel()
    private let actionsStack = UIStackView()
    private let metadataLabel = UILabel()

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

    func configure(log: Command.ExecutionLog, index: Int) {
        timeLabel.text = log.timestamp
        statusLabel.text = log.status.rawValue.uppercased()
        fileNameLabel.text = log.fileName
        metadataLabel.text = log.metadata.uppercased()

        timelineDot.backgroundColor = log.isActive ? theme.primary : theme.border
        timelineLine.isHidden = !log.isActive

        actionsStack.arrangedSubviews.forEach { view in
            actionsStack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }

        for action in log.actions {
            let button = UIButton(type: .system)
            let symbolName = action == .download ? "arrow.down" : "link"
            button.setImage(UIImage(systemName: symbolName), for: .normal)
            button.tintColor = theme.mutedForeground
            button.accessibilityIdentifier = "command.execution.item.\(index).action.\(action.rawValue)"
            button.accessibilityLabel = action == .download ? "Download result" : "Copy share link"
            button.accessibilityTraits = .button
            actionsStack.addArrangedSubview(button)
        }

        accessibilityIdentifier = "command.execution.item.\(index)"
        timelineDot.accessibilityIdentifier = "command.execution.item.\(index).dot"
        timelineLine.accessibilityIdentifier = "command.execution.item.\(index).line"
        timeLabel.accessibilityIdentifier = "command.execution.item.\(index).time"
        statusLabel.accessibilityIdentifier = "command.execution.item.\(index).status"
        cardView.accessibilityIdentifier = "command.execution.item.\(index).card"
        fileNameLabel.accessibilityIdentifier = "command.execution.item.\(index).file"
        actionsStack.accessibilityIdentifier = "command.execution.item.\(index).actions"
        metadataLabel.accessibilityIdentifier = "command.execution.item.\(index).metadata"
        accessibilityLabel = "\(log.timestamp), \(log.status.rawValue), \(log.fileName)"
    }
}

private extension CommandExecutionLogItemView {
    func configureViewHierarchy() {
        addSubview(timelineColumn)
        timelineColumn.addSubview(timelineDot)
        timelineColumn.addSubview(timelineLine)

        addSubview(bodyStack)
        bodyStack.addArrangedSubview(headerStack)
        headerStack.addArrangedSubview(timeLabel)
        headerStack.addArrangedSubview(UIView())
        headerStack.addArrangedSubview(statusLabel)
        bodyStack.addArrangedSubview(cardView)

        cardView.addSubview(cardHeaderStack)
        cardHeaderStack.addArrangedSubview(fileNameLabel)
        cardHeaderStack.addArrangedSubview(UIView())
        cardHeaderStack.addArrangedSubview(actionsStack)
        cardView.addSubview(metadataLabel)
    }

    func configureStyle() {
        timelineDot.layer.cornerRadius = 4
        timelineLine.backgroundColor = theme.border

        bodyStack.axis = .vertical
        bodyStack.spacing = 4

        headerStack.axis = .horizontal
        headerStack.alignment = .center

        timeLabel.font = UIFont.monospacedSystemFont(ofSize: 10, weight: .bold)
        timeLabel.textColor = theme.foreground

        statusLabel.font = UIFont.monospacedSystemFont(ofSize: 10, weight: .bold)
        statusLabel.textColor = UIColor(red: 0.15, green: 0.56, blue: 0.2, alpha: 1)
        statusLabel.backgroundColor = UIColor(red: 0.15, green: 0.56, blue: 0.2, alpha: 1).withAlphaComponent(0.1)
        statusLabel.layer.cornerRadius = 2
        statusLabel.clipsToBounds = true
        statusLabel.textAlignment = .center

        cardView.backgroundColor = theme.card
        cardView.layer.borderWidth = 1
        cardView.layer.borderColor = theme.border.cgColor

        cardHeaderStack.axis = .horizontal
        cardHeaderStack.alignment = .center

        fileNameLabel.font = UIFont.systemFont(ofSize: 12, weight: .bold)
        fileNameLabel.textColor = theme.foreground

        actionsStack.axis = .horizontal
        actionsStack.spacing = 8

        metadataLabel.font = UIFont.monospacedSystemFont(ofSize: 10, weight: .regular)
        metadataLabel.textColor = theme.mutedForeground
    }

    func configureLayout() {
        [timelineColumn, timelineDot, timelineLine, bodyStack, cardView, cardHeaderStack, metadataLabel].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
        }

        NSLayoutConstraint.activate([
            timelineColumn.leadingAnchor.constraint(equalTo: leadingAnchor),
            timelineColumn.topAnchor.constraint(equalTo: topAnchor),
            timelineColumn.bottomAnchor.constraint(equalTo: bottomAnchor),
            timelineColumn.widthAnchor.constraint(equalToConstant: 10),

            timelineDot.topAnchor.constraint(equalTo: timelineColumn.topAnchor, constant: 4),
            timelineDot.centerXAnchor.constraint(equalTo: timelineColumn.centerXAnchor),
            timelineDot.widthAnchor.constraint(equalToConstant: 8),
            timelineDot.heightAnchor.constraint(equalToConstant: 8),

            timelineLine.topAnchor.constraint(equalTo: timelineDot.bottomAnchor, constant: 4),
            timelineLine.centerXAnchor.constraint(equalTo: timelineColumn.centerXAnchor),
            timelineLine.widthAnchor.constraint(equalToConstant: 1),
            timelineLine.bottomAnchor.constraint(equalTo: timelineColumn.bottomAnchor, constant: -6),

            bodyStack.leadingAnchor.constraint(equalTo: timelineColumn.trailingAnchor, constant: 10),
            bodyStack.trailingAnchor.constraint(equalTo: trailingAnchor),
            bodyStack.topAnchor.constraint(equalTo: topAnchor),
            bodyStack.bottomAnchor.constraint(equalTo: bottomAnchor),

            statusLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 58),
            statusLabel.heightAnchor.constraint(equalToConstant: 16),

            cardHeaderStack.topAnchor.constraint(equalTo: cardView.topAnchor, constant: 10),
            cardHeaderStack.leadingAnchor.constraint(equalTo: cardView.leadingAnchor, constant: 10),
            cardHeaderStack.trailingAnchor.constraint(equalTo: cardView.trailingAnchor, constant: -10),

            metadataLabel.topAnchor.constraint(equalTo: cardHeaderStack.bottomAnchor, constant: 8),
            metadataLabel.leadingAnchor.constraint(equalTo: cardView.leadingAnchor, constant: 10),
            metadataLabel.trailingAnchor.constraint(equalTo: cardView.trailingAnchor, constant: -10),
            metadataLabel.bottomAnchor.constraint(equalTo: cardView.bottomAnchor, constant: -10)
        ])
    }

    func configureAccessibility() {
        isAccessibilityElement = true
        accessibilityTraits = .button

        timelineColumn.isAccessibilityElement = false
        timelineDot.isAccessibilityElement = true
        timelineDot.accessibilityTraits = .image
        timelineLine.isAccessibilityElement = true
        timelineLine.accessibilityTraits = .image
        timeLabel.isAccessibilityElement = true
        statusLabel.isAccessibilityElement = true
        cardView.isAccessibilityElement = false
        fileNameLabel.isAccessibilityElement = true
        metadataLabel.isAccessibilityElement = true
    }
}

final class CommandBottomNavView: UIView {

    var onTap: ((Home.Destination) -> Void)?

    private let theme = CommandTheme()
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

private extension CommandBottomNavView {
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

            button.accessibilityIdentifier = "command.bottom.\(item.1.lowercased())"
            button.accessibilityLabel = item.1
            button.accessibilityTraits = .button

            buttons[item.0] = button
            stack.addArrangedSubview(button)
        }
    }

    func configureAccessibility() {
        accessibilityIdentifier = "command.bottomNav"
        isAccessibilityElement = false
    }
}

private struct CommandTheme {
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
}
