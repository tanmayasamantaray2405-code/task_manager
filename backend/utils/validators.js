const isValidEmail = (email = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim().toLowerCase());

const normalizeEmail = (email = "") => String(email).trim().toLowerCase();

const isStrongEnoughPassword = (password = "") => String(password).length >= 6;

module.exports = {
  isValidEmail,
  normalizeEmail,
  isStrongEnoughPassword,
};
