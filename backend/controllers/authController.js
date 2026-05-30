const jwt = require("jsonwebtoken");
const User = require("../models/User");
const {
  isStrongEnoughPassword,
  isValidEmail,
  normalizeEmail,
} = require("../utils/validators");

const createToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

const sendAuthResponse = (res, statusCode, user) => {
  res.status(statusCode).json({
    success: true,
    token: createToken(user._id),
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
    },
  });
};

const registerUser = async (req, res, next) => {
  try {
    const { name, password, confirmPassword } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!name || !email || !password) {
      res.status(400);
      throw new Error("Name, email and password are required");
    }

    if (!isValidEmail(email)) {
      res.status(400);
      throw new Error("Please enter a valid email address");
    }

    if (!isStrongEnoughPassword(password)) {
      res.status(400);
      throw new Error("Password must be at least 6 characters long");
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      res.status(400);
      throw new Error("Passwords do not match");
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      res.status(400);
      throw new Error("An account with this email already exists");
    }

    const user = await User.create({ name: name.trim(), email, password });
    sendAuthResponse(res, 201, user);
  } catch (error) {
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const { password } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!email || !password) {
      res.status(400);
      throw new Error("Email and password are required");
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.matchPassword(password))) {
      res.status(401);
      throw new Error("Invalid email or password");
    }

    user.lastLogin = new Date();
    user.loginHistory.push({ loggedInAt: user.lastLogin });
    await user.save();

    sendAuthResponse(res, 200, user);
  } catch (error) {
    next(error);
  }
};

const logoutUser = async (req, res) => {
  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
};
