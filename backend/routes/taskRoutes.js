const express = require("express");
const {
  addTask,
  getTask,
  getTasks,
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
router.route("/:id").get(getTask).put(updateTask).delete(deleteTask);

module.exports = router;
