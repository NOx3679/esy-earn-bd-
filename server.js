const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();
}

const API_URL = "https://esy-earn-bd.onrender.com";

let user = null;
let isAuthenticated = false;
let availablePaymentMethods = [];
let referralLink = "";
let referralCode = "";

function formatMoney(amount) {
    const value = Number(amount);
    return (Number.isFinite(value) ? value : 0).toFixed(2);
}

function setMessage(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.style.color = isError ? "#ff8b8b" : "";
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

// ========================================
// TELEGRAM AUTHENTICATION
// ========================================

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

        // Authentication শেষ হলে Referral তথ্য লোড হবে
        loadReferralDetails();

    } catch (error) {
        console.error("Authentication error:", error);
        alert("Login verification failed. Please reopen the app from Telegram.");
    }
}

// ========================================
// USER PROFILE
// ========================================

function updateUserProfile() {
    if (!user || !isAuthenticated) return;

    const fullName = [user.first_name, user.last_name]
        .filter(Boolean).join(" ") || "ESY EARN BD User";

    const username = user.username
        ? "@" + user.username
        : "Telegram User";

    const userNameElement = document.getElementById("userName");
    const usernameElement = document.getElementById("userUsername");
    const profileNameElement = document.getElementById("profileName");
    const profileUsernameElement = document.getElementById("profileUsername");

    if (userNameElement) userNameElement.textContent = fullName;
    if (usernameElement) usernameElement.textContent = username;
    if (profileNameElement) profileNameElement.textContent = fullName;
    if (profileUsernameElement) profileUsernameElement.textContent = username;
}

function updateWallet(wallet) {
    if (!wallet) return;

    const balanceElement = document.getElementById("balance");
    const earningsElement = document.getElementById("totalEarnings");
    const todayElement = document.getElementById("todayEarnings");

    if (balanceElement) {
        balanceElement.textContent = formatMoney(wallet.balance);
    }

    if (earningsElement) {
        earningsElement.textContent = formatMoney(wallet.total_earnings);
    }

    if (todayElement) {
        todayElement.textContent = "0.00";
    }
}

// ========================================
// REFERRAL SYSTEM
// ========================================

function showReferralLink() {
    const codeElement = document.getElementById("referralCode");

    if (codeElement) {
        codeElement.textContent = referralCode || "লোড হচ্ছে...";
    }

    // Referral link দেখানোর জায়গা তৈরি
    let linkElement = document.getElementById("referralLink");

    if (!linkElement && codeElement) {
        linkElement = document.createElement("div");
        linkElement.id = "referralLink";
        linkElement.style.cssText = `
            word-break: break-all;
            padding: 12px;
            margin-top: 12px;
            border-radius: 10px;
            background: rgba(255,255,255,0.08);
            font-size: 13px;
            line-height: 1.6;
        `;

        codeElement.insertAdjacentElement("afterend", linkElement);
    }

    if (linkElement) {
        linkElement.textContent = referralLink || "Referral link লোড হচ্ছে...";
    }
}

async function loadReferralDetails() {
    if (!tg || !tg.initData) {
        console.warn("Telegram login required for referrals.");
        return;
    }

    if (!isAuthenticated) return;

    const codeElement = document.getElementById("referralCode");
    if (codeElement) codeElement.textContent = "লোড হচ্ছে...";

    try {
        const response = await fetch(`${API_URL}/api/referrals/me`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                initData: tg.initData
            }),
            cache: "no-store"
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "Referral information could not be loaded."
            );
        }

        referralCode = result.referralCode || "";
        referralLink = result.referralLink || "";

        showReferralLink();

        const totalElement = document.getElementById("totalInvited");
        const successfulElement = document.getElementById("successfulReferrals");
        const earningsElement = document.getElementById("referralEarnings");

        if (totalElement) {
            totalElement.textContent = Number(result.totalInvited || 0);
        }

        if (successfulElement) {
            successfulElement.textContent =
                Number(result.successfulReferrals || 0);
        }

        if (earningsElement) {
            earningsElement.textContent =
                formatMoney(result.referralEarnings || 0);
        }

    } catch (error) {
        console.error("Referral loading error:", error);

        if (codeElement) {
            codeElement.textContent = "লোড করা যায়নি";
        }

        const linkElement = document.getElementById("referralLink");

        if (linkElement) {
            linkElement.textContent =
                "Referral তথ্য পাওয়া যায়নি। আবার চেষ্টা করুন।";
        }
    }
}

