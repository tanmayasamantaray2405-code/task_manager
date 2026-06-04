const express = require("express");
const {
  addTask,
  getTask,
  getTasks,
  getTaskHistory,
  getUpcomingReminders,
  getActivityLog,
  getAnalytics,
  getProductivity,
  exportTaskReport,
  updateTask,
  deleteTask,
} = require("../controllers/taskController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.route("/").get(getTasks).post(addTask);
router.get("/analytics", getAnalytics);
router.get("/productivity", getProductivity);
router.get("/export", exportTaskReport);
router.get("/history", getTaskHistory);
router.get("/reminders", getUpcomingReminders);
router.get("/activity", getActivityLog);
router.route("/:id").get(getTask).put(updateTask).delete(deleteTask);

module.exports = router;
