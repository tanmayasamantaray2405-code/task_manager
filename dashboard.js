const API_ROOT = "http://localhost:5000/api";
const TASKS_API_URL = `${API_ROOT}/tasks`;
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
let aimlSuggestionRules = [];

const taskList = document.getElementById("taskList");
const taskModal = document.getElementById("taskModal");
const taskForm = document.getElementById("taskForm");
const taskTitleInput = document.getElementById("taskTitle");
const taskDescriptionInput = document.getElementById("taskDescription");
const taskDateInput = document.getElementById("taskDate");
const taskPriorityInput = document.getElementById("taskPriority");
const taskCategoryInput = document.getElementById("taskCategory");

ensureToast();
createTaskControls();
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
        const params = new URLSearchParams();
        if (searchTerm) params.set("search", searchTerm);
        if (categoryFilter) params.set("category", categoryFilter);
        if (priorityFilter) params.set("priority", priorityFilter);
        if (statusFilter) params.set("status", statusFilter);

        const query = params.toString() ? `?${params.toString()}` : "";
        const data = await apiRequest(`${TASKS_API_URL}${query}`);

        tasks = data.tasks.map(formatTaskForDashboard);
        localStorage.setItem(backupKey, JSON.stringify(tasks));
        renderTasks(currentFilter);
    } catch (error) {
        if (error.status === 401) {
            logout("Session expired. Please login again.");
            return;
        }

        const cachedTasks = JSON.parse(localStorage.getItem(backupKey) || "[]");
        tasks = cachedTasks;
        renderTasks(currentFilter);
        showToast(`${error.message}. Showing local backup.`, "error");
    }
}

function formatTaskForDashboard(task) {
    return {
        id: task._id,
        title: task.title,
        description: task.description || "",
        date: formatTaskDate(task.dueDate),
        priority: task.priority,
        category: task.category,
        completed: task.status === "Completed",
        createdAt: task.createdAt,
    };
}

function formatTaskDate(date) {
    if (!date) return "";
    return new Date(date).toISOString().split("T")[0];
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

    let filtered = [...tasks];

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

    filtered.forEach((task) => {
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
                <div class="task-date">Due: ${task.date || "No date"} | ${escapeHTML(task.category)}</div>
            </div>
        </div>

        <div class="task-right">
            <span class="priority-badge ${task.priority.toLowerCase()}">
                ${task.priority}
            </span>
            <i class="fa-solid fa-trash" onclick="deleteTask('${task.id}')"></i>
        </div>
        `;

        taskList.appendChild(div);
    });

    updateStats();
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

    totalTasks.textContent = tasks.length;
    completedTasks.textContent = completed;
    inProgressTasks.textContent = pending;
    overdueTasks.textContent = tasks.filter((task) =>
        !task.completed && task.date && new Date(task.date) < startOfToday()
    ).length;
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
    `;

    taskListArea.insertBefore(tools, taskList);

    document.getElementById("taskSearchInput").addEventListener("input", debounce((event) => {
        searchTerm = event.target.value.trim();
        loadTasks();
    }, 300));

    document.getElementById("categoryFilter").addEventListener("change", (event) => {
        categoryFilter = event.target.value;
        loadTasks();
    });

    document.getElementById("priorityFilter").addEventListener("change", (event) => {
        priorityFilter = event.target.value;
        loadTasks();
    });

    document.getElementById("statusFilter").addEventListener("change", (event) => {
        statusFilter = event.target.value;
        loadTasks();
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
