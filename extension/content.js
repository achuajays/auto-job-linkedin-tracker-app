/* ================================================
   LinkedIn Job Tracker — Content Script
   Injects "Track Application" button on job pages
   and auto-scrapes + POSTs data to the backend.
   ================================================ */

(function () {
    "use strict";

    const BUTTON_ID_PREFIX = "jt-track-btn-";
    const PROCESSED_ATTR = "data-jt-processed";
    const DEBUG_MODE = true; // Enabled for better troubleshooting

    // Core selectors for the Apply button
    const APPLY_BTN_SELECTORS = [
        '.jobs-apply-button',
        '[data-live-test-job-apply-button]',
        '.jobs-apply-button--top-card',
        'button[aria-label^="Easy Apply"]',
        'button[aria-label^="Apply"]'
    ];

    // Priority containers to inject into (for better layout)
    const CONTAINER_SELECTORS = [
        '.jobs-s-apply',                // Sidebar
        '.jobs-unified-top-card__content--two-pane', // Main top card
        '.jobs-unified-top-card__actions-container', // New top card layout
        '.jobs-details__main-content', // Search results right rail
        '.jobs-search__job-details--container', // Search results container
        '.mt5',
        '.display-flex'
    ];

    let injectionTimeout = null;

    /** Logger helper */
    function log(msg, ...args) {
        if (DEBUG_MODE) console.log(`[JobTracker] ${msg}`, ...args);
    }

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
        // Job title - try specific right-rail selectors first
        const titleEl =
            document.querySelector(".job-details-jobs-unified-top-card__job-title h1") ||
            document.querySelector(".jobs-unified-top-card__job-title") ||
            document.querySelector(".job-details-jobs-unified-top-card__job-title") || // Search results right rail
            document.querySelector("h1.t-24") ||
            document.querySelector("h1");

        // Company name
        const companyEl =
            document.querySelector(".job-details-jobs-unified-top-card__company-name a") ||
            document.querySelector(".jobs-unified-top-card__company-name a") ||
            document.querySelector(".job-details-jobs-unified-top-card__company-name") || // Search results right rail
            document.querySelector(".jobs-unified-top-card__company-name");

        // Description
        const descEl =
            document.querySelector(".jobs-description__content .jobs-box__html-content") ||
            document.querySelector(".jobs-description-content__text") ||
            document.querySelector("#job-details");

        const job_title = titleEl ? titleEl.textContent.trim() : "Unknown Position";
        const company = companyEl ? companyEl.textContent.trim() : "Unknown Company";
        const fullDesc = descEl ? descEl.textContent.trim() : "";

        // Truncate description
        const description = fullDesc.length > 200 ? fullDesc.substring(0, 200) + "…" : fullDesc;

        // Improve URL capture for search results
        let url = window.location.href.split("?")[0];
        // If we represent a search result with a currentJobId, try to construct a direct link
        const urlParams = new URLSearchParams(window.location.search);
        const currentJobId = urlParams.get('currentJobId');
        if (currentJobId) {
            url = `https://www.linkedin.com/jobs/view/${currentJobId}/`;
        }

        return { job_title, company, description, url };
    }

    /** Send job data to the backend */
    async function trackJob(button) {
        const apiUrl = await getApiUrl();
        if (!apiUrl) {
            showFeedback(button, "⚙️ Set API URL", "warning");
            return;
        }

        const jobData = scrapeJobData();
        if (!jobData.job_title || jobData.job_title === "Unknown Position") {
            showFeedback(button, "⚠️ Can't read job", "warning");
            return;
        }

        // Disable button while sending
        button.disabled = true;
        button.originalText = button.innerHTML; // Save icon+text if present
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
            showFeedback(button, "❌ Error", "error");
            console.error("[JobTracker] Network error:", e);
        }
    }

    /** Show temporary feedback on the button */
    function showFeedback(button, text, type) {
        button.textContent = text;
        button.classList.add(`jt-${type}`);
        button.disabled = type === "success";

        if (type !== "success") {
            setTimeout(() => {
                button.innerHTML = button.originalHTML || '<span>+</span> Track';
                button.classList.remove(`jt-${type}`);
                button.disabled = false;
            }, 2500);
        }
    }

    /** Create the Track Application button */
    function createButton() {
        const uniqueId = BUTTON_ID_PREFIX + Math.random().toString(36).substr(2, 9);
        const btn = document.createElement("button");
        btn.id = uniqueId;
        btn.className = "jt-track-btn artdeco-button artdeco-button--2 artdeco-button--secondary"; // Mimic LinkedIn styles
        btn.innerHTML = '<span>+</span> Track'; // Add icon-like span
        btn.originalHTML = btn.innerHTML;
        btn.title = "Track this application in Job Tracker";
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            trackJob(btn);
        });
        return btn;
    }

    /** Find ALL visible Apply buttons using multiple strategies */
    function findApplyButtons() {
        const found = new Set();

        // Strategy 1: Selectors
        for (const selector of APPLY_BTN_SELECTORS) {
            const buttons = document.querySelectorAll(selector);
            buttons.forEach(btn => {
                if (isVisible(btn)) found.add(btn);
            });
        }

        // Strategy 2: Text Content (Fallback)
        const allButtons = document.querySelectorAll('button');
        allButtons.forEach(btn => {
            if (found.has(btn)) return;
            // Only check text if it looks like an apply button (e.g. primary/secondary/ghost)
            // This prevents scanning thousands of buttons on the page
            if (!btn.classList.contains('artdeco-button')) return;

            const text = btn.textContent.trim().toLowerCase();
            if ((text === 'apply' || text === 'easy apply') && isVisible(btn)) {
                found.add(btn);
            }
        });

        return Array.from(found);
    }

    /** Check visibility to avoid hidden buttons in other tabs/overlays */
    function isVisible(elem) {
        return !!(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
    }

    /** Find the best container to inject our button into */
    function findInjectionContainer(applyBtn) {
        // Try to find a known action bar container parent of the button
        for (const selector of CONTAINER_SELECTORS) {
            const container = applyBtn.closest(selector);
            if (container) return container;
        }
        // Fallback: direct parent
        return applyBtn.parentElement;
    }

    /** Main injection logic - now supports multiple buttons */
    function injectButtons() {
        // Use requestAnimationFrame to avoid layout thrashing during heavy DOM updates
        requestAnimationFrame(() => {
            const applyButtons = findApplyButtons();

            if (applyButtons.length === 0) {
                return;
            }

            applyButtons.forEach(applyBtn => {
                // If we already processed THIS specific button, skip
                if (applyBtn.getAttribute(PROCESSED_ATTR) === "true") {
                    return;
                }

                const container = findInjectionContainer(applyBtn);
                if (!container) return;

                // Also check if container already has a track button (redundancy check)
                if (container.querySelector(`[id^="${BUTTON_ID_PREFIX}"]`)) {
                    // Mark as processed so we don't check again
                    applyBtn.setAttribute(PROCESSED_ATTR, "true");
                    return;
                }

                log("Injecting button for:", applyBtn);

                const trackBtn = createButton();

                // Insert logic: try to put it next to the Apply button
                if (applyBtn.parentNode === container) {
                    // Sibling logic
                    container.insertBefore(trackBtn, applyBtn.nextSibling);
                } else {
                    // Just append to container action bar
                    container.appendChild(trackBtn);
                }

                // Mark the Apply button as processed
                applyBtn.setAttribute(PROCESSED_ATTR, "true");
            });
        });
    }

    /** Debounced observer callback */
    function debouncedInject() {
        if (injectionTimeout) clearTimeout(injectionTimeout);
        injectionTimeout = setTimeout(() => {
            injectButtons();
        }, 500); // Increased debounce to 500ms to be safer
    }

    /** Start watching the page */
    function startObserver() {
        injectButtons(); // Initial run

        const observer = new MutationObserver((mutations) => {
            // Lightweight check: only run if nodes added
            let shouldRun = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    shouldRun = true;
                    break;
                }
            }
            if (shouldRun) debouncedInject();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        // Backup: Run periodically in case of subtle changes
        setInterval(debouncedInject, 3000);
    }

    // Start when DOM is ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", startObserver);
    } else {
        startObserver();
    }
})();
