const API_ROOT = "http://localhost:5000/api";
const TASKS_API_URL = `${API_ROOT}/tasks`;
const ANALYTICS_API_URL = `${TASKS_API_URL}/analytics`;
const PRODUCTIVITY_API_URL = `${TASKS_API_URL}/productivity`;
const EXPORT_API_URL = `${TASKS_API_URL}/export`;
const AUTH_API_URL = `${API_ROOT}/auth`;
const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("currentUser") || "null");

if (!token || !user) {
    window.location.replace("auth.html");
}

const firstName = user?.name?.split(" ")[0] || "User";
const backupKey = `taskmaster_tasks_${user?.id || user?._id || "guest"}`;

document.querySelector(".welcome-heading").textContent = `Welcome, ${firstName}`;
document.getElementById("userAvatar").textContent = firstName.charAt(0).toUpperCase();

// THEME
const themeToggle = document.getElementById("themeToggle");
const savedTheme = localStorage.getItem("theme") || "dark";

document.documentElement.setAttribute("data-theme", savedTheme);

themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";

    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
});

// TASKS
let tasks = [];
let currentFilter = "all";
let searchTerm = "";
let categoryFilter = "";
let priorityFilter = "";
let statusFilter = "";
let sortFilter = "created-desc";
let aimlSuggestionRules = [];
let analyticsData = null;
let productivityData = null;

const taskList = document.getElementById("taskList");
const taskModal = document.getElementById("taskModal");
const taskForm = document.getElementById("taskForm");
const taskTitleInput = document.getElementById("taskTitle");
const taskDescriptionInput = document.getElementById("taskDescription");
const taskDateInput = document.getElementById("taskDate");
const taskPriorityInput = document.getElementById("taskPriority");
const taskCategoryInput = document.getElementById("taskCategory");
const taskRecurrenceInput = document.getElementById("taskRecurrence");

ensureToast();
createTaskControls();
createDashboardModules();
bindSidebarMenu();
createSuggestionBox();
loadAimlSuggestions();

document.getElementById("newTaskBtn").onclick = () => {
    taskModal.classList.add("active");
    taskTitleInput.focus();
};

document.getElementById("cancelTaskBtn").onclick = closeTaskModal;

taskModal.onclick = (e) => {
    if (e.target === taskModal) closeTaskModal();
};

taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const task = {
        title: taskTitleInput.value.trim(),
        description: taskDescriptionInput.value.trim(),
        dueDate: taskDateInput.value,
        priority: taskPriorityInput.value,
        category: taskCategoryInput.value,
        recurrenceType: taskRecurrenceInput.value,
        isRecurring: taskRecurrenceInput.value !== "None",
    };

    if (!task.title) {
        showToast("Task title is required", "error");
        return;
    }

    try {
        setFormLoading(true);
        await apiRequest(TASKS_API_URL, {
            method: "POST",
            body: JSON.stringify(task),
        });

        taskForm.reset();
        closeTaskModal();
        showToast("Task added successfully");
        await loadTasks();
    } catch (error) {
        showToast(error.message, "error");
    } finally {
        setFormLoading(false);
    }
});

async function loadTasks() {
    showTaskState("Loading tasks...");

    try {
        const data = await apiRequest(TASKS_API_URL);

        tasks = data.tasks.map(formatTaskForDashboard);
        localStorage.setItem(backupKey, JSON.stringify(tasks));
        await refreshDashboardData();
        renderTasks(currentFilter);
    } catch (error) {
        if (error.status === 401) {
            logout("Session expired. Please login again.");
            return;
        }

        const cachedTasks = JSON.parse(localStorage.getItem(backupKey) || "[]");
        tasks = cachedTasks;
        analyticsData = buildLocalAnalytics(tasks);
        productivityData = buildLocalProductivity(tasks);
        renderTasks(currentFilter);
        showToast(`${error.message}. Showing local backup.`, "error");
    }
}

function formatTaskForDashboard(task) {
    return {
        id: task._id,
        title: task.title,
        description: task.description || "",
        date: task.isRecurring ? formatTaskDate(new Date()) : formatTaskDate(task.dueDate),
        dueDateRaw: task.dueDate,
        priority: task.priority,
        category: task.category,
        completed: task.status === "Completed",
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        completedAt: task.completedAt,
        isRecurring: Boolean(task.isRecurring),
        recurrenceType: task.recurrenceType || "None",
        streak: task.streak || 0,
        longestStreak: task.longestStreak || 0,
        totalCompletions: task.totalCompletions || 0,
        lastCompletedAt: task.lastCompletedAt,
        completionHistory: task.completionHistory || [],
    };
}

function formatTaskDate(date) {
    if (!date) return "";
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return "";

    return new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(parsed);
}

function formatTaskDateTime(date) {
    if (!date) return "Not available";
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return "Not available";

    return new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(parsed);
}

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
    }[character]));
}