// Referral Link Copy
const copyReferralButton = document.getElementById("copyReferralBtn");

if (copyReferralButton) {
    copyReferralButton.onclick = async () => {
        if (!referralLink) {
            alert("আগে Referral Link লোড হতে দিন।");
            await loadReferralDetails();
            return;
        }

        try {
            await navigator.clipboard.writeText(referralLink);
            alert("সম্পূর্ণ Referral Link কপি হয়েছে!");
        } catch (error) {
            alert("আপনার Referral Link:\n" + referralLink);
        }
    };
}

// Referral Link Share
const shareReferralButton = document.getElementById("shareReferralBtn");

if (shareReferralButton) {
    shareReferralButton.onclick = () => {
        if (!referralLink) {
            alert("Referral Link এখনো লোড হয়নি।");
            return;
        }

        const message =
            "Join ESY EARN BD using my referral link:\n" + referralLink;

        const shareURL =
            "https://t.me/share/url?url=" +
            encodeURIComponent(referralLink) +
            "&text=" +
            encodeURIComponent("Join ESY EARN BD using my referral link!");

        if (tg && typeof tg.openTelegramLink === "function") {
            tg.openTelegramLink(shareURL);
        } else {
            window.open(shareURL, "_blank");
        }
    };
}

// ========================================
// PAYMENT SETTINGS
// ========================================

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

    const selected = availablePaymentMethods.find(
        item => item.method === method
    );

    if (!infoBox) return;

    if (!selected) {
        infoBox.innerHTML =
            '<p class="payment-info-muted">এই মুহূর্তে কোনো পেমেন্ট মেথড নির্বাচন করা হয়নি।</p>';
        return;
    }

    const accountNumber = String(
        selected.account_number || ""
    ).trim();

    const instructions = String(
        selected.instructions || ""
    ).trim();

    if (!accountNumber) {
        infoBox.innerHTML = `
            <strong>${escapeHTML(method)} নম্বর</strong>
            <p class="payment-info-warning">
                অ্যাডমিন এখনো এই মেথডের পেমেন্ট নম্বর সেট করেননি।
                অনুগ্রহ করে পরে চেষ্টা করুন।
            </p>
        `;
        return;
    }

    infoBox.innerHTML = `
        <strong>${escapeHTML(method)}-তে টাকা পাঠান</strong>
        <div class="payment-receiver-number">
            ${escapeHTML(accountNumber)}
        </div>
        <button type="button"
            id="copyPaymentNumberBtn"
            class="copy-payment-number">
            নম্বর কপি করুন
        </button>
        <p class="payment-info-instructions">
            ${escapeHTML(
                instructions ||
                "উপরের নম্বরে টাকা পাঠিয়ে নিচের ফর্ম পূরণ করুন।"
            )}
        </p>
    `;

    const copyButton = document.getElementById(
        "copyPaymentNumberBtn"
    );

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

