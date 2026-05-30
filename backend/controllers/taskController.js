const mongoose = require("mongoose");
const Task = require("../models/Task");

const allowedStatuses = ["Pending", "Completed"];
const allowedPriorities = ["Low", "Medium", "High"];
const allowedCategories = ["Work", "Study", "Personal", "Health"];

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
    } = req.body;

    const taskTitle = title || taskName;
    const taskDueDate = dueDate || date;

    if (!taskTitle || !taskTitle.trim()) {
      res.status(400);
      throw new Error("Task title cannot be empty");
    }

    if (!taskDueDate) {
      res.status(400);
      throw new Error("Due date is required");
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

    const task = await Task.create({
      userId: req.user._id,
      title: taskTitle.trim(),
      description: description.trim(),
      status,
      priority,
      category,
      dueDate: taskDueDate,
    });

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
    const { search, status, priority, category } = req.query;
    const query = { userId: req.user._id };

    if (status && allowedStatuses.includes(status)) query.status = status;
    if (priority && allowedPriorities.includes(priority)) query.priority = priority;
    if (category && allowedCategories.includes(category)) query.category = category;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const tasks = await Task.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: tasks.length,
      tasks,
    });
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
    ];

    const updates = allowedFields.reduce((payload, field) => {
      if (req.body[field] !== undefined) payload[field] = req.body[field];
      return payload;
    }, {});

    if (req.body.taskName !== undefined) updates.title = req.body.taskName;
    if (req.body.date !== undefined) updates.dueDate = req.body.date;

    if (updates.title !== undefined) updates.title = updates.title.trim();
    if (updates.description !== undefined) updates.description = updates.description.trim();

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

    if (updates.title !== undefined && !updates.title) {
      res.status(400);
      throw new Error("Task title cannot be empty");
    }

    const task = await Task.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      updates,
      { new: true, runValidators: true }
    );

    if (!task) {
      res.status(404);
      throw new Error("Task not found");
    }

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
  updateTask,
  deleteTask,
};
