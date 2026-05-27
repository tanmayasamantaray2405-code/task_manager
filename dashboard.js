const API_BASE_URL = "http://localhost:5000/api/tasks";
const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("currentUser") || "null");

if (!token || !user) {
    window.location.replace("auth.html");
}

const firstName = user?.name?.split(" ")[0] || "User";

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

const taskList = document.getElementById("taskList");
const taskModal = document.getElementById("taskModal");
const taskForm = document.getElementById("taskForm");

document.getElementById("newTaskBtn").onclick = () => {
    taskModal.classList.add("active");
};

document.getElementById("cancelTaskBtn").onclick = () => {
    taskModal.classList.remove("active");
};

taskModal.onclick = (e) => {
    if (e.target === taskModal) taskModal.classList.remove("active");
};

taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const task = {
        title: document.getElementById("taskTitle").value.trim(),
        description: document.getElementById("taskDescription").value.trim(),
        dueDate: document.getElementById("taskDate").value,
        priority: document.getElementById("taskPriority").value,
        category: document.getElementById("taskCategory").value,
    };

    if (!task.title) return;

    try {
        await apiRequest("", {
            method: "POST",
            body: JSON.stringify(task),
        });

        taskForm.reset();
        taskModal.classList.remove("active");
        await loadTasks();
    } catch (error) {
        alert(error.message);
    }
});

async function loadTasks(search = "") {
    try {
        const query = search ? `?search=${encodeURIComponent(search)}` : "";
        const data = await apiRequest(query);

        tasks = data.tasks.map(formatTaskForDashboard);
        renderTasks(currentFilter);
    } catch (error) {
        if (error.status === 401) {
            logout();
            return;
        }

        alert(error.message);
        tasks = [];
        renderTasks(currentFilter);
    }
}

function formatTaskForDashboard(task) {
    return {
        id: task._id,
        title: task.title,
        description: task.description,
        date: formatTaskDate(task.dueDate),
        priority: task.priority,
        category: task.category,
        completed: task.status === "Completed",
    };
}

function formatTaskDate(date) {
    if (!date) return "";
    return new Date(date).toISOString().split("T")[0];
}

function escapeHTML(value = "") {
    return value.replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
    }[character]));
}

function renderTasks(filter = "all") {
    taskList.innerHTML = "";

    let filtered = tasks;

    if (filter === "high") filtered = tasks.filter((task) => task.priority === "High");
    if (filter === "progress") filtered = tasks.filter((task) => !task.completed);
    if (filter === "completed") filtered = tasks.filter((task) => task.completed);

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
                <div class="task-date">Due: ${task.date}</div>
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
        await apiRequest(`/${id}`, {
            method: "PUT",
            body: JSON.stringify({
                status: task.completed ? "Pending" : "Completed",
            }),
        });

        await loadTasks();
    } catch (error) {
        alert(error.message);
    }
}

async function deleteTask(id) {
    try {
        await apiRequest(`/${id}`, {
            method: "DELETE",
        });

        await loadTasks();
    } catch (error) {
        alert(error.message);
    }
}

function updateStats() {
    totalTasks.textContent = tasks.length;
    completedTasks.textContent = tasks.filter((task) => task.completed).length;
    inProgressTasks.textContent = tasks.filter((task) => !task.completed).length;
    overdueTasks.textContent = tasks.filter((task) =>
        !task.completed && new Date(task.date) < new Date()
    ).length;
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

document.getElementById("logoutBtn").addEventListener("click", logout);

function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    localStorage.removeItem("userName");
    localStorage.removeItem("tasks");
    window.location.replace("auth.html");
}

let logoutTimer;
const SESSION_TIME = 10;

function startSessionTimer() {
    clearTimeout(logoutTimer);
    logoutTimer = setTimeout(() => {
        alert("Session expired! Please login again.");
        logout();
    }, SESSION_TIME * 60 * 1000);
}

function resetTimer() {
    startSessionTimer();
}

["click", "mousemove", "keypress", "scroll", "touchstart"].forEach((event) => {
    document.addEventListener(event, resetTimer);
});

document.getElementById("closeModalX").addEventListener("click", () => {
    document.getElementById("taskModal").classList.remove("active");
});

async function apiRequest(path = "", options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });

    const data = await response.json();

    if (!response.ok) {
        const error = new Error(data.message || "Request failed");
        error.status = response.status;
        throw error;
    }

    return data;
}

window.toggleTask = toggleTask;
window.deleteTask = deleteTask;
window.searchTasks = loadTasks;

loadTasks();
startSessionTimer();