async function loadPaymentSettings() {
    const methodSelect = document.getElementById("depositMethod");
    const messageElement = document.getElementById("depositMessage");

    if (!methodSelect) return;

    methodSelect.disabled = true;
    methodSelect.innerHTML =
        '<option value="">পেমেন্ট মেথড লোড হচ্ছে...</option>';

    try {
        const response = await fetch(
            `${API_URL}/api/payment-settings`,
            {
                method: "GET",
                cache: "no-store"
            }
        );

        const result = await response.json();

        if (!response.ok || result.success === false) {
            throw new Error(
                result.message || "Payment settings could not be loaded."
            );
        }

        const allowed = ["bKash", "Nagad", "Rocket"];

        availablePaymentMethods = getPaymentSettingsRows(result)
            .map(item => ({
                method: String(item.method || item.name || ""),
                account_number: item.account_number || "",
                instructions: item.instructions || "",
                enabled: item.enabled !== false
            }))
            .filter(item =>
                allowed.includes(item.method) && item.enabled
            );

        methodSelect.innerHTML =
            '<option value="">Select Method</option>';

        availablePaymentMethods.forEach(item => {
            const option = document.createElement("option");
            option.value = item.method;
            option.textContent = item.method;
            methodSelect.appendChild(option);
        });

        if (availablePaymentMethods.length === 0) {
            methodSelect.innerHTML =
                '<option value="">No payment method available</option>';

            setMessage(
                messageElement,
                "বর্তমানে কোনো Deposit Method চালু নেই। পরে আবার চেষ্টা করুন।",
                true
            );
        } else {
            setMessage(messageElement, "");
        }

        showPaymentInfo(methodSelect.value);

    } catch (error) {
        console.error("Payment settings error:", error);

        methodSelect.innerHTML =
            '<option value="">পেমেন্ট মেথড লোড হয়নি</option>';

        setMessage(
            messageElement,
            "পেমেন্ট তথ্য লোড করা যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।",
            true
        );

        const infoBox = document.getElementById(
            "paymentInstructions"
        );

        if (infoBox) {
            infoBox.innerHTML =
                '<p class="payment-info-warning">সার্ভার থেকে পেমেন্ট তথ্য পাওয়া যায়নি। অনুগ্রহ করে পরে আবার চেষ্টা করুন।</p>';
        }

    } finally {
        methodSelect.disabled = false;
    }
}

// ========================================
// TRANSACTION HISTORY
// ========================================

function transactionTypeLabel(type) {
    const labels = {
        deposit: "Deposit / টাকা জমা",
        withdraw: "Withdraw / টাকা উত্তোলন",
        earning: "Task Earning / কাজের আয়",
        referral: "Referral Reward / রেফারেল আয়"
    };

    return labels[type] || "Transaction";
}

function transactionStatusLabel(status) {
    const labels = {
        pending: "অপেক্ষমাণ",
        approved: "অনুমোদিত",
        rejected: "বাতিল",
        completed: "সম্পন্ন"
    };

    return labels[status] || status || "অজানা";
}

async function loadTransactionHistory() {
    const list = document.getElementById("transactionList");

    if (!list) return;

    if (!tg || !tg.initData) {
        list.innerHTML =
            '<p class="payment-info-warning">Transaction History দেখতে Telegram থেকে অ্যাপটি খুলুন।</p>';
        return;
    }

    if (!isAuthenticated) {
        list.innerHTML =
            "<p>Login verification চলছে। একটু অপেক্ষা করুন...</p>";
        return;
    }

    list.innerHTML = "<p>লেনদেনের তথ্য লোড হচ্ছে...</p>";

    try {
        const response = await fetch(
            `${API_URL}/api/transactions`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    initData: tg.initData
                }),
                cache: "no-store"
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "লেনদেনের তথ্য লোড করা যায়নি।"
            );
        }

        const transactions = Array.isArray(result.transactions)
            ? result.transactions
            : [];

        if (transactions.length === 0) {
            list.innerHTML =
                '<div class="task-card"><p>এখনো কোনো লেনদেন পাওয়া যায়নি।</p></div>';
            return;
        }

        list.innerHTML = transactions.map(item => {
            const amount = formatMoney(item.amount);

            const date = item.created_at
                ? new Date(item.created_at).toLocaleString("bn-BD", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                })
                : "তারিখ পাওয়া যায়নি";

            const method = item.payment_method
                ? `<p>মেথড: ${escapeHTML(item.payment_method)}</p>`
                : "";

            const reference = item.reference_id
                ? `<p>রেফারেন্স: ${escapeHTML(item.reference_id)}</p>`
                : "";

            return `
                <div class="task-card transaction-card">
                    <div class="transaction-heading">
                        <strong>
                            ${escapeHTML(
                                transactionTypeLabel(item.transaction_type)
                            )}
                        </strong>
                        <strong>৳${escapeHTML(amount)}</strong>
                    </div>

                    <p>
                        স্ট্যাটাস:
                        ${escapeHTML(
                            transactionStatusLabel(item.status)
                        )}
                    </p>

                    ${method}
                    ${reference}

                    <small>${escapeHTML(date)}</small>
                </div>
            `;
        }).join("");

    } catch (error) {
        console.error("Transaction history error:", error);

        list.innerHTML = `
            <div class="task-card">
                <p class="payment-info-warning">
                    ${escapeHTML(
                        error.message ||
                        "লেনদেনের তথ্য লোড করা যায়নি।"
                    )}
                </p>
                <button type="button" id="retryHistoryBtn">
                    আবার চেষ্টা করুন
                </button>
            </div>
        `;

        const retryButton = document.getElementById(
            "retryHistoryBtn"
        );

        if (retryButton) {
            retryButton.onclick = loadTransactionHistory;
        }
    }
}