function renderTasks(filter = "all") {
    taskList.innerHTML = "";

    let filtered = getVisibleTasks();

    if (filter === "high") filtered = filtered.filter((task) => task.priority === "High");
    if (filter === "progress") filtered = filtered.filter((task) => !task.completed);
    if (filter === "completed") filtered = filtered.filter((task) => task.completed);

    if (!filtered.length) {
        showTaskState(searchTerm || categoryFilter || priorityFilter || statusFilter
            ? "No tasks match your filters."
            : "No tasks yet. Create your first task to get started.");
        updateStats();
        return;
    }

    const routineTasks = filtered.filter((task) => task.isRecurring);
    const regularTasks = filtered.filter((task) => !task.isRecurring);
    const activeTasks = regularTasks.filter((task) => !task.completed);
    const completedTaskList = regularTasks.filter((task) => task.completed);

    if (filter === "completed") {
        renderRoutineSection(routineTasks);
        renderTaskSection("Completed Tasks", completedTaskList);
    } else if (filter === "progress") {
        renderRoutineSection(routineTasks);
        renderTaskSection("", activeTasks);
    } else {
        renderRoutineSection(routineTasks);
        renderTaskSection("", activeTasks);
        if (completedTaskList.length) {
            renderTaskSection("Completed Tasks", completedTaskList);
        }
    }

    updateStats();
    renderDashboardModules();
}

function renderRoutineSection(routineTasks) {
    if (!routineTasks.length) return;

    const heading = document.createElement("h3");
    heading.className = "task-section-title";
    heading.textContent = "Daily Routine";
    taskList.appendChild(heading);

    routineTasks.forEach((task) => {
        taskList.appendChild(createTaskCard(task));
    });
}

function getVisibleTasks() {
    let filtered = [...tasks];

    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter((task) =>
            task.title.toLowerCase().includes(term) ||
            task.description.toLowerCase().includes(term)
        );
    }

    if (categoryFilter) filtered = filtered.filter((task) => task.category === categoryFilter);
    if (priorityFilter) filtered = filtered.filter((task) => task.priority === priorityFilter);
    if (statusFilter) filtered = filtered.filter((task) =>
        statusFilter === "Completed" ? task.completed : !task.completed
    );

    return sortTasks(filtered);
}

function sortTasks(items) {
    const priorityRank = { High: 3, Medium: 2, Low: 1 };
    const sorted = [...items];

    sorted.sort((a, b) => {
        if (sortFilter === "date-asc") {
            return new Date(a.dueDateRaw || 0) - new Date(b.dueDateRaw || 0);
        }

        if (sortFilter === "date-desc") {
            return new Date(b.dueDateRaw || 0) - new Date(a.dueDateRaw || 0);
        }

        if (sortFilter === "priority-asc") {
            return priorityRank[a.priority] - priorityRank[b.priority];
        }

        if (sortFilter === "priority-desc") {
            return priorityRank[b.priority] - priorityRank[a.priority];
        }

        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    return sorted;
}

function renderTaskSection(title, sectionTasks) {
    if (!sectionTasks.length) return;

    if (title) {
        const heading = document.createElement("h3");
        heading.className = "task-section-title";
        heading.textContent = title;
        taskList.appendChild(heading);
    }

    sectionTasks.forEach((task) => {
        taskList.appendChild(createTaskCard(task));
    });
}

function createTaskCard(task) {
    const div = document.createElement("div");
    div.className = "task-card";

    div.innerHTML = `
    <div class="task-left">
        <input type="checkbox" ${task.completed ? "checked" : ""}
        onchange="toggleTask('${task.id}')">

        <div>
            <div class="task-title ${task.completed ? "completed-task" : ""}">
                ${escapeHTML(task.title)}
            </div>
            <div class="task-date">Due: ${escapeHTML(task.date || "No date")} | ${escapeHTML(task.category)}</div>
            ${task.isRecurring ? getRoutineStatsHTML(task) : ""}
        </div>
    </div>

    <div class="task-right">
        <span class="priority-badge ${task.priority.toLowerCase()}">
            ${escapeHTML(task.priority)}
        </span>
        <i class="fa-solid fa-trash" onclick="deleteTask('${task.id}')" title="Delete task permanently"></i>
    </div>
    `;

    return div;
}

function getRoutineStatsHTML(task) {
    return `
        <div class="routine-meta">
            <span>${escapeHTML(task.recurrenceType)} Routine</span>
            <span>Status: ${task.completed ? "Completed Today" : "Pending Today"}</span>
            <span>Current Streak: ${task.streak} Days</span>
            <span>Longest Streak: ${task.longestStreak} Days</span>
            <span>Total Completions: ${task.totalCompletions}</span>
            <span>Completion: ${getRoutineCompletionPercentage(task)}%</span>
        </div>
    `;
}

function getRoutineCompletionPercentage(task) {
    if (!task.isRecurring) return 0;

    const start = new Date(task.createdAt || task.dueDateRaw);
    const today = startOfToday();
    if (Number.isNaN(start.getTime())) return 0;

    start.setHours(0, 0, 0, 0);
    let scheduledCount = 0;
    const cursor = new Date(start);

    while (cursor <= today) {
        if (isRoutineScheduledForDate(task, cursor)) scheduledCount += 1;
        cursor.setDate(cursor.getDate() + 1);
    }

    return scheduledCount ? Math.round((task.totalCompletions / scheduledCount) * 100) : 0;
}

function isRoutineScheduledForDate(task, date) {
    const anchor = new Date(task.dueDateRaw || task.createdAt);
    if (Number.isNaN(anchor.getTime())) return false;

    anchor.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    if (date < anchor) return false;
    if (task.recurrenceType === "Daily") return true;
    if (task.recurrenceType === "Weekly") return date.getDay() === anchor.getDay();
    if (task.recurrenceType === "Monthly") return date.getDate() === anchor.getDate();
    return false;
}

async function toggleTask(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;

    try {
        await apiRequest(`${TASKS_API_URL}/${id}`, {
            method: "PUT",
            body: JSON.stringify({
                status: task.completed ? "Pending" : "Completed",
            }),
        });

        showToast(task.completed ? "Task marked pending" : "Task completed");
        await loadTasks();
    } catch (error) {
        showToast(error.message, "error");
    }
}

async function deleteTask(id) {
    try {
        await apiRequest(`${TASKS_API_URL}/${id}`, {
            method: "DELETE",
        });

        showToast("Task deleted successfully");
        await loadTasks();
    } catch (error) {
        showToast(error.message, "error");
    }
}

function updateStats() {
    const completed = tasks.filter((task) => task.completed).length;
    const pending = tasks.length - completed;
    const overdue = getOverdueTasks(tasks).length;

    totalTasks.textContent = tasks.length;
    completedTasks.textContent = completed;
    inProgressTasks.textContent = pending;
    overdueTasks.textContent = overdue;
}

function getOverdueTasks(items) {
    return items.filter((task) =>
        !task.completed && task.dueDateRaw && new Date(task.dueDateRaw) < startOfToday()
    );
}

function startOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
}

document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".filter-btn")
            .forEach((button) => button.classList.remove("active"));

        btn.classList.add("active");
        currentFilter = btn.dataset.filter;
        renderTasks(currentFilter);
    });
});

