import XCTest
@testable import OpenHabitCore

final class CoreTests: XCTestCase {
    let json = """
    {"date":"2026-11-07","total":3,"done":1,"open":2,"habits":[
      {"id":"a","name":"Wake up","color":"#7FD1AE","icon":"sunrise","type":"boolean","unit":"","target":1,"targetType":"at_least","afterHabitId":null,"value":1,"completed":true,"skipped":false,"streak":6},
      {"id":"x","name":"Gym","color":"#5BB5E0","icon":"","type":"boolean","unit":"","target":1,"targetType":"at_least","afterHabitId":null,"value":null,"completed":false,"skipped":false,"streak":0,"weekCount":2,"frequency":4},
      {"id":"m","name":"Meditate","color":"#8FB4E3","icon":"","type":"numeric","unit":"min","target":10,"targetType":"at_least","afterHabitId":"a","value":null,"completed":false,"skipped":false,"streak":2}
    ]}
    """.data(using: .utf8)!

    func testParsesTheTodayResponseAndStacks() throws {
        let t = try TodayLogic.parse(json)
        XCTAssertEqual(t.date, "2026-11-07")
        XCTAssertEqual(t.done, 1)
        XCTAssertEqual(t.habits.map(\.id), ["a", "m", "x"])
        XCTAssertEqual(t.next?.id, "m")
        XCTAssertNil(t.habits[2].value)
    }

    func testTapValues() throws {
        let t = try TodayLogic.parse(json)
        XCTAssertNil(TodayLogic.valueToWrite(t.habits[0]))       // done: a tap undoes it
        XCTAssertEqual(TodayLogic.valueToWrite(t.habits[1]), 10)  // measurable: its target
        XCTAssertEqual(TodayLogic.valueToWrite(t.habits[2]), 1)
    }

    func testLoopsNeverDropHabits() {
        let list = [TodayHabit(id: "p", name: "P", afterHabitId: "q"), TodayHabit(id: "q", name: "Q", afterHabitId: "p")]
        XCTAssertEqual(Set(TodayLogic.stackOrder(list).map(\.id)), ["p", "q"])
    }

    func testToggledUpdatesTheCount() {
        let t = TodayLogic.toggled(Today.sample, habitId: "5")
        XCTAssertEqual(t.done, 3)
        XCTAssertTrue(t.habits.first { $0.id == "5" }!.completed)
    }

    func testLocalDateAndSettings() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Kolkata")!
        let d = Date(timeIntervalSince1970: 1_793_000_000) // 2026-10-26 07:33 UTC, 13:03 in Kolkata
        XCTAssertEqual(TodayLogic.localDate(d, calendar: cal), "2026-10-26")
        XCTAssertEqual(ServerSettings.normalize(" habits.example.com/ "), "https://habits.example.com")
        XCTAssertFalse(ServerSettings(baseURL: "x", token: " ").isConfigured)
    }
}