// ========================================
// PAGE NAVIGATION
// ========================================

const pages = document.querySelectorAll(".page");

function showPage(pageId) {
    pages.forEach(page => {
        page.style.display = "none";
    });

    const page = document.getElementById(pageId);

    if (page) {
        page.style.display = "block";
    }

    if (pageId === "depositPage") {
        loadPaymentSettings();
    }

    if (pageId === "historyPage") {
        loadTransactionHistory();
    }

    if (pageId === "referPage") {
        loadReferralDetails();
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

function showDashboard() {
    showPage("dashboardPage");
}

// ========================================
// DASHBOARD MENU
// ========================================

const menuButtons = {
    primeJobBtn: "primeJobPage",
    microjobBtn: "microjobPage",
    freeJobBtn: "freeJobPage",
    depositBtn: "depositPage",
    withdrawBtn: "withdrawPage",
    referBtn: "referPage",
    historyBtn: "historyPage"
};

Object.entries(menuButtons).forEach(([buttonId, pageId]) => {
    const button = document.getElementById(buttonId);

    if (button) {
        button.onclick = () => showPage(pageId);
    }
});

// ========================================
// BOTTOM NAVIGATION
// ========================================

const bottomNavigation = {
    homeNav: showDashboard,
    jobsNav: () => showPage("freeJobPage"),
    walletNav: () => showPage("withdrawPage"),
    profileNav: () => showPage("profilePage")
};

Object.entries(bottomNavigation).forEach(([buttonId, action]) => {
    const button = document.getElementById(buttonId);

    if (button) {
        button.onclick = action;
    }
});

// ========================================
// BACK BUTTONS
// ========================================

document.querySelectorAll(".backBtn").forEach(button => {
    button.onclick = showDashboard;
});

// ========================================
// NOTIFICATIONS
// ========================================

const notificationButton = document.getElementById(
    "notificationBtn"
);

if (notificationButton) {
    notificationButton.onclick = () => {
        alert("No new notifications.");
    };
}

// ========================================
// DEPOSIT METHOD CHANGE
// ========================================

const depositMethodSelect = document.getElementById(
    "depositMethod"
);

if (depositMethodSelect) {
    depositMethodSelect.addEventListener("change", event => {
        showPaymentInfo(event.target.value);
    });
}

// ========================================
// DEPOSIT FORM
// ========================================

const depositForm = document.getElementById("depositForm");

if (depositForm) {
    depositForm.onsubmit = async function(event) {
        event.preventDefault();

        const messageElement = document.getElementById(
            "depositMessage"
        );

        const submitButton = document.getElementById(
            "depositSubmitBtn"
        );

        if (!tg || !tg.initData) {
            setMessage(
                messageElement,
                "Please open the app from Telegram.",
                true
            );
            return;
        }

        if (!isAuthenticated || !user) {
            setMessage(
                messageElement,
                "Please wait. Login verification is in progress.",
                true
            );
            return;
        }

        const method = document.getElementById(
            "depositMethod"
        ).value;

        const amount = Number(
            document.getElementById("depositAmount").value
        );

        const accountNumber = document.getElementById(
            "depositAccountNumber"
        ).value.trim();

        const transactionId = document.getElementById(
            "depositTransactionId"
        ).value.trim();

        const selectedMethod = availablePaymentMethods.find(
            item => item.method === method
        );

        if (
            !selectedMethod ||
            !String(selectedMethod.account_number || "").trim()
        ) {
            setMessage(
                messageElement,
                "এই পেমেন্ট মেথডের নম্বর সেট করা হয়নি অথবা মেথডটি বন্ধ আছে।",
                true
            );
            return;
        }

        if (
            !method ||
            !Number.isFinite(amount) ||
            amount < 1 ||
            amount > 1000000 ||
            Math.round(amount * 100) !== amount * 100 ||
            accountNumber.length < 5 ||
            transactionId.length < 4
        ) {
            setMessage(
                messageElement,
                "Please enter valid deposit details.",
                true
            );
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";

        setMessage(messageElement, "");

        try {
            const response = await fetch(
                `${API_URL}/api/deposit`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        initData: tg.initData,
                        amount,
                        payment_method: method,
                        account_number: accountNumber,
                        reference_id: transactionId
                    })
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "Deposit request failed."
                );
            }

            setMessage(
                messageElement,
                "Deposit request submitted successfully! Status: Pending Approval."
            );

            this.reset();
            showPaymentInfo("");

            if (tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred("success");
            }

            alert(
                "Deposit request submitted successfully!\n\n" +
                "Amount: ৳" +
                formatMoney(result.transaction?.amount ?? amount) +
                "\nMethod: " +
                (result.transaction?.payment_method || method) +
                "\nStatus: Pending Approval\n\n" +
                "Admin will review your payment."
            );

        } catch (error) {
            console.error("Deposit error:", error);

            setMessage(
                messageElement,
                error.message || "Deposit request failed.",
                true
            );

            if (tg?.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred("error");
            }

        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Submit Deposit";
        }
    };
}

