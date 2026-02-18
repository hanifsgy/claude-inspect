// Test file: Nested types (3+ levels)

class OuterLevel {
    class MiddleLevel {
        class InnerLevel {
            var value: String = ""
        }
        
        struct InnerStruct {
            let id: Int
        }
    }
    
    enum NestedEnum {
        case first
        case second
    }
}

struct Container {
    struct Item {
        struct Metadata {
            let timestamp: Date
        }
    }
}
