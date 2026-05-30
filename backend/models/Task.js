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
      enum: ["Work", "Study", "Personal", "Health"],
      default: "Personal",
    },
    dueDate: {
      type: Date,
      required: [true, "Due date is required"],
    },
    completedAt: {
      type: Date,
      default: null,
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
    completionHistory: {
      type: [completionHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Task", taskSchema);