// ========================================
// WITHDRAWAL FORM
// ========================================

const withdrawForm = document.getElementById("withdrawForm");

if (withdrawForm) {
    withdrawForm.onsubmit = async function(event) {
        event.preventDefault();

        const messageElement = document.getElementById(
            "withdrawMessage"
        );

        const submitButton = document.getElementById(
            "withdrawSubmitBtn"
        );

        if (!tg || !tg.initData) {
            setMessage(
                messageElement,
                "Telegram থেকে অ্যাপটি খুলুন।",
                true
            );
            return;
        }

        if (!isAuthenticated || !user) {
            setMessage(
                messageElement,
                "Login verification চলছে। একটু অপেক্ষা করুন।",
                true
            );
            return;
        }

        const method = document.getElementById(
            "withdrawMethod"
        ).value;

        const account = document.getElementById(
            "withdrawAccount"
        ).value.trim();

        const amount = Number(
            document.getElementById("withdrawAmount").value
        );

        if (!["bKash", "Nagad", "Rocket"].includes(method)) {
            setMessage(
                messageElement,
                "সঠিক Payment Method নির্বাচন করুন।",
                true
            );
            return;
        }

        if (
            !Number.isFinite(amount) ||
            amount < 1 ||
            amount > 1000000 ||
            Math.round(amount * 100) !== amount * 100 ||
            account.length < 5 ||
            account.length > 100
        ) {
            setMessage(
                messageElement,
                "সঠিক Account Number এবং Amount দিন।",
                true
            );
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";

        setMessage(messageElement, "");

        try {
            const response = await fetch(
                `${API_URL}/api/withdraw`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        initData: tg.initData,
                        amount,
                        payment_method: method,
                        account_number: account
                    })
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "Withdrawal request failed."
                );
            }

            if (result.wallet) {
                updateWallet(result.wallet);
            }

            setMessage(
                messageElement,
                "Withdrawal Request সফলভাবে জমা হয়েছে। Admin যাচাই করার পর পেমেন্ট সম্পন্ন হবে।"
            );

            const transaction = result.transaction || {};

            this.reset();

            if (tg?.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred("success");
            }

            alert(
                "Withdrawal request submitted!\n\n" +
                "Amount: ৳" +
                formatMoney(transaction.amount ?? amount) +
                "\nMethod: " +
                (transaction.payment_method || method) +
                "\nStatus: Pending Approval\n\n" +
                "Admin review করার পর পেমেন্ট সম্পন্ন হবে।"
            );

        } catch (error) {
            console.error("Withdrawal error:", error);

            setMessage(
                messageElement,
                error.message || "Withdrawal request failed.",
                true
            );

            if (tg?.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred("error");
            }

        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Submit Withdrawal";
        }
    };
}

// ========================================
// DEMO TASK BUTTONS
// ========================================

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
                "Task details and submission system will be connected with the backend later."
            );
        };
    }
});

// ========================================
// INITIAL PAGE AND STARTUP
// ========================================

showDashboard();

loadPaymentSettings();

authenticateTelegram();