document.getElementById("logoutBtn").addEventListener("click", () => logout("Logout successful"));

async function logout(message = "Logout successful") {
    try {
        await apiRequest(`${AUTH_API_URL}/logout`, { method: "POST" });
    } catch (error) {
        // Local session cleanup still completes even if the API is unavailable.
    }

    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    localStorage.removeItem("userName");
    localStorage.removeItem("tasks");
    showToast(message);

    setTimeout(() => {
        window.location.replace("auth.html");
    }, 450);
}

let logoutTimer;
const SESSION_TIME = 10;

function startSessionTimer() {
    clearTimeout(logoutTimer);
    logoutTimer = setTimeout(() => {
        logout("Session expired. Please login again.");
    }, SESSION_TIME * 60 * 1000);
}

function resetTimer() {
    startSessionTimer();
}

["click", "mousemove", "keypress", "scroll", "touchstart"].forEach((event) => {
    document.addEventListener(event, resetTimer);
});

document.getElementById("closeModalX").addEventListener("click", closeTaskModal);

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(data.message || "Request failed");
        error.status = response.status;
        throw error;
    }

    return data;
}

async function apiDownload(url) {
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const error = new Error(data.message || "Download failed");
        error.status = response.status;
        throw error;
    }

    return response.blob();
}

async function refreshDashboardData() {
    try {
        const [analyticsResponse, productivityResponse] = await Promise.all([
            apiRequest(ANALYTICS_API_URL),
            apiRequest(PRODUCTIVITY_API_URL),
        ]);

        analyticsData = analyticsResponse.analytics;
        productivityData = productivityResponse.productivity;
    } catch (error) {
        analyticsData = buildLocalAnalytics(tasks);
        productivityData = buildLocalProductivity(tasks);
    }
}

function buildLocalAnalytics(sourceTasks) {
    const completedTasksCount = sourceTasks.filter((task) => task.completed).length;
    const pendingTasks = sourceTasks.length - completedTasksCount;
    const overdue = getOverdueTasks(sourceTasks).length;
    const highPriorityTasks = sourceTasks.filter((task) => task.priority === "High").length;
    const completedHighPriority = sourceTasks.filter((task) =>
        task.priority === "High" && task.completed
    ).length;
    const recurringTasks = sourceTasks.filter((task) => task.isRecurring).length;
    const recurringCompletions = sourceTasks.reduce((total, task) =>
        total + (task.isRecurring ? task.totalCompletions || 0 : 0), 0);
    const completionRate = sourceTasks.length
        ? Math.round((completedTasksCount / sourceTasks.length) * 100)
        : 0;
    const highPriorityCompletionRate = highPriorityTasks
        ? Math.round((completedHighPriority / highPriorityTasks) * 100)
        : 0;
    const score = calculateProductivityScore({
        totalTasks: sourceTasks.length,
        completionRate,
        overdueTasks: overdue,
        highPriorityCompletionRate,
    });

    return {
        totalTasks: sourceTasks.length,
        completedTasks: completedTasksCount,
        pendingTasks,
        overdueTasks: overdue,
        highPriorityTasks,
        recurringTasks,
        recurringCompletions,
        completionRate,
        highPriorityCompletionRate,
        score,
        productivityLevel: getProductivityLevel(score),
        tasksByCategory: ["Work", "Study", "Personal", "Health"].reduce((payload, category) => {
            payload[category] = sourceTasks.filter((task) => task.category === category).length;
            return payload;
        }, {}),
        recentActivity: [...sourceTasks]
            .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
            .slice(0, 5),
        performanceInsights: [
            `${completionRate}% of tasks are complete.`,
            overdue ? `${overdue} overdue task${overdue === 1 ? "" : "s"} need attention.` : "No overdue tasks right now.",
            highPriorityTasks ? `${highPriorityCompletionRate}% of high-priority tasks are complete.` : "No high-priority tasks yet.",
            recurringTasks ? `${recurringTasks} recurring routine task${recurringTasks === 1 ? " is" : "s are"} active.` : "No recurring routine tasks have been added yet.",
        ],
        recurringSummary: sourceTasks
            .filter((task) => task.isRecurring)
            .map((task) => ({
                id: task.id,
                title: task.title,
                recurrenceType: task.recurrenceType,
                status: task.completed ? "Completed" : "Pending",
                streak: task.streak,
                longestStreak: task.longestStreak,
                totalCompletions: task.totalCompletions,
                completionPercentage: getRoutineCompletionPercentage(task),
                lastCompletedAt: task.lastCompletedAt,
            })),
    };
}

