package app.openhabit.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TodayParserTest {

    private val sample = """
        {"date":"2026-10-17","total":3,"done":1,"open":2,"habits":[
          {"id":"a","name":"Wake up","color":"#7FD1AE","type":"boolean","unit":"","target":1,"afterHabitId":null,"value":1,"completed":true,"skipped":false,"streak":6},
          {"id":"x","name":"Gym","color":"#5BB5E0","type":"boolean","unit":"","target":1,"afterHabitId":null,"value":null,"completed":false,"skipped":false,"streak":0},
          {"id":"m","name":"Meditate","color":"#8FB4E3","type":"numeric","unit":"min","target":10,"afterHabitId":"a","value":null,"completed":false,"skipped":false,"streak":2}
        ]}
    """.trimIndent()

    @Test
    fun parsesTheTodayResponse() {
        val t = TodayParser.parse(sample)
        assertEquals("2026-10-17", t.date)
        assertEquals(1, t.done)
        assertEquals(3, t.total)
        val a = t.habits.first { it.id == "a" }
        assertTrue(a.completed)
        assertEquals(6, a.streak)
        assertNull(t.habits.first { it.id == "x" }.value)
    }

    @Test
    fun aStackedHabitSitsDirectlyBehindItsAnchor() {
        val ids = TodayParser.parse(sample).habits.map { it.id }
        assertEquals(listOf("a", "m", "x"), ids)
    }

    @Test
    fun aLoopInTheDataStillShowsEveryHabit() {
        val json = """{"date":"2026-10-17","habits":[
          {"id":"p","name":"P","type":"boolean","afterHabitId":"q","completed":false},
          {"id":"q","name":"Q","type":"boolean","afterHabitId":"p","completed":false}]}"""
        assertEquals(setOf("p", "q"), TodayParser.parse(json).habits.map { it.id }.toSet())
    }

    @Test
    fun tappingWritesTheRightValue() {
        val t = TodayParser.parse(sample)
        assertEquals(1.0, TodayParser.valueToWrite(t.habits.first { it.id == "x" })!!, 0.0)
        assertEquals(10.0, TodayParser.valueToWrite(t.habits.first { it.id == "m" })!!, 0.0)
        assertNull(TodayParser.valueToWrite(t.habits.first { it.id == "a" })) // already done: a tap undoes it
        assertFalse(t.habits.first { it.id == "a" }.skipped)
    }
}
