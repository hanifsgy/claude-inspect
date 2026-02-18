// Test file: @objc and @objcMembers permutations

@objc
class ObjcClass {
    var value: String = ""
}

@objcMembers
class ObjcMembersClass {
    var value: String = ""
    func doSomething() {}
}

@objc(PreferredName)
class RenamedObjcClass {
    @objc(customSelector:)
    func method(param: Int) {}
}

@objc @objcMembers
class BothAttributesClass {
    var mixed: Bool = true
}

class NoObjcClass {
    @objc
    func singleObjcMethod() {}
}

@objc public class PublicObjcClass {
    var publicValue: Int = 0
}
