const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();
}

const API_URL = "https://esy-earn-bd.onrender.com";

let user = null;
let isAuthenticated = false;

// Verify Telegram user with backend
async function authenticateTelegram() {
    if (!tg || !tg.initData) {
        console.warn("Open ESY EARN BD from Telegram.");
        return;
    }

    try {
        const response = await fetch(
            `${API_URL}/api/auth/telegram`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    initData: tg.initData
                })
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error("Telegram verification failed.");
        }

        user = result.user;
        isAuthenticated = true;

        updateUserProfile();

    } catch (error) {
        console.error("Authentication error:", error);
        alert("Login verification failed. Please reopen the app from Telegram.");
    }
}

// Update user information after verification
function updateUserProfile() {
    if (!user || !isAuthenticated) return;

    const fullName = user.first_name || "ESY EARN BD User";

    const username = user.username
        ? "@" + user.username
        : "Telegram User";

    document.getElementById("userName").textContent = fullName;
    document.getElementById("userUsername").textContent = username;
    document.getElementById("profileName").textContent = fullName;
    document.getElementById("profileUsername").textContent = username;

    const referralCode = document.getElementById("referralCode");
    referralCode.textContent = "ESY" + user.id;
}

// Page Navigation
const pages = document.querySelectorAll(".page");

function showPage(pageId) {
    pages.forEach(page => {
        page.style.display = "none";
    });

    const page = document.getElementById(pageId);

    if (page) {
        page.style.display = "block";
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

function showDashboard() {
    showPage("dashboardPage");
}

// Dashboard Menu
document.getElementById("primeJobBtn").onclick =
    () => showPage("primeJobPage");

document.getElementById("microjobBtn").onclick =
    () => showPage("microjobPage");

document.getElementById("freeJobBtn").onclick =
    () => showPage("freeJobPage");

document.getElementById("depositBtn").onclick =
    () => showPage("depositPage");

document.getElementById("withdrawBtn").onclick =
    () => showPage("withdrawPage");

document.getElementById("referBtn").onclick =
    () => showPage("referPage");

// Bottom Navigation
document.getElementById("homeNav").onclick = showDashboard;

document.getElementById("jobsNav").onclick =
    () => showPage("freeJobPage");

document.getElementById("walletNav").onclick =
    () => showPage("withdrawPage");

document.getElementById("profileNav").onclick =
    () => showPage("profilePage");

// Back Buttons
document.querySelectorAll(".backBtn").forEach(button => {
    button.onclick = showDashboard;
});

// Notifications
document.getElementById("notificationBtn").onclick = () => {
    alert("No new notifications.");
};

// Deposit Form (Demo only)
document.getElementById("depositForm").onsubmit = function(event) {
    event.preventDefault();

    const method = document.getElementById("depositMethod").value;
    const amount = Number(document.getElementById("depositAmount").value);
    const transactionId =
        document.getElementById("depositTransactionId").value.trim();

    if (!method || amount <= 0 || !transactionId) {
        alert("Please enter valid deposit details.");
        return;
    }

    alert(
        "Deposit request prepared!\n" +
        "Method: " + method +
        "\nAmount: ৳" + amount +
        "\nTransaction ID: " + transactionId +
        "\n\nDeposit backend is not connected yet."
    );

    this.reset();
};

// Withdraw Form (Demo only)
document.getElementById("withdrawForm").onsubmit = function(event) {
    event.preventDefault();

    const method = document.getElementById("withdrawMethod").value;
    const account = document.getElementById("withdrawAccount").value.trim();
    const amount = Number(document.getElementById("withdrawAmount").value);

    if (!method || !account || amount <= 0) {
        alert("Please enter valid withdrawal details.");
        return;
    }

    alert(
        "Withdrawal request prepared!\n" +
        "Method: " + method +
        "\nAccount: " + account +
        "\nAmount: ৳" + amount +
        "\n\nWithdrawal backend is not connected yet."
    );

    this.reset();
};

// Copy Referral
document.getElementById("copyReferralBtn").onclick = async () => {
    const code = document.getElementById("referralCode").textContent;

    try {
        await navigator.clipboard.writeText(code);
        alert("Referral code copied!");
    } catch {
        alert("Your referral code: " + code);
    }
};

// Share Referral
document.getElementById("shareReferralBtn").onclick = () => {
    const code = document.getElementById("referralCode").textContent;

    const message =
        "Join ESY EARN BD using my referral code: " + code;

    if (tg) {
        tg.openTelegramLink(
            "https://t.me/share/url?url=" +
            encodeURIComponent(message)
        );
    } else {
        alert(message);
    }
};

// Demo Task Buttons
[
    "primeTaskOneBtn",
    "primeTaskTwoBtn",
    "microTaskOneBtn",
    "microTaskTwoBtn",
    "freeTaskOneBtn",
    "freeTaskTwoBtn"
].forEach(id => {
    const button = document.getElementById(id);

    if (button) {
        button.onclick = () => {
            alert(
                "Task details and submission system " +
                "will be connected with the backend later."
            );
        };
    }
});

// Initial Page
showDashboard();

// Start Telegram verification
authenticateTelegram();
