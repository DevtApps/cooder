package com.claudewebui.app.ui.screens.dashboard

import com.claudewebui.app.data.model.CLIProvider
import com.claudewebui.app.data.model.Session
import com.claudewebui.app.data.model.SessionStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class DashboardFilterTest {
    private val session = Session(
        id = "one",
        userId = "user",
        name = "Memory optimizer",
        workingDirectory = "/workspace/plum-code-webui",
        status = SessionStatus.STOPPED,
        cliProvider = CLIProvider.OPENCODE,
        cliModel = "z-ai/glm-5.1",
        createdAt = "2026-08-01T00:00:00Z",
        updatedAt = "2026-08-02T00:00:00Z",
    )

    @Test
    fun `search includes workspace provider and model`() {
        listOf("plum-code", "opencode", "glm-5.1").forEach { query ->
            assertEquals(
                listOf("one"),
                filterDashboardSessions(listOf(session), query, null).map { it.id },
            )
        }
    }

    @Test
    fun `project filter narrows by working directory`() {
        val other = session.copy(id = "two", workingDirectory = "/workspace/ola")
        assertEquals(
            listOf(session.id),
            filterDashboardSessions(
                listOf(session, other),
                query = "",
                categoryId = null,
                projectPath = "/workspace/plum-code-webui",
            ).map { it.id },
        )
        // null keeps everything.
        assertEquals(
            listOf("one", "two"),
            filterDashboardSessions(
                listOf(session, other),
                query = "",
                categoryId = null,
                projectPath = null,
            ).map { it.id },
        )
    }

    @Test
    fun `projects derive from working directories sorted by session count`() {
        val repeated = listOf(
            session,
            session.copy(id = "two", updatedAt = "2026-08-03T00:00:00Z"),
            session.copy(id = "three", workingDirectory = "/workspace/ola"),
        )
        val projects = deriveProjects(repeated)
        assertEquals(listOf("plum-code-webui", "ola"), projects.map { it.label })
        assertEquals(listOf(2, 1), projects.map { it.sessionCount })
    }
}
