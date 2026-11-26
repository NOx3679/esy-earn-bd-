const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();
}

const API_URL = "https://esy-earn-bd.onrender.com";

let user = null;
let isAuthenticated = false;
let availablePaymentMethods = [];

function formatMoney(amount) {
    const value = Number(amount);
    return (Number.isFinite(value) ? value : 0).toFixed(2);
}

function setMessage(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.style.color = isError ? "#ff8b8b" : "";
}

async function authenticateTelegram() {
    if (!tg || !tg.initData) {
        console.warn("Open ESY EARN BD from Telegram.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/auth/telegram`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData: tg.initData })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || "Telegram verification failed.");
        }

        user = result.user;
        isAuthenticated = true;
        updateUserProfile();
        updateWallet(result.wallet);
    } catch (error) {
        console.error("Authentication error:", error);
        alert("Login verification failed. Please reopen the app from Telegram.");
    }
}

function updateUserProfile() {
    if (!user || !isAuthenticated) return;

    const fullName = [user.first_name, user.last_name]
        .filter(Boolean).join(" ") || "ESY EARN BD User";
    const username = user.username ? "@" + user.username : "Telegram User";

    document.getElementById("userName").textContent = fullName;
    document.getElementById("userUsername").textContent = username;
    document.getElementById("profileName").textContent = fullName;
    document.getElementById("profileUsername").textContent = username;
    document.getElementById("referralCode").textContent = "ESY" + user.id;
}

function updateWallet(wallet) {
    if (!wallet) return;
    document.getElementById("balance").textContent = formatMoney(wallet.balance);
    document.getElementById("totalEarnings").textContent = formatMoney(wallet.total_earnings);
    document.getElementById("todayEarnings").textContent = "0.00";
}

function getPaymentSettingsRows(result) {
    if (Array.isArray(result)) return result;

    const possibleLists = [
        result?.methods,
        result?.settings,
        result?.payment_settings,
        result?.paymentMethods,
        result?.data
    ];

    for (const list of possibleLists) {
        if (Array.isArray(list)) return list;
        if (list && typeof list === "object") {
            return Object.entries(list).map(([method, value]) => ({
                method,
                ...(value || {})
            }));
        }
    }
    return [];
}

