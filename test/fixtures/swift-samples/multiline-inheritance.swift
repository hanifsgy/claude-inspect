// Test file: Multi-line inheritance clauses

class MultiProtocolViewController:
    UIViewController,
    UITableViewDelegate,
    UITableViewDataSource,
    UIScrollViewDelegate,
    UITextFieldDelegate
{
    override func viewDidLoad() {
        super.viewDidLoad()
    }
}

struct ComplexView:
    View,
    ObservableObject,
    Equatable,
    Hashable,
    Codable
{
    var body: some View {
        Text("Hello")
    }
}

actor ConcurrentProcessor:
    Sendable,
    CustomStringConvertible
{
    unowned let delegate: AnyObject
}
