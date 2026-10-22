package com.claudewebui.app.widget

import org.junit.Assert.assertEquals
import org.junit.Test

class MonitorSlotsTest {
    @Test
    fun `slots round-trip through the preference string with gaps intact`() {
        val slots = listOf("a", null, "c", null)
        assertEquals(slots, decodeMonitorSlots(encodeMonitorSlots(slots)))
        assertEquals(List(4) { null }, decodeMonitorSlots(null))
        assertEquals(listOf("x", null, null, null), decodeMonitorSlots("x"))
    }
}