function showPaymentInfo(method) {
    const infoBox = document.getElementById("paymentInstructions");
    const selected = availablePaymentMethods.find(item => item.method === method);
    if (!infoBox) return;

    if (!selected) {
        infoBox.innerHTML = '<p class="payment-info-muted">এই মুহূর্তে কোনো পেমেন্ট মেথড নির্বাচন করা হয়নি।</p>';
        return;
    }

    const accountNumber = String(selected.account_number || "").trim();
    const instructions = String(selected.instructions || "").trim();

    if (!accountNumber) {
        infoBox.innerHTML = `
            <strong>${escapeHTML(method)} নম্বর</strong>
            <p class="payment-info-warning">অ্যাডমিন এখনো এই মেথডের পেমেন্ট নম্বর সেট করেননি। অনুগ্রহ করে পরে চেষ্টা করুন।</p>
        `;
        return;
    }

    infoBox.innerHTML = `
        <strong>${escapeHTML(method)}-তে টাকা পাঠান</strong>
        <div class="payment-receiver-number">${escapeHTML(accountNumber)}</div>
        <button type="button" id="copyPaymentNumberBtn" class="copy-payment-number">নম্বর কপি করুন</button>
        <p class="payment-info-instructions">${escapeHTML(instructions || "উপরের নম্বরে টাকা পাঠিয়ে নিচের ফর্ম পূরণ করুন।")}</p>
    `;

    const copyButton = document.getElementById("copyPaymentNumberBtn");
    if (copyButton) {
        copyButton.onclick = async () => {
            try {
                await navigator.clipboard.writeText(accountNumber);
                copyButton.textContent = "কপি হয়েছে ✓";
            } catch {
                alert("Payment number: " + accountNumber);
            }
        };
    }
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

async function loadPaymentSettings() {
    const methodSelect = document.getElementById("depositMethod");
    const messageElement = document.getElementById("depositMessage");
    if (!methodSelect) return;

    methodSelect.disabled = true;
    methodSelect.innerHTML = '<option value="">পেমেন্ট মেথড লোড হচ্ছে...</option>';

    try {
        const response = await fetch(`${API_URL}/api/payment-settings`, {
            method: "GET",
            cache: "no-store"
        });
        const result = await response.json();

        if (!response.ok || result.success === false) {
            throw new Error(result.message || "Payment settings could not be loaded.");
        }

        const allowed = ["bKash", "Nagad", "Rocket"];
        availablePaymentMethods = getPaymentSettingsRows(result)
            .map(item => ({
                method: String(item.method || item.name || ""),
                account_number: item.account_number || "",
                instructions: item.instructions || "",
                enabled: item.enabled !== false
            }))
            .filter(item => allowed.includes(item.method) && item.enabled);

        methodSelect.innerHTML = '<option value="">Select Method</option>';

        availablePaymentMethods.forEach(item => {
            const option = document.createElement("option");
            option.value = item.method;
            option.textContent = item.method;
            methodSelect.appendChild(option);
        });

        if (availablePaymentMethods.length === 0) {
            methodSelect.innerHTML = '<option value="">No payment method available</option>';
            setMessage(messageElement, "বর্তমানে কোনো Deposit Method চালু নেই। পরে আবার চেষ্টা করুন।", true);
        } else {
            setMessage(messageElement, "");
        }

        showPaymentInfo(methodSelect.value);
    } catch (error) {
        console.error("Payment settings error:", error);
        methodSelect.innerHTML = '<option value="">পেমেন্ট মেথড লোড হয়নি</option>';
        setMessage(messageElement, "পেমেন্ট তথ্য লোড করা যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।", true);
        const infoBox = document.getElementById("paymentInstructions");
        if (infoBox) {
            infoBox.innerHTML = '<p class="payment-info-warning">সার্ভার থেকে পেমেন্ট তথ্য পাওয়া যায়নি। অনুগ্রহ করে পরে আবার চেষ্টা করুন।</p>';
        }
    } finally {
        methodSelect.disabled = false;
    }
}

// Page Navigation
const pages = document.querySelectorAll(".page");

function showPage(pageId) {
    pages.forEach(page => { page.style.display = "none"; });
    const page = document.getElementById(pageId);
    if (page) page.style.display = "block";

    if (pageId === "depositPage") loadPaymentSettings();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function showDashboard() {
    showPage("dashboardPage");
}

// Dashboard Menu
document.getElementById("primeJobBtn").onclick = () => showPage("primeJobPage");
document.getElementById("microjobBtn").onclick = () => showPage("microjobPage");
document.getElementById("freeJobBtn").onclick = () => showPage("freeJobPage");
document.getElementById("depositBtn").onclick = () => showPage("depositPage");
document.getElementById("withdrawBtn").onclick = () => showPage("withdrawPage");
document.getElementById("referBtn").onclick = () => showPage("referPage");

// Bottom Navigation
document.getElementById("homeNav").onclick = showDashboard;
document.getElementById("jobsNav").onclick = () => showPage("freeJobPage");
document.getElementById("walletNav").onclick = () => showPage("withdrawPage");
document.getElementById("profileNav").onclick = () => showPage("profilePage");

// Back Buttons
document.querySelectorAll(".backBtn").forEach(button => {
    button.onclick = showDashboard;
});

// Notifications
document.getElementById("notificationBtn").onclick = () => {
    alert("No new notifications.");
};

// Deposit method change
document.getElementById("depositMethod").addEventListener("change", event => {
    showPaymentInfo(event.target.value);
});

// Deposit Form
document.getElementById("depositForm").onsubmit = async function(event) {
    event.preventDefault();

    const messageElement = document.getElementById("depositMessage");
    const submitButton = document.getElementById("depositSubmitBtn");

    if (!tg || !tg.initData) {
        setMessage(messageElement, "Please open the app from Telegram.", true);
        return;
    }
    if (!isAuthenticated || !user) {
        setMessage(messageElement, "Please wait. Login verification is in progress.", true);
        return;
    }

    const method = document.getElementById("depositMethod").value;
    const amount = Number(document.getElementById("depositAmount").value);
    const accountNumber = document.getElementById("depositAccountNumber").value.trim();
    const transactionId = document.getElementById("depositTransactionId").value.trim();
    const selectedMethod = availablePaymentMethods.find(item => item.method === method);

    if (!selectedMethod || !String(selectedMethod.account_number || "").trim()) {
        setMessage(messageElement, "এই পেমেন্ট মেথডের নম্বর সেট করা হয়নি অথবা মেথডটি বন্ধ আছে।", true);
        return;
    }

    if (
        !method || !Number.isFinite(amount) || amount < 1 || amount > 1000000 ||
        Math.round(amount * 100) !== amount * 100 ||
        accountNumber.length < 5 || transactionId.length < 4
    ) {
        setMessage(messageElement, "Please enter valid deposit details.", true);
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";
    setMessage(messageElement, "");

    try {
        const response = await fetch(`${API_URL}/api/deposit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                initData: tg.initData,
                amount,
                payment_method: method,
                account_number: accountNumber,
                reference_id: transactionId
            })
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || "Deposit request failed.");
        }

        setMessage(messageElement, "Deposit request submitted successfully! Status: Pending Approval.");
        this.reset();
        showPaymentInfo("");

        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");

        alert(
            "Deposit request submitted successfully!\n\n" +
            "Amount: ৳" + formatMoney(result.transaction?.amount ?? amount) +
            "\nMethod: " + (result.transaction?.payment_method || method) +
            "\nStatus: Pending Approval\n\nAdmin will review your payment."
        );
    } catch (error) {
        console.error("Deposit error:", error);
        setMessage(messageElement, error.message || "Deposit request failed.", true);
        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("error");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Submit Deposit";
    }
};

// Withdrawal Form - Connected to Backend
document.getElementById("withdrawForm").onsubmit = async function(event) {
    event.preventDefault();

    const messageElement = document.getElementById("withdrawMessage");
    const submitButton = document.getElementById("withdrawSubmitBtn");

    if (!tg || !tg.initData) {
        setMessage(messageElement, "Telegram থেকে অ্যাপটি খুলুন।", true);
        return;
    }
    if (!isAuthenticated || !user) {
        setMessage(messageElement, "Login verification চলছে। একটু অপেক্ষা করুন।", true);
        return;
    }

    const method = document.getElementById("withdrawMethod").value;
    const account = document.getElementById("withdrawAccount").value.trim();
    const amount = Number(document.getElementById("withdrawAmount").value);

    if (!["bKash", "Nagad", "Rocket"].includes(method)) {
        setMessage(messageElement, "সঠিক Payment Method নির্বাচন করুন।", true);
        return;
    }
    if (
        !Number.isFinite(amount) || amount < 1 || amount > 1000000 ||
        Math.round(amount * 100) !== amount * 100 ||
        account.length < 5 || account.length > 100
    ) {
        setMessage(messageElement, "সঠিক Account Number এবং Amount দিন।", true);
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";
    setMessage(messageElement, "");

    try {
        const response = await fetch(`${API_URL}/api/withdraw`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                initData: tg.initData,
                amount,
                payment_method: method,
                account_number: account
            })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || "Withdrawal request failed.");
        }

        if (result.wallet) updateWallet(result.wallet);

        setMessage(
            messageElement,
            "Withdrawal Request সফলভাবে জমা হয়েছে। Admin যাচাই করার পর পেমেন্ট সম্পন্ন হবে।"
        );

        const transaction = result.transaction || {};
        this.reset();

        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");

        alert(
            "Withdrawal request submitted!\n\n" +
            "Amount: ৳" + formatMoney(transaction.amount ?? amount) +
            "\nMethod: " + (transaction.payment_method || method) +
            "\nStatus: Pending Approval\n\n" +
            "Admin review করার পর পেমেন্ট সম্পন্ন হবে।"
        );
    } catch (error) {
        console.error("Withdrawal error:", error);
        setMessage(messageElement, error.message || "Withdrawal request failed.", true);
        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("error");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Submit Withdrawal";
    }
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
    const message = "Join ESY EARN BD using my referral code: " + code;

    if (tg) {
        tg.openTelegramLink("https://t.me/share/url?url=" + encodeURIComponent(message));
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
            alert("Task details and submission system will be connected with the backend later.");
        };
    }
});

// Initial Page and startup
showDashboard();
loadPaymentSettings();
authenticateTelegram();