function buildLocalProductivity(sourceTasks) {
    const analytics = buildLocalAnalytics(sourceTasks);
    return {
        score: analytics.score,
        level: analytics.productivityLevel,
        completionRate: analytics.completionRate,
        overdueTasks: analytics.overdueTasks,
        highPriorityCompletionRate: analytics.highPriorityCompletionRate,
    };
}

function calculateProductivityScore(metrics) {
    const overduePenalty = metrics.totalTasks
        ? Math.min(30, Math.round((metrics.overdueTasks / metrics.totalTasks) * 30))
        : 0;

    return Math.max(0, Math.min(100,
        Math.round((metrics.completionRate * 0.5) + (metrics.highPriorityCompletionRate * 0.3) + Math.min(10, metrics.recurringCompletions || 0) + 10 - overduePenalty)
    ));
}

function getProductivityLevel(score) {
    if (score >= 85) return "Excellent";
    if (score >= 70) return "Good";
    if (score >= 50) return "Average";
    return "Needs Improvement";
}

function createDashboardModules() {
    const tasksSection = document.querySelector(".tasks-section");
    tasksSection.insertAdjacentHTML("afterend", `
        <section class="dashboard-module glass-card hidden" id="analyticsModule">
            <div class="module-header">
                <h2>Analytics</h2>
                <span id="completionPercent">0% Complete</span>
            </div>
            <div class="module-grid" id="analyticsCards"></div>
            <div class="chart-grid">
                <div>
                    <h3>Tasks by Category</h3>
                    <div id="categoryChart"></div>
                </div>
                <div>
                    <h3>Recent Activity</h3>
                    <div id="recentActivity"></div>
                </div>
            </div>
            <div class="insight-list" id="performanceInsights"></div>
        </section>

        <section class="dashboard-module glass-card hidden" id="exportModule">
            <div class="module-header">
                <h2>Export Report</h2>
                <span>Task history downloads</span>
            </div>
            <div class="export-actions">
                <button class="new-task-btn" id="csvExportBtn" type="button">Download CSV</button>
                <button class="new-task-btn" id="pdfExportBtn" type="button">Download PDF</button>
            </div>
            <div class="report-preview" id="reportPreview"></div>
        </section>

        <section class="dashboard-module glass-card hidden" id="productivityModule">
            <div class="module-header">
                <h2>Productivity Score</h2>
                <span id="productivityLevel">Needs Improvement</span>
            </div>
            <div class="score-panel">
                <div class="score-circle"><span id="productivityScore">0</span></div>
                <div class="insight-list" id="productivityInsights"></div>
            </div>
        </section>
    `);

    document.getElementById("csvExportBtn").addEventListener("click", () => downloadReport("csv"));
    document.getElementById("pdfExportBtn").addEventListener("click", () => downloadReport("pdf"));
}

function bindSidebarMenu() {
    document.querySelectorAll(".menu-item").forEach((item) => {
        const label = item.textContent.trim();
        item.dataset.view = label;

        item.addEventListener("click", () => {
            document.querySelectorAll(".menu-item").forEach((menuItem) => menuItem.classList.remove("active"));
            item.classList.add("active");
            showDashboardView(label);
        });
    });
}

function showDashboardView(label) {
    const taskButton = document.querySelector(".task-btn-wrapper");
    const taskSection = document.querySelector(".tasks-section");
    const modules = document.querySelectorAll(".dashboard-module");

    modules.forEach((module) => module.classList.add("hidden"));
    taskButton.classList.add("hidden");
    taskSection.classList.add("hidden");

    if (label === "Analytics") {
        document.getElementById("analyticsModule").classList.remove("hidden");
        renderAnalytics();
        return;
    }

    if (label === "Export Report") {
        document.getElementById("exportModule").classList.remove("hidden");
        renderReportPreview();
        return;
    }

    if (label === "Productivity Score") {
        document.getElementById("productivityModule").classList.remove("hidden");
        renderProductivity();
        return;
    }

    taskButton.classList.remove("hidden");
    taskSection.classList.remove("hidden");
    renderTasks(currentFilter);
}

function renderDashboardModules() {
    renderAnalytics();
    renderProductivity();
    renderReportPreview();
}

function renderAnalytics() {
    const analytics = analyticsData || buildLocalAnalytics(tasks);
    const cards = [
        ["Total Tasks", analytics.totalTasks],
        ["Completed Tasks", analytics.completedTasks],
        ["Pending Tasks", analytics.pendingTasks],
        ["Overdue Tasks", analytics.overdueTasks],
        ["High Priority Tasks", analytics.highPriorityTasks],
        ["Routine Tasks", analytics.recurringTasks || 0],
        ["Completion", `${analytics.completionRate}%`],
    ];

    document.getElementById("completionPercent").textContent = `${analytics.completionRate}% Complete`;
    document.getElementById("analyticsCards").innerHTML = cards.map(([label, value]) => `
        <div class="mini-stat">
            <p>${escapeHTML(label)}</p>
            <strong>${escapeHTML(value)}</strong>
        </div>
    `).join("");

    const maxCategory = Math.max(1, ...Object.values(analytics.tasksByCategory || {}));
    document.getElementById("categoryChart").innerHTML = Object.entries(analytics.tasksByCategory || {})
        .map(([category, count]) => `
            <div class="chart-row">
                <span>${escapeHTML(category)}</span>
                <div><i style="width:${Math.max(4, (count / maxCategory) * 100)}%"></i></div>
                <strong>${count}</strong>
            </div>
        `).join("");

    document.getElementById("recentActivity").innerHTML = (analytics.recentActivity || [])
        .map((activity) => `
            <div class="activity-item">
                <strong>${escapeHTML(activity.title)}</strong>
                <span>${escapeHTML(activity.status || (activity.completed ? "Completed" : "Pending"))} | ${escapeHTML(formatTaskDateTime(activity.completedAt || activity.updatedAt || activity.createdAt))}</span>
            </div>
        `).join("") || `<div class="task-state">No recent activity yet.</div>`;

    document.getElementById("performanceInsights").innerHTML = (analytics.performanceInsights || [])
        .map((insight) => `<div class="insight-item">${escapeHTML(insight)}</div>`)
        .join("");
}

