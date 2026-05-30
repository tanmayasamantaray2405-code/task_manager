const mongoose = require("mongoose");
const Task = require("../models/Task");

const allowedStatuses = ["Pending", "Completed"];
const allowedPriorities = ["Low", "Medium", "High"];
const allowedCategories = ["Work", "Study", "Personal", "Health"];
const allowedRecurrenceTypes = ["None", "Daily", "Weekly", "Monthly"];

const isValidDate = (value) => {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
};

const escapeRegExp = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const toDateKey = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().split("T")[0];
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  next.setHours(0, 0, 0, 0);
  return next;
};

const isScheduledForDate = (task, value = new Date()) => {
  if (!task.isRecurring || task.recurrenceType === "None") return false;

  const target = new Date(value);
  const anchor = new Date(task.dueDate || task.createdAt);
  target.setHours(0, 0, 0, 0);
  anchor.setHours(0, 0, 0, 0);

  if (target < anchor) return false;
  if (task.recurrenceType === "Daily") return true;
  if (task.recurrenceType === "Weekly") return target.getDay() === anchor.getDay();
  if (task.recurrenceType === "Monthly") return target.getDate() === anchor.getDate();

  return false;
};

const getScheduledDateKeys = (task, through = new Date()) => {
  const keys = [];
  const cursor = new Date(task.dueDate || task.createdAt);
  const end = new Date(through);
  cursor.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (!task.isRecurring || cursor > end) return keys;

  while (cursor <= end) {
    if (isScheduledForDate(task, cursor)) keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
};

const recalculateRecurringStats = (task) => {
  if (!task.isRecurring) return;

  const todayKey = toDateKey();
  const scheduledKeys = getScheduledDateKeys(task);
  const completedKeys = new Set(
    task.completionHistory
      .filter((entry) => entry.status === "Completed")
      .map((entry) => entry.dateKey)
  );

  let currentStreak = 0;
  let longestStreak = 0;
  let runningStreak = 0;

  scheduledKeys.forEach((dateKey) => {
    if (completedKeys.has(dateKey)) {
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
      if (dateKey <= todayKey) currentStreak = runningStreak;
      return;
    }

    runningStreak = 0;
    if (dateKey <= todayKey) currentStreak = 0;
  });

  const completedEntries = task.completionHistory
    .filter((entry) => entry.status === "Completed" && entry.completedAt)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  task.totalCompletions = completedKeys.size;
  task.streak = currentStreak;
  task.longestStreak = longestStreak;
  task.lastCompletedAt = completedEntries[0]?.completedAt || null;
};

const syncRecurringTaskForToday = async (task) => {
  if (!task.isRecurring) return task;

  recalculateRecurringStats(task);

  const todayKey = toDateKey();
  const todaysEntry = task.completionHistory.find((entry) => entry.dateKey === todayKey);
  const isDueToday = isScheduledForDate(task);

  if (isDueToday) {
    task.status = todaysEntry?.status === "Completed" ? "Completed" : "Pending";
    task.completedAt = todaysEntry?.status === "Completed" ? todaysEntry.completedAt : null;
  }

  if (task.isModified()) await task.save();
  return task;
};

const syncRecurringTasks = async (tasks) => {
  await Promise.all(tasks.map((task) => syncRecurringTaskForToday(task)));
  return tasks;
};

const getMissedDays = (task) => {
  if (!task.isRecurring) return 0;

  const todayKey = toDateKey();
  const completedKeys = new Set(
    task.completionHistory
      .filter((entry) => entry.status === "Completed")
      .map((entry) => entry.dateKey)
  );

  return getScheduledDateKeys(task)
    .filter((dateKey) => dateKey < todayKey && !completedKeys.has(dateKey))
    .length;
};

const getRecurringCompletionPercentage = (task) => {
  if (!task.isRecurring) return null;

  const scheduledCount = getScheduledDateKeys(task).length;
  if (!scheduledCount) return 0;

  return Math.round((task.totalCompletions / scheduledCount) * 100);
};

const formatReportDateTime = (value) => {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not available";

  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
};

const csvValue = (value = "") => `"${String(value).replace(/"/g, '""')}"`;

const calculateTaskMetrics = (tasks) => {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.status === "Completed").length;
  const pendingTasks = totalTasks - completedTasks;
  const overdueTasks = tasks.filter((task) =>
    task.status !== "Completed" && task.dueDate && new Date(task.dueDate) < startOfToday()
  ).length;
  const highPriorityTasks = tasks.filter((task) => task.priority === "High").length;
  const completedHighPriorityTasks = tasks.filter((task) =>
    task.priority === "High" && task.status === "Completed"
  ).length;
  const recurringTasks = tasks.filter((task) => task.isRecurring).length;
  const recurringCompletions = tasks.reduce((total, task) =>
    total + (task.isRecurring ? task.totalCompletions || 0 : 0), 0);
  const completionRate = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const highPriorityCompletionRate = highPriorityTasks
    ? Math.round((completedHighPriorityTasks / highPriorityTasks) * 100)
    : 0;

  const overduePenalty = totalTasks ? Math.min(30, Math.round((overdueTasks / totalTasks) * 30)) : 0;
  const routineBonus = Math.min(10, recurringCompletions);
  const score = Math.max(0, Math.min(100,
    Math.round((completionRate * 0.5) + (highPriorityCompletionRate * 0.3) + routineBonus + 10 - overduePenalty)
  ));

  const productivityLevel = score >= 85
    ? "Excellent"
    : score >= 70
      ? "Good"
      : score >= 50
        ? "Average"
        : "Needs Improvement";

  return {
    totalTasks,
    completedTasks,
    pendingTasks,
    overdueTasks,
    highPriorityTasks,
    recurringTasks,
    recurringCompletions,
    completionRate,
    highPriorityCompletionRate,
    score,
    productivityLevel,
  };
};

