const express = require("express");
const {
  addTask,
  getTask,
  getTasks,
  updateTask,
  deleteTask,
} = require("../controllers/taskController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.route("/").get(getTasks).post(addTask);
router.route("/:id").get(getTask).put(updateTask).delete(deleteTask);

module.exports = router;
