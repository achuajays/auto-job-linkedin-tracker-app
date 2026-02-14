/* ================================================
   LinkedIn Job Tracker — Content Script
   Injects "Track Application" button on job pages
   and auto-scrapes + POSTs data to the backend.
   ================================================ */

(function () {
    "use strict";

    const BUTTON_ID = "jt-track-btn";
    const CHECK_INTERVAL = 2000;

    /** Get the saved API URL from chrome storage */
    async function getApiUrl() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(["apiBaseUrl"], (result) => {
                resolve(result.apiBaseUrl || "");
            });
        });
    }

    /** Scrape job details from the current LinkedIn job page */
    function scrapeJobData() {
        // Job title
        const titleEl =
            document.querySelector(".job-details-jobs-unified-top-card__job-title h1") ||
            document.querySelector(".jobs-unified-top-card__job-title") ||
            document.querySelector("h1.t-24") ||
            document.querySelector("h1");

        // Company name
        const companyEl =
            document.querySelector(".job-details-jobs-unified-top-card__company-name a") ||
            document.querySelector(".jobs-unified-top-card__company-name a") ||
            document.querySelector(".job-details-jobs-unified-top-card__company-name") ||
            document.querySelector(".jobs-unified-top-card__company-name");

        // Description
        const descEl =
            document.querySelector(".jobs-description__content .jobs-box__html-content") ||
            document.querySelector(".jobs-description-content__text") ||
            document.querySelector("#job-details");

        const job_title = titleEl ? titleEl.textContent.trim() : "Unknown Position";
        const company = companyEl ? companyEl.textContent.trim() : "";
        const fullDesc = descEl ? descEl.textContent.trim() : "";
        // Truncate description to first 200 chars
        const description = fullDesc.length > 200 ? fullDesc.substring(0, 200) + "…" : fullDesc;
        const url = window.location.href.split("?")[0];

        return { job_title, company, description, url };
    }

    /** Send job data to the backend */
    async function trackJob(button) {
        const apiUrl = await getApiUrl();
        if (!apiUrl) {
            showFeedback(button, "⚙️ Set API URL first", "warning");
            return;
        }

        const jobData = scrapeJobData();
        if (!jobData.job_title || jobData.job_title === "Unknown Position") {
            showFeedback(button, "⚠️ Can't read job", "warning");
            return;
        }

        // Disable button while sending
        button.disabled = true;
        button.textContent = "⏳ Saving...";

        try {
            const res = await fetch(`${apiUrl}/api/jobs`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(jobData),
            });

            if (res.ok) {
                showFeedback(button, "✅ Tracked!", "success");
                button.dataset.tracked = "true";
            } else {
                const err = await res.json().catch(() => ({}));
                showFeedback(button, "❌ Failed", "error");
                console.error("[JobTracker] API error:", err);
            }
        } catch (e) {
            showFeedback(button, "❌ No connection", "error");
            console.error("[JobTracker] Network error:", e);
        }
    }

    /** Show temporary feedback on the button */
    function showFeedback(button, text, type) {
        button.textContent = text;
        button.className = `jt-track-btn jt-${type}`;
        button.disabled = type === "success";

        if (type !== "success") {
            setTimeout(() => {
                button.textContent = "📋 Track Application";
                button.className = "jt-track-btn";
                button.disabled = false;
            }, 2500);
        }
    }

    /** Create the Track Application button */
    function createButton() {
        const btn = document.createElement("button");
        btn.id = BUTTON_ID;
        btn.className = "jt-track-btn";
        btn.textContent = "📋 Track Application";
        btn.addEventListener("click", () => trackJob(btn));
        return btn;
    }

    /** Find the Apply/Easy Apply buttons and inject our tracker */
    function injectButton() {
        // Find all potential apply buttons (both standard and Easy Apply)
        // IDs like 'jobs-apply-button-id' are common but non-unique on LinkedIn
        const applyButtons = document.querySelectorAll('.jobs-apply-button, [data-live-test-job-apply-button]');

        applyButtons.forEach(btn => {
            // Avoid duplicate injections
            if (btn.dataset.hasTrackButton === 'true') return;

            // Find the container to inject into
            // Priority: .jobs-s-apply (sidebar), .jobs-unified-top-card (main), or just parent
            const container = btn.closest('.jobs-s-apply, .jobs-unified-top-card__content--two-pane, .mt5, .display-flex') || btn.parentElement;

            if (!container) return;

            // Create a new button instance
            const trackBtn = createButton();

            // Insert after the apply button
            if (btn.nextSibling) {
                btn.parentNode.insertBefore(trackBtn, btn.nextSibling);
            } else {
                btn.parentNode.appendChild(trackBtn);
            }

            // Mark as injected
            btn.dataset.hasTrackButton = 'true';
        });
    }

    /** Watch for page changes (LinkedIn is an SPA) */
    function startObserver() {
        // Initial injection attempt
        injectButton();

        // Re-check periodically (LinkedIn re-renders often)
        setInterval(injectButton, CHECK_INTERVAL);

        // Also observe DOM mutations
        const observer = new MutationObserver(() => {
            injectButton();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    // Start when DOM is ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", startObserver);
    } else {
        startObserver();
    }
})();
