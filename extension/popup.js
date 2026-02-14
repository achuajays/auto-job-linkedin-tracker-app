/* ================================================
   Job Tracker Popup — Logic
   Shows setup screen if no URL saved,
   otherwise shows connected status + dashboard link
   ================================================ */

document.addEventListener("DOMContentLoaded", () => {
    const setupView = document.getElementById("setup-view");
    const connectedView = document.getElementById("connected-view");
    const urlSetupInput = document.getElementById("api-url-setup");
    const urlEditInput = document.getElementById("api-url-edit");
    const displayUrl = document.getElementById("display-url");
    const dashboardLink = document.getElementById("dashboard-link");
    const saveBtn = document.getElementById("save-btn");
    const editUrlBtn = document.getElementById("edit-url-btn");
    const editSection = document.getElementById("edit-section");
    const updateBtn = document.getElementById("update-btn");
    const cancelBtn = document.getElementById("cancel-btn");

    // ---------- Load state ----------

    chrome.storage.sync.get(["apiBaseUrl"], (result) => {
        if (result.apiBaseUrl) {
            showConnected(result.apiBaseUrl);
        } else {
            showSetup();
        }
    });

    // ---------- Setup: Save URL ----------

    saveBtn.addEventListener("click", () => {
        const url = urlSetupInput.value.trim().replace(/\/+$/, "");
        if (!url) {
            urlSetupInput.style.borderColor = "#E87171";
            urlSetupInput.focus();
            return;
        }
        chrome.storage.sync.set({ apiBaseUrl: url }, () => {
            showConnected(url);
        });
    });

    // Enter key support
    urlSetupInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") saveBtn.click();
    });

    // ---------- Connected: Edit URL ----------

    editUrlBtn.addEventListener("click", () => {
        chrome.storage.sync.get(["apiBaseUrl"], (result) => {
            urlEditInput.value = result.apiBaseUrl || "";
            editSection.style.display = "flex";
            editUrlBtn.style.display = "none";
            urlEditInput.focus();
        });
    });

    updateBtn.addEventListener("click", () => {
        const url = urlEditInput.value.trim().replace(/\/+$/, "");
        if (!url) {
            urlEditInput.style.borderColor = "#E87171";
            urlEditInput.focus();
            return;
        }
        chrome.storage.sync.set({ apiBaseUrl: url }, () => {
            showConnected(url);
            editSection.style.display = "none";
            editUrlBtn.style.display = "";
        });
    });

    cancelBtn.addEventListener("click", () => {
        editSection.style.display = "none";
        editUrlBtn.style.display = "";
    });

    urlEditInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") updateBtn.click();
        if (e.key === "Escape") cancelBtn.click();
    });

    // ---------- View helpers ----------

    function showSetup() {
        setupView.style.display = "block";
        connectedView.style.display = "none";
        urlSetupInput.focus();
    }

    function showConnected(url) {
        setupView.style.display = "none";
        connectedView.style.display = "block";
        displayUrl.textContent = url;
        dashboardLink.href = url;
    }
});
