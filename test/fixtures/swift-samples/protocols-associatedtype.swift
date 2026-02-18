// Test file: Protocols with associated types

protocol Container {
    associatedtype Item
    var items: [Item] { get }
    mutating func add(_ item: Item)
}

protocol Repository {
    associatedtype Entity: Identifiable
    associatedtype ID = UUID
    func find(by id: ID) -> Entity?
    func save(_ entity: Entity)
}

protocol NetworkService {
    associatedtype Response: Decodable
    associatedtype Request: Encodable
    
    func fetch(request: Request) async throws -> Response
}

protocol SimpleProtocol {
    func doSomething()
}

protocol SingleAssociatedType {
    associatedtype T: Equatable & Hashable
    var value: T { get set }
}