function renderProductivity() {
    const productivity = productivityData || buildLocalProductivity(tasks);
    const score = productivity.score || 0;

    document.getElementById("productivityScore").textContent = score;
    document.getElementById("productivityLevel").textContent = productivity.level || getProductivityLevel(score);
    document.querySelector(".score-circle").style.background =
        `conic-gradient(var(--accent) ${score * 3.6}deg, rgba(255,255,255,0.08) 0deg)`;

    document.getElementById("productivityInsights").innerHTML = [
        `Completion Rate: ${productivity.completionRate || 0}%`,
        `High-Priority Completion: ${productivity.highPriorityCompletionRate || 0}%`,
        `Overdue Tasks: ${productivity.overdueTasks || 0}`,
        `Routine Completions: ${productivity.recurringCompletions || 0}`,
    ].map((insight) => `<div class="insight-item">${escapeHTML(insight)}</div>`).join("");
}

function renderReportPreview() {
    const rows = tasks.slice(0, 8).map((task) => `
        <div class="report-row">
            <strong>${escapeHTML(task.title)}</strong>
            <span>${escapeHTML(task.category)} | ${escapeHTML(task.priority)} | ${task.completed ? "Completed" : "Pending"}</span>
        </div>
    `).join("");

    document.getElementById("reportPreview").innerHTML = rows || `<div class="task-state">No tasks available to export.</div>`;
}

