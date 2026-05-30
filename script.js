// script.js

document.addEventListener("DOMContentLoaded", () => {
    const API_BASE_URL = "http://localhost:5000/api";

    // =========================================
    // THEME
    // =========================================

    const html = document.documentElement;
    const savedTheme = localStorage.getItem("theme") || "dark";

    html.setAttribute("data-theme", savedTheme);

    const themeToggleBtn = document.getElementById("themeToggleBtnAuth");

    if (themeToggleBtn) {
        const icon = themeToggleBtn.querySelector("i");

        updateThemeIcon(savedTheme);

        themeToggleBtn.addEventListener("click", () => {
            const currentTheme = html.getAttribute("data-theme");
            const newTheme = currentTheme === "dark" ? "light" : "dark";

            html.setAttribute("data-theme", newTheme);
            localStorage.setItem("theme", newTheme);

            updateThemeIcon(newTheme);
        });

        function updateThemeIcon(theme) {
            if (theme === "light") {
                icon.classList.remove("fa-moon");
                icon.classList.add("fa-sun");
            } else {
                icon.classList.remove("fa-sun");
                icon.classList.add("fa-moon");
            }
        }
    }

    // =========================================
    // AUTH CARD FLIP
    // =========================================

    const authCardInner = document.getElementById("authCardInner");
    const flipToSignIn = document.getElementById("flipToSignIn");
    const flipToSignUp = document.getElementById("flipToSignUp");

    if (flipToSignIn) {
        flipToSignIn.addEventListener("click", (e) => {
            e.preventDefault();
            authCardInner.classList.add("flipped");
        });
    }

    if (flipToSignUp) {
        flipToSignUp.addEventListener("click", (e) => {
            e.preventDefault();
            authCardInner.classList.remove("flipped");
        });
    }

    // =========================================
    // PASSWORD TOGGLE
    // =========================================

    document.querySelectorAll(".toggle-password").forEach((icon) => {
        icon.addEventListener("click", () => {
            const input = icon.parentElement.querySelector("input");

            if (input.type === "password") {
                input.type = "text";
                icon.classList.replace("fa-eye", "fa-eye-slash");
            } else {
                input.type = "password";
                icon.classList.replace("fa-eye-slash", "fa-eye");
            }
        });
    });

    // =========================================
    // SOCIAL LOGIN
    // =========================================

    document.querySelectorAll(".social-btn").forEach((button) => {
        button.addEventListener("click", () => {
            showToast("Social login coming soon");
        });
    });

    // =========================================
    // PASSWORD MATCH
    // =========================================

    const signupPassword = document.getElementById("signupPassword");
    const confirmPassword = document.getElementById("confirmPassword");
    const passwordError = document.getElementById("passwordError");

    if (signupPassword && confirmPassword) {
        const validatePasswords = () => {
            if (confirmPassword.value === "") {
                confirmPassword.style.borderColor = "";
                passwordError.textContent = "";
                return;
            }

            if (signupPassword.value === confirmPassword.value) {
                confirmPassword.style.borderColor = "#10b981";
                passwordError.style.color = "#10b981";
                passwordError.textContent = "Passwords match";
            } else {
                confirmPassword.style.borderColor = "#ef4444";
                passwordError.style.color = "#ef4444";
                passwordError.textContent = "Passwords do not match";
            }
        };

        signupPassword.addEventListener("input", validatePasswords);
        confirmPassword.addEventListener("input", validatePasswords);
    }

    // =========================================
    // SIGNUP
    // =========================================

    const signupForm = document.getElementById("signupForm");

    if (signupForm) {
        signupForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const name = document.getElementById("signupName").value.trim();
            const email = document.getElementById("signupEmail").value.trim();
            const password = signupPassword.value;
            const confirm = confirmPassword.value;
            const signupError = document.getElementById("signupError");
            const signupSuccess = document.getElementById("signupSuccess");

            signupError.textContent = "";
            signupSuccess.textContent = "";

            if (!name || !email || !password || !confirm) {
                signupError.textContent = "Please fill in all fields";
                return;
            }

            if (password !== confirm) {
                passwordError.textContent = "Passwords do not match";
                return;
            }

            try {
                const data = await request("/auth/signup", {
                    method: "POST",
                    body: JSON.stringify({ name, email, password, confirmPassword: confirm }),
                });

                saveSession(data);
                showToast("Account created successfully");
                signupSuccess.textContent = "Account created successfully";
                signupForm.reset();

                setTimeout(() => {
                    window.location.href = "dashboard.html";
                }, 900);
            } catch (error) {
                signupError.textContent = error.message;
                showToast(error.message, "error");
            }
        });
    }

    // =========================================
    // LOGIN
    // =========================================

    const loginForm = document.getElementById("loginForm");

    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const email = document.getElementById("loginEmail").value.trim();
            const password = document.getElementById("loginPassword").value;
            const loginError = document.getElementById("loginError");

            loginError.textContent = "";

            try {
                const data = await request("/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ email, password }),
                });

                saveSession(data);
                showToast("Login successful");
                loginForm.reset();
                setTimeout(() => {
                    window.location.href = "dashboard.html";
                }, 500);
            } catch (error) {
                loginError.textContent = error.message;
                showToast(error.message, "error");
            }
        });
    }

    async function request(path, options = {}) {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Request failed");
        }

        return data;
    }

    function saveSession(data) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("currentUser", JSON.stringify(data.user));
        localStorage.setItem("userName", data.user.name);
    }

    // =========================================
    // TOAST
    // =========================================

    function showToast(message, type = "success") {
        const toast = document.getElementById("toast");

        toast.classList.remove("error");
        if (type === "error") toast.classList.add("error");
        toast.textContent = message;
        toast.classList.add("show");

        setTimeout(() => {
            toast.classList.remove("show");
        }, 3000);
    }

    // =========================================
    // TYPING EFFECT
    // =========================================

    const tagline = document.getElementById("typingTagline");
    const description = document.getElementById("typingDescription");

    if (tagline) {
        const text1 = "Organize. Prioritize. Execute.";
        const text2 = "Simplify your workflow with futuristic task management.";
        let i = 0;

        function typeTagline() {
            if (i < text1.length) {
                tagline.textContent += text1.charAt(i);
                i++;
                setTimeout(typeTagline, 80);
            } else {
                let j = 0;

                function typeDesc() {
                    if (j < text2.length) {
                        description.textContent += text2.charAt(j);
                        j++;
                        setTimeout(typeDesc, 30);
                    }
                }

                typeDesc();
            }
        }

        typeTagline();
    }
});