const buildAnalyticsPayload = (tasks) => {
  const metrics = calculateTaskMetrics(tasks);
  const tasksByCategory = allowedCategories.reduce((payload, category) => {
    payload[category] = tasks.filter((task) => task.category === category).length;
    return payload;
  }, {});

  const recentActivity = [...tasks]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, 5)
    .map((task) => ({
      id: task._id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      category: task.category,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
      isRecurring: task.isRecurring,
      streak: task.streak,
    }));

  const performanceInsights = [
    `${metrics.completionRate}% of tasks are complete.`,
    metrics.overdueTasks
      ? `${metrics.overdueTasks} task${metrics.overdueTasks === 1 ? " is" : "s are"} overdue.`
      : "No overdue tasks right now.",
    metrics.highPriorityTasks
      ? `${metrics.highPriorityCompletionRate}% of high-priority tasks are complete.`
      : "No high-priority tasks have been created yet.",
    metrics.recurringTasks
      ? `${metrics.recurringTasks} recurring routine task${metrics.recurringTasks === 1 ? " is" : "s are"} active.`
      : "No recurring routine tasks have been added yet.",
  ];

  return {
    ...metrics,
    tasksByCategory,
    recentActivity,
    performanceInsights,
    recurringSummary: tasks
      .filter((task) => task.isRecurring)
      .map((task) => ({
        id: task._id,
        title: task.title,
        recurrenceType: task.recurrenceType,
        status: task.status,
        streak: task.streak || 0,
        longestStreak: task.longestStreak || 0,
        totalCompletions: task.totalCompletions || 0,
        missedDays: getMissedDays(task),
        completionPercentage: getRecurringCompletionPercentage(task),
        lastCompletedAt: task.lastCompletedAt,
      })),
  };
};

