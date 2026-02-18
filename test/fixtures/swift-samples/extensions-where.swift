// Test file: Extensions with where clauses

extension Array where Element == String {
    func joinedWithCommas() -> String {
        self.joined(separator: ", ")
    }
}

extension Dictionary where Key == String, Value: Codable {
    func encodeToJSON() -> Data? {
        try? JSONEncoder().encode(self)
    }
}

extension Collection where Element: Equatable {
    func firstCommonElement(with other: Self) -> Element? {
        for element in self {
            if other.contains(element) {
                return element
            }
        }
        return nil
    }
}

extension MyCustomType: SomeProtocol where T: Hashable {
    func hashedValue() -> Int {
        return hashValue
    }
}
