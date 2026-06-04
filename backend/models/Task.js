const mongoose = require("mongoose");

const completionHistorySchema = new mongoose.Schema(
  {
    dateKey: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Completed", "Missed"],
      default: "Pending",
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const taskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Completed"],
      default: "Pending",
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    category: {
      type: String,
      default: "Personal",
      trim: true,
      maxlength: 40,
    },
    dueDate: {
      type: Date,
      required: [true, "Due date is required"],
    },
    completedAt: {
      type: Date,
      default: null,
    },
    recurring: {
      type: Boolean,
      default: false,
      index: true,
    },
    isRecurring: {
      type: Boolean,
      default: false,
      index: true,
    },
    recurrenceType: {
      type: String,
      enum: ["None", "Daily", "Weekly", "Monthly"],
      default: "None",
    },
    streak: {
      type: Number,
      default: 0,
      min: 0,
    },
    longestStreak: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalCompletions: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastCompletedAt: {
      type: Date,
      default: null,
    },
    reminderTime: {
      type: Date,
      default: null,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    completionHistory: {
      type: [completionHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

taskSchema.index({ userId: 1, status: 1, deletedAt: 1, dueDate: 1 });
taskSchema.index({ userId: 1, completedAt: -1 });
taskSchema.index({ userId: 1, category: 1, priority: 1 });

module.exports = mongoose.model("Task", taskSchema);