const buildCsvReport = (tasks) => {
  const header = [
    "Task Title",
    "Category",
    "Priority",
    "Status",
    "Recurrence",
    "Created Date & Time",
    "Completed Date & Time",
    "Total Completions",
    "Current Streak",
  ];

  const rows = tasks.map((task) => [
    task.title,
    task.category,
    task.priority,
    task.status,
    task.isRecurring ? task.recurrenceType : "One Time",
    formatReportDateTime(task.createdAt),
    formatReportDateTime(task.isRecurring ? task.lastCompletedAt : task.completedAt),
    task.isRecurring ? task.totalCompletions || 0 : task.status === "Completed" ? 1 : 0,
    task.isRecurring ? task.streak || 0 : "",
  ]);

  return [header, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");
};

const buildPdfReport = (tasks) => {
  const lines = [
    "TaskMaster Task History Report",
    `Generated: ${formatReportDateTime(new Date())}`,
    "",
    ...tasks.flatMap((task, index) => [
      `${index + 1}. ${task.title}`,
      `Category: ${task.category} | Priority: ${task.priority} | Status: ${task.status}`,
      `Recurrence: ${task.isRecurring ? task.recurrenceType : "One Time"} | Streak: ${task.isRecurring ? task.streak || 0 : "N/A"}`,
      `Created: ${formatReportDateTime(task.createdAt)}`,
      `Completed: ${formatReportDateTime(task.isRecurring ? task.lastCompletedAt : task.completedAt)}`,
      "",
    ]),
  ];

  const escapePdfText = (value) =>
    String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const linesPerPage = 48;
  const pages = [];

  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }

  const pageRefs = pages.map((_, index) => `${4 + (index * 2)} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  pages.forEach((pageLines, index) => {
    const pageObjectId = 4 + (index * 2);
    const contentObjectId = pageObjectId + 1;
    const content = [
      "BT",
      "/F1 11 Tf",
      "50 780 Td",
      "14 TL",
      ...pageLines.map((line) => `(${escapePdfText(line)}) Tj T*`),
      "ET",
    ].join("\n");

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
    );
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf);
};

const addTask = async (req, res, next) => {
  try {
    const {
      title,
      taskName,
      description = "",
      status = "Pending",
      priority = "Medium",
      category = "Personal",
      dueDate,
      date,
      recurrenceType = "None",
      isRecurring,
    } = req.body;

    const rawTaskTitle = title || taskName;
    const taskTitle = typeof rawTaskTitle === "string" ? rawTaskTitle.trim() : "";
    const taskDescription = typeof description === "string" ? description.trim() : "";
    const taskDueDate = dueDate || date;

    if (!taskTitle) {
      res.status(400);
      throw new Error("Task title cannot be empty");
    }

    if (!taskDueDate) {
      res.status(400);
      throw new Error("Due date is required");
    }

    if (!isValidDate(taskDueDate)) {
      res.status(400);
      throw new Error("Invalid due date");
    }

    if (!allowedStatuses.includes(status)) {
      res.status(400);
      throw new Error("Invalid task status");
    }

    if (!allowedPriorities.includes(priority)) {
      res.status(400);
      throw new Error("Invalid task priority");
    }

    if (!allowedCategories.includes(category)) {
      res.status(400);
      throw new Error("Invalid task category");
    }

    if (!allowedRecurrenceTypes.includes(recurrenceType)) {
      res.status(400);
      throw new Error("Invalid recurrence type");
    }

    const recurring = Boolean(isRecurring) || recurrenceType !== "None";
    const normalizedRecurrenceType = recurring
      ? recurrenceType === "None" ? "Daily" : recurrenceType
      : "None";

    const task = await Task.create({
      userId: req.user._id,
      title: taskTitle,
      description: taskDescription,
      status,
      priority,
      category,
      dueDate: taskDueDate,
      completedAt: !recurring && status === "Completed" ? new Date() : null,
      isRecurring: recurring,
      recurrenceType: normalizedRecurrenceType,
      completionHistory: recurring && status === "Completed"
        ? [{ dateKey: toDateKey(), status: "Completed", completedAt: new Date() }]
        : [],
    });

    if (task.isRecurring) {
      recalculateRecurringStats(task);
      await task.save();
    }

    res.status(201).json({
      success: true,
      message: "Task added successfully",
      task,
    });
  } catch (error) {
    next(error);
  }
};

const getTasks = async (req, res, next) => {
  try {
    const { search, status, priority, category, sortBy = "createdAt", sortOrder = "desc" } = req.query;
    const query = { userId: req.user._id };

    if (status && allowedStatuses.includes(status)) query.status = status;
    if (priority && allowedPriorities.includes(priority)) query.priority = priority;
    if (category && allowedCategories.includes(category)) query.category = category;
    if (search) {
      query.$or = [
        { title: { $regex: escapeRegExp(search), $options: "i" } },
        { description: { $regex: escapeRegExp(search), $options: "i" } },
      ];
    }

    const allowedSortFields = ["createdAt", "updatedAt", "dueDate", "priority", "status", "category"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const tasks = await Task.find(query).sort({ [sortField]: sortDirection });
    await syncRecurringTasks(tasks);
    const visibleTasks = tasks.filter((task) =>
      !task.isRecurring || task.recurrenceType === "None" || isScheduledForDate(task)
    );

    res.status(200).json({
      success: true,
      count: visibleTasks.length,
      tasks: visibleTasks,
    });
  } catch (error) {
    next(error);
  }
};

const getAnalytics = async (req, res, next) => {
  try {
    const tasks = await Task.find({ userId: req.user._id }).sort({ updatedAt: -1 });
    await syncRecurringTasks(tasks);

    res.status(200).json({
      success: true,
      analytics: buildAnalyticsPayload(tasks),
    });
  } catch (error) {
    next(error);
  }
};

const getProductivity = async (req, res, next) => {
  try {
    const tasks = await Task.find({ userId: req.user._id });
    await syncRecurringTasks(tasks);
    const metrics = calculateTaskMetrics(tasks);

    res.status(200).json({
      success: true,
      productivity: {
        score: metrics.score,
        level: metrics.productivityLevel,
        completionRate: metrics.completionRate,
        overdueTasks: metrics.overdueTasks,
        highPriorityCompletionRate: metrics.highPriorityCompletionRate,
        recurringTasks: metrics.recurringTasks,
        recurringCompletions: metrics.recurringCompletions,
      },
    });
  } catch (error) {
    next(error);
  }
};

const exportTaskReport = async (req, res, next) => {
  try {
    const format = String(req.query.format || "csv").toLowerCase();

    if (!["csv", "pdf"].includes(format)) {
      res.status(400);
      throw new Error("Invalid export format");
    }

    const tasks = await Task.find({ userId: req.user._id }).sort({ createdAt: -1 });
    await syncRecurringTasks(tasks);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="taskmaster-report-${timestamp}.csv"`);
      res.status(200).send(buildCsvReport(tasks));
      return;
    }

    const pdf = buildPdfReport(tasks);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="taskmaster-report-${timestamp}.pdf"`);
    res.status(200).send(pdf);
  } catch (error) {
    next(error);
  }
};

const getTask = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400);
      throw new Error("Invalid task ID");
    }

    const task = await Task.findOne({ _id: id, userId: req.user._id });

    if (!task) {
      res.status(404);
      throw new Error("Task not found");
    }

    await syncRecurringTaskForToday(task);

    res.status(200).json({
      success: true,
      task,
    });
  } catch (error) {
    next(error);
  }
};

const updateTask = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400);
      throw new Error("Invalid task ID");
    }

    const allowedFields = [
      "title",
      "description",
      "status",
      "priority",
      "category",
      "dueDate",
      "isRecurring",
      "recurrenceType",
    ];

    const updates = allowedFields.reduce((payload, field) => {
      if (req.body[field] !== undefined) payload[field] = req.body[field];
      return payload;
    }, {});

    if (req.body.taskName !== undefined) updates.title = req.body.taskName;
    if (req.body.date !== undefined) updates.dueDate = req.body.date;

    if (updates.title !== undefined) {
      if (typeof updates.title !== "string") {
        res.status(400);
        throw new Error("Task title must be text");
      }

      updates.title = updates.title.trim();
    }

    if (updates.description !== undefined) {
      if (typeof updates.description !== "string") {
        res.status(400);
        throw new Error("Task description must be text");
      }

      updates.description = updates.description.trim();
    }

    if (updates.status && !allowedStatuses.includes(updates.status)) {
      res.status(400);
      throw new Error("Invalid task status");
    }

    if (updates.priority && !allowedPriorities.includes(updates.priority)) {
      res.status(400);
      throw new Error("Invalid task priority");
    }

    if (updates.category && !allowedCategories.includes(updates.category)) {
      res.status(400);
      throw new Error("Invalid task category");
    }

    if (updates.recurrenceType && !allowedRecurrenceTypes.includes(updates.recurrenceType)) {
      res.status(400);
      throw new Error("Invalid recurrence type");
    }

    if (updates.isRecurring !== undefined && typeof updates.isRecurring !== "boolean") {
      res.status(400);
      throw new Error("Recurring flag must be true or false");
    }

    if (updates.title !== undefined && !updates.title) {
      res.status(400);
      throw new Error("Task title cannot be empty");
    }

    if (updates.dueDate !== undefined && !isValidDate(updates.dueDate)) {
      res.status(400);
      throw new Error("Invalid due date");
    }

    if (!Object.keys(updates).length) {
      res.status(400);
      throw new Error("No valid task updates provided");
    }

    const task = await Task.findOne({ _id: id, userId: req.user._id });

    if (!task) {
      res.status(404);
      throw new Error("Task not found");
    }

    if (updates.recurrenceType && updates.recurrenceType !== "None") {
      updates.isRecurring = true;
    }

    if (updates.isRecurring === false) {
      updates.recurrenceType = "None";
    }

    const willBeRecurring = updates.isRecurring !== undefined ? updates.isRecurring : task.isRecurring;

    if (willBeRecurring && updates.status === "Completed") {
      const todayKey = toDateKey();
      const now = new Date();
      const historyIndex = task.completionHistory.findIndex((entry) => entry.dateKey === todayKey);

      if (historyIndex >= 0) {
        task.completionHistory[historyIndex].status = "Completed";
        task.completionHistory[historyIndex].completedAt = now;
      } else {
        task.completionHistory.push({ dateKey: todayKey, status: "Completed", completedAt: now });
      }

      updates.completedAt = now;
      delete updates.status;
    } else if (willBeRecurring && updates.status === "Pending") {
      const todayKey = toDateKey();
      const historyIndex = task.completionHistory.findIndex((entry) => entry.dateKey === todayKey);

      if (historyIndex >= 0) {
        task.completionHistory[historyIndex].status = "Pending";
        task.completionHistory[historyIndex].completedAt = null;
      }

      updates.completedAt = null;
      delete updates.status;
    } else if (updates.status === "Completed" && task.status !== "Completed") {
      updates.completedAt = new Date();
    }

    if (!willBeRecurring && updates.status === "Pending") {
      updates.completedAt = null;
    }

    Object.assign(task, updates);
    if (task.isRecurring) recalculateRecurringStats(task);
    await task.save();
    await syncRecurringTaskForToday(task);

    res.status(200).json({
      success: true,
      message: "Task updated successfully",
      task,
    });
  } catch (error) {
    next(error);
  }
};

const deleteTask = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400);
      throw new Error("Invalid task ID");
    }

    const task = await Task.findOne({ _id: id, userId: req.user._id });

    if (!task) {
      res.status(404);
      throw new Error("Task not found");
    }

    await task.deleteOne();

    res.status(200).json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addTask,
  getTasks,
  getTask,
  getAnalytics,
  getProductivity,
  exportTaskReport,
  updateTask,
  deleteTask,
};