async function downloadReport(format) {
    try {
        const blob = await apiDownload(`${EXPORT_API_URL}?format=${format}`);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `taskmaster-report.${format}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast(`${format.toUpperCase()} report downloaded`);
    } catch (error) {
        showToast(error.message, "error");
    }
}

function createTaskControls() {
    const taskListArea = document.querySelector(".task-list-area");
    const tools = document.createElement("div");
    tools.className = "task-tools";
    tools.innerHTML = `
        <input id="taskSearchInput" type="search" placeholder="Search tasks">
        <select id="categoryFilter" aria-label="Filter by category">
            <option value="">All Categories</option>
            <option value="Work">Work</option>
            <option value="Study">Study</option>
            <option value="Personal">Personal</option>
            <option value="Health">Health</option>
        </select>
        <select id="priorityFilter" aria-label="Filter by priority">
            <option value="">All Priorities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
        </select>
        <select id="statusFilter" aria-label="Filter by completion">
            <option value="">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Completed">Completed</option>
        </select>
        <select id="sortFilter" aria-label="Sort tasks">
            <option value="created-desc">Newest Created</option>
            <option value="date-asc">Due Date Asc</option>
            <option value="date-desc">Due Date Desc</option>
            <option value="priority-desc">Priority High-Low</option>
            <option value="priority-asc">Priority Low-High</option>
        </select>
    `;

    taskListArea.insertBefore(tools, taskList);

    document.getElementById("taskSearchInput").addEventListener("input", debounce((event) => {
        searchTerm = event.target.value.trim();
        renderTasks(currentFilter);
    }, 300));

    document.getElementById("categoryFilter").addEventListener("change", (event) => {
        categoryFilter = event.target.value;
        renderTasks(currentFilter);
    });

    document.getElementById("priorityFilter").addEventListener("change", (event) => {
        priorityFilter = event.target.value;
        renderTasks(currentFilter);
    });

    document.getElementById("statusFilter").addEventListener("change", (event) => {
        statusFilter = event.target.value;
        renderTasks(currentFilter);
    });

    document.getElementById("sortFilter").addEventListener("change", (event) => {
        sortFilter = event.target.value;
        renderTasks(currentFilter);
    });
}

function createSuggestionBox() {
    const suggestionBox = document.createElement("div");
    suggestionBox.id = "suggestionBox";
    suggestionBox.className = "suggestion-box";
    taskTitleInput.insertAdjacentElement("afterend", suggestionBox);

    taskTitleInput.addEventListener("input", () => {
        const suggestions = getTaskSuggestions(taskTitleInput.value);
        renderSuggestions(suggestions);
    });
}

async function loadAimlSuggestions() {
    const fallbackRules = [
        { pattern: "STUDY", text: "Study for 2 hours", category: "Study" },
        { pattern: "EXAM", text: "Revise important exam topics", category: "Study" },
        { pattern: "REVISION", text: "Complete one focused revision session", category: "Study" },
        { pattern: "ASSIGNMENT", text: "Finish pending assignment work", category: "Study" },
        { pattern: "HOMEWORK", text: "Complete homework before deadline", category: "Study" },
        { pattern: "READ", text: "Read for 30 minutes", category: "Study" },
        { pattern: "NOTES", text: "Organize and review notes", category: "Study" },
        { pattern: "GYM", text: "Workout for 45 minutes", category: "Health" },
        { pattern: "WORKOUT", text: "Workout for 45 minutes", category: "Health" },
        { pattern: "RUN", text: "Go for a 20 minute run", category: "Health" },
        { pattern: "WALK", text: "Take a 30 minute walk", category: "Health" },
        { pattern: "YOGA", text: "Do a 20 minute yoga session", category: "Health" },
        { pattern: "MEDITATION", text: "Meditate for 10 minutes", category: "Health" },
        { pattern: "WATER", text: "Drink enough water today", category: "Health" },
        { pattern: "MEDICINE", text: "Take medicine on time", category: "Health" },
        { pattern: "DOCTOR", text: "Schedule a doctor appointment", category: "Health" },
        { pattern: "CODING", text: "Practice DSA for 1 hour", category: "Work" },
        { pattern: "CODE", text: "Practice DSA for 1 hour", category: "Work" },
        { pattern: "DSA", text: "Practice DSA for 1 hour", category: "Work" },
        { pattern: "BUG", text: "Fix the highest priority bug", category: "Work" },
        { pattern: "DEBUG", text: "Debug and document the issue", category: "Work" },
        { pattern: "DEPLOY", text: "Prepare deployment checklist", category: "Work" },
        { pattern: "EMAIL", text: "Reply to important emails", category: "Work" },
        { pattern: "REPORT", text: "Prepare progress report", category: "Work" },
        { pattern: "PRESENTATION", text: "Create presentation draft", category: "Work" },
        { pattern: "MEETING", text: "Prepare meeting notes", category: "Work" },
        { pattern: "PROJECT", text: "Complete pending project module", category: "Work" },
        { pattern: "DEADLINE", text: "Finish the urgent deadline task", category: "Work" },
        { pattern: "PLAN", text: "Plan top 3 priorities for today", category: "Personal" },
        { pattern: "SCHEDULE", text: "Update today's schedule", category: "Personal" },
        { pattern: "REMINDER", text: "Set an important reminder", category: "Personal" },
        { pattern: "CALL", text: "Make the pending phone call", category: "Personal" },
        { pattern: "SHOPPING", text: "Buy essential items", category: "Personal" },
        { pattern: "GROCERY", text: "Buy groceries for the week", category: "Personal" },
        { pattern: "CLEAN", text: "Clean and organize the room", category: "Personal" },
        { pattern: "LAUNDRY", text: "Finish laundry today", category: "Personal" },
        { pattern: "BILL", text: "Pay pending bills", category: "Personal" },
        { pattern: "BANK", text: "Complete banking work", category: "Personal" },
        { pattern: "BUDGET", text: "Review monthly budget", category: "Personal" },
        { pattern: "TRAVEL", text: "Prepare travel checklist", category: "Personal" },
        { pattern: "TICKET", text: "Book or confirm tickets", category: "Personal" },
        { pattern: "FAMILY", text: "Spend quality time with family", category: "Personal" },
        { pattern: "BIRTHDAY", text: "Plan birthday wishes or gift", category: "Personal" },
        { pattern: "LEARN", text: "Learn one new concept today", category: "Study" },
        { pattern: "COURSE", text: "Complete one course lesson", category: "Study" },
        { pattern: "VIDEO", text: "Watch one learning video", category: "Study" },
        { pattern: "DESIGN", text: "Finish design improvements", category: "Work" },
        { pattern: "RESUME", text: "Update resume with latest work", category: "Work" },
        { pattern: "INTERVIEW", text: "Prepare for interview questions", category: "Work" },
        { pattern: "QUIZ", text: "Practice quiz questions", category: "Study" },
        { pattern: "TEST", text: "Review test preparation checklist", category: "Study" },
        { pattern: "LECTURE", text: "Review lecture notes", category: "Study" },
        { pattern: "CLASS", text: "Prepare for the next class", category: "Study" },
        { pattern: "TUTORIAL", text: "Complete one tutorial exercise", category: "Study" },
        { pattern: "RESEARCH", text: "Research and summarize key points", category: "Study" },
        { pattern: "BOOK", text: "Read one chapter from the book", category: "Study" },
        { pattern: "PRACTICE", text: "Practice for 45 minutes", category: "Study" },
        { pattern: "SUBMIT", text: "Submit pending work before deadline", category: "Study" },
        { pattern: "REVISION PLAN", text: "Create a revision plan", category: "Study" },
        { pattern: "CLIENT", text: "Follow up with the client", category: "Work" },
        { pattern: "TEAM", text: "Share progress update with the team", category: "Work" },
        { pattern: "REVIEW", text: "Review pending work carefully", category: "Work" },
        { pattern: "DOCUMENTATION", text: "Update project documentation", category: "Work" },
        { pattern: "PR", text: "Review open pull request", category: "Work" },
        { pattern: "COMMIT", text: "Commit completed changes", category: "Work" },
        { pattern: "BACKUP", text: "Create a backup of important files", category: "Work" },
        { pattern: "DATABASE", text: "Check database records and connection", category: "Work" },
        { pattern: "API", text: "Test API endpoints", category: "Work" },
        { pattern: "UI", text: "Polish UI interaction details", category: "Work" },
        { pattern: "SLEEP", text: "Sleep on time tonight", category: "Health" },
        { pattern: "DIET", text: "Plan a healthy meal", category: "Health" },
        { pattern: "MEAL", text: "Prepare a balanced meal", category: "Health" },
        { pattern: "STRETCH", text: "Stretch for 10 minutes", category: "Health" },
        { pattern: "SKINCARE", text: "Complete skincare routine", category: "Health" },
        { pattern: "DENTIST", text: "Book a dentist appointment", category: "Health" },
        { pattern: "VACCINE", text: "Check vaccine appointment details", category: "Health" },
        { pattern: "CHECKUP", text: "Schedule a health checkup", category: "Health" },
        { pattern: "JOURNAL", text: "Write a short journal entry", category: "Personal" },
        { pattern: "GOAL", text: "Review progress on personal goals", category: "Personal" },
        { pattern: "HABIT", text: "Track today's habit progress", category: "Personal" },
        { pattern: "PASSWORD", text: "Update important password securely", category: "Personal" },
        { pattern: "DOCUMENT", text: "Organize important documents", category: "Personal" },
        { pattern: "INSURANCE", text: "Review insurance details", category: "Personal" },
        { pattern: "TAX", text: "Prepare tax documents", category: "Personal" },
        { pattern: "INVESTMENT", text: "Review investment portfolio", category: "Personal" },
        { pattern: "SAVINGS", text: "Update savings tracker", category: "Personal" },
        { pattern: "PAYMENT", text: "Complete pending payment", category: "Personal" },
        { pattern: "RENT", text: "Pay rent before due date", category: "Personal" },
        { pattern: "ELECTRICITY", text: "Pay electricity bill", category: "Personal" },
        { pattern: "INTERNET", text: "Pay internet bill", category: "Personal" },
        { pattern: "COOK", text: "Cook a simple meal", category: "Personal" },
        { pattern: "DISHES", text: "Wash the dishes", category: "Personal" },
        { pattern: "ROOM", text: "Organize the room", category: "Personal" },
        { pattern: "WARDROBE", text: "Organize wardrobe", category: "Personal" },
        { pattern: "CAR", text: "Check car service needs", category: "Personal" },
        { pattern: "BIKE", text: "Check bike maintenance", category: "Personal" },
        { pattern: "PASSPORT", text: "Check passport or visa documents", category: "Personal" },
        { pattern: "VISA", text: "Prepare visa application documents", category: "Personal" },
        { pattern: "PACK", text: "Pack essentials for travel", category: "Personal" },
        { pattern: "HOTEL", text: "Confirm hotel booking", category: "Personal" },
        { pattern: "FLIGHT", text: "Check flight timing and documents", category: "Personal" },
        { pattern: "TRAIN", text: "Check train ticket and timing", category: "Personal" },
        { pattern: "EVENT", text: "Prepare for upcoming event", category: "Personal" },
        { pattern: "GIFT", text: "Choose and buy a thoughtful gift", category: "Personal" },
        { pattern: "FRIEND", text: "Reconnect with a friend", category: "Personal" },
        { pattern: "FOCUS", text: "Do one focused deep work session", category: "Work" },
        { pattern: "PRIORITY", text: "Pick the top priority task", category: "Personal" },
        { pattern: "MORNING", text: "Complete morning routine", category: "Personal" },
        { pattern: "NIGHT", text: "Complete night routine", category: "Personal" },
        { pattern: "BREAKFAST", text: "Prepare breakfast", category: "Personal" },
        { pattern: "LUNCH", text: "Plan or pack lunch", category: "Personal" },
        { pattern: "DINNER", text: "Prepare dinner", category: "Personal" },
        { pattern: "SNACKS", text: "Prepare healthy snacks", category: "Health" },
        { pattern: "VEGETABLES", text: "Buy fresh vegetables", category: "Personal" },
        { pattern: "MILK", text: "Buy milk and daily essentials", category: "Personal" },
        { pattern: "PHARMACY", text: "Pick up medicines from pharmacy", category: "Health" },
        { pattern: "APPOINTMENT", text: "Confirm upcoming appointment", category: "Personal" },
        { pattern: "SALON", text: "Book salon appointment", category: "Personal" },
        { pattern: "HAIRCUT", text: "Schedule haircut", category: "Personal" },
        { pattern: "WASH", text: "Wash pending clothes", category: "Personal" },
        { pattern: "IRON", text: "Iron clothes for tomorrow", category: "Personal" },
        { pattern: "FOLD", text: "Fold and arrange clean clothes", category: "Personal" },
        { pattern: "BED", text: "Make the bed", category: "Personal" },
        { pattern: "FLOOR", text: "Clean the floor", category: "Personal" },
        { pattern: "DUST", text: "Dust shelves and desk", category: "Personal" },
        { pattern: "TRASH", text: "Take out the trash", category: "Personal" },
        { pattern: "GAS", text: "Check or book gas cylinder", category: "Personal" },
        { pattern: "WIFI", text: "Check WiFi or internet recharge", category: "Personal" },
        { pattern: "MOBILE", text: "Recharge mobile plan", category: "Personal" },
        { pattern: "RECHARGE", text: "Complete pending recharge", category: "Personal" },
        { pattern: "DELIVERY", text: "Track pending delivery", category: "Personal" },
        { pattern: "PACKAGE", text: "Pick up or track package", category: "Personal" },
        { pattern: "RETURN", text: "Return or exchange item", category: "Personal" },
        { pattern: "KEYS", text: "Keep keys and wallet ready", category: "Personal" },
        { pattern: "WALLET", text: "Check wallet and important cards", category: "Personal" },
        { pattern: "ID CARD", text: "Keep ID card ready", category: "Personal" },
        { pattern: "SCHOOL", text: "Prepare school or college bag", category: "Study" },
        { pattern: "BAG", text: "Pack bag for tomorrow", category: "Personal" },
        { pattern: "UNIFORM", text: "Keep uniform ready", category: "Personal" },
        { pattern: "PARENT", text: "Call or check in with parents", category: "Personal" },
        { pattern: "MOM", text: "Call mom", category: "Personal" },
        { pattern: "DAD", text: "Call dad", category: "Personal" },
        { pattern: "MARKET", text: "Visit market for essentials", category: "Personal" },
        { pattern: "ERRAND", text: "Finish pending errands", category: "Personal" },
        { pattern: "TODAY", text: "Plan today's main tasks", category: "Personal" },
        { pattern: "TOMORROW", text: "Prepare tomorrow's task list", category: "Personal" },
        { pattern: "WEEKEND", text: "Plan weekend activities", category: "Personal" },
        { pattern: "MONTHLY", text: "Review monthly responsibilities", category: "Personal" },
        { pattern: "SUBSCRIPTION", text: "Review active subscriptions", category: "Personal" },
        { pattern: "CAR WASH", text: "Schedule car wash", category: "Personal" },
        { pattern: "FUEL", text: "Refill fuel", category: "Personal" },
        { pattern: "PARKING", text: "Check parking payment or pass", category: "Personal" },
        { pattern: "REPAIR", text: "Schedule repair work", category: "Personal" },
        { pattern: "PLUMBER", text: "Call plumber for repair", category: "Personal" },
        { pattern: "ELECTRICIAN", text: "Call electrician for repair", category: "Personal" },
        { pattern: "AC", text: "Schedule AC service", category: "Personal" },
        { pattern: "FRIDGE", text: "Clean or check fridge items", category: "Personal" },
        { pattern: "PLANTS", text: "Water the plants", category: "Personal" },
        { pattern: "WINDOW", text: "Clean windows", category: "Personal" },
    ];

    try {
        const response = await fetch("aiml-suggestions.xml");
        const xmlText = await response.text();
        const xml = new DOMParser().parseFromString(xmlText, "application/xml");

        aimlSuggestionRules = [...xml.querySelectorAll("category")]
            .map((category) => ({
                pattern: category.querySelector("pattern")?.textContent?.trim().toUpperCase(),
                text: category.querySelector("template")?.textContent?.trim(),
                category: category.querySelector("categoryName")?.textContent?.trim() || "Personal",
            }))
            .filter((rule) => rule.pattern && rule.text);
    } catch (error) {
        aimlSuggestionRules = fallbackRules;
    }

    if (!aimlSuggestionRules.length) {
        aimlSuggestionRules = fallbackRules;
    }
}

function getTaskSuggestions(value = "") {
    const input = value.toUpperCase();
    if (!input.trim()) return [];

    return aimlSuggestionRules
        .filter((rule) => aimlPatternMatches(input, rule.pattern))
        .filter((rule, index, rules) =>
            rules.findIndex((item) => item.text === rule.text) === index
        )
        .slice(0, 4);
}

function aimlPatternMatches(input, pattern) {
    const normalizedInput = input.replace(/[^A-Z0-9\s]/g, " ");
    const normalizedPattern = pattern.replace(/[^A-Z0-9\s*]/g, " ").trim();

    if (normalizedPattern.includes("*")) {
        const expression = normalizedPattern
            .split("*")
            .map((part) => part.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join(".*");

        return new RegExp(expression).test(normalizedInput);
    }

    return normalizedInput.split(/\s+/).includes(normalizedPattern) ||
        normalizedInput.includes(normalizedPattern);
}

function renderSuggestions(suggestions) {
    const suggestionBox = document.getElementById("suggestionBox");

    if (!suggestions.length) {
        suggestionBox.classList.remove("active");
        suggestionBox.innerHTML = "";
        return;
    }

    suggestionBox.innerHTML = suggestions.map((suggestion) => `
        <button type="button" class="suggestion-item" data-title="${escapeHTML(suggestion.text)}" data-category="${suggestion.category}">
            ${escapeHTML(suggestion.text)}
        </button>
    `).join("");

    suggestionBox.classList.add("active");
    suggestionBox.querySelectorAll(".suggestion-item").forEach((button) => {
        button.addEventListener("click", () => {
            taskTitleInput.value = button.dataset.title;
            taskCategoryInput.value = button.dataset.category;
            suggestionBox.classList.remove("active");
            showToast("Suggestion applied");
        });
    });
}

function closeTaskModal() {
    taskModal.classList.remove("active");
    const suggestionBox = document.getElementById("suggestionBox");
    if (suggestionBox) suggestionBox.classList.remove("active");
}

function setFormLoading(isLoading) {
    const submitButton = taskForm.querySelector(".add-btn");
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? "Adding..." : "Add Task";
}

function showTaskState(message) {
    taskList.innerHTML = `<div class="task-state">${escapeHTML(message)}</div>`;
}

function ensureToast() {
    if (document.getElementById("toast")) return;

    const toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
}

function showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    toast.classList.remove("error");
    if (type === "error") toast.classList.add("error");
    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

function debounce(callback, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => callback(...args), delay);
    };
}

window.toggleTask = toggleTask;
window.deleteTask = deleteTask;
window.searchTasks = (value = "") => {
    searchTerm = value;
    loadTasks();
};

loadTasks();
startSessionTimer();
