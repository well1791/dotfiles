// Ghostty Quake Terminal Toggle Script for KWin
// Toggles Ghostty visibility with Super+O like Yakuake/Guake

const GHOSTTY_CLASS = "com.mitchellh.ghostty";
const LAUNCH_COMMAND = "ghostty";
const POLL_INTERVAL = 100; // ms
const POLL_TIMEOUT = 3000; // ms

// Persistent state
// Note: KWin config API may return window ID as string "null" or number; loadState() handles coercion
let ghosttyWindowId = null;
let isLaunching = false;
let autoHideConnection = null;  // Track focus loss signal connection

// Load stored window ID on script initialization
function loadState() {
    const raw = readConfig("ghosttyWindowId", null);
    // Wayland uses UUID strings, X11 uses numbers - keep as-is without Number() conversion
    ghosttyWindowId = (raw === null || raw === "null" || raw === "" || raw === undefined) ? null : raw;
    console.log("[ghostty-quake] Loaded window ID:", ghosttyWindowId);
    
    // Validate that stored window still exists
    if (ghosttyWindowId !== null) {
        const window = findWindowById(ghosttyWindowId);
        if (!window) {
            console.log("[ghostty-quake] Stored window ID is stale, clearing");
            ghosttyWindowId = null;
            saveState();
        } else {
            // Set up auto-hide for existing window
            setupAutoHide(window);
        }
    }
}

// Save window ID to persistent storage
function saveState() {
    if (ghosttyWindowId !== null && ghosttyWindowId !== undefined && ghosttyWindowId !== "") {
        writeConfig("ghosttyWindowId", ghosttyWindowId);
        console.log("[ghostty-quake] Saved window ID:", ghosttyWindowId);
    } else {
        writeConfig("ghosttyWindowId", null);
        console.log("[ghostty-quake] Cleared invalid window ID:", ghosttyWindowId);
    }
}

// Find window by ID
function findWindowById(windowId) {
    if (windowId === null) return null;
    // Wayland uses UUID strings, X11 uses numbers - compare directly without conversion
    const windows = workspace.windowList();
    for (let i = 0; i < windows.length; i++) {
        if (windows[i].internalId === windowId) {
            return windows[i];
        }
    }
    return null;
}

// Find Ghostty window by resource class
// If multiple windows exist, returns the first one found (undefined order)
// In practice, the stored window ID is used; this is only a fallback
function findGhosttyWindow() {
    const windows = workspace.windowList();
    for (let i = 0; i < windows.length; i++) {
        if (windows[i].resourceClass === GHOSTTY_CLASS) {
            return windows[i];
        }
    }
    return null;
}

// Launch Ghostty and wait for window to appear
function launchGhostty(callback) {
    if (isLaunching) {
        console.log("[ghostty-quake] Launch already in progress, ignoring");
        return;
    }
    isLaunching = false;  // Don't actually launch - require manual startup
    
    console.log("[ghostty-quake] Ghostty not running. Please launch Ghostty manually.");
    console.log("[ghostty-quake] Once Ghostty is running, press Super+O to toggle it.");
    
    // Show notification to user
    try {
        callDBus("org.freedesktop.Notifications",
                 "/org/freedesktop/Notifications",
                 "org.freedesktop.Notifications",
                 "Notify",
                 "Ghostty Quake Terminal",
                 0,
                 "ghostty",
                 "Ghostty Not Running",
                 "Please launch Ghostty manually, then press Super+O to toggle.",
                 [],
                 {},
                 5000);
    } catch (e) {
        console.log("[ghostty-quake] Could not show notification:", e);
    }
}

// Hide window (minimize + skip taskbar/pager/switcher)
function hideWindow(window) {
    console.log("[ghostty-quake] Hiding window");
    window.minimized = true;
    window.skipTaskbar = true;
    window.skipPager = true;
    window.skipSwitcher = true;
}

// Show window (restore + maximize + focus)
function showWindow(window) {
    console.log("[ghostty-quake] Showing window");
    window.minimized = false;
    window.skipTaskbar = false;
    window.skipPager = false;
    window.skipSwitcher = false;
    window.setMaximize(true, true); // vertical, horizontal
    workspace.activeWindow = window;
    
    // Set up auto-hide on focus loss
    setupAutoHide(window);
}

// Check if window is currently visible
function isWindowVisible(window) {
    return !window.minimized;
}

// Set up auto-hide when window loses focus
function setupAutoHide(window) {
    // Disconnect previous connection if any
    if (autoHideConnection !== null) {
        try {
            window.activeChanged.disconnect(autoHideConnection);
        } catch (e) {
            // Ignore if already disconnected
        }
    }
    
    // Connect to activeChanged signal
    autoHideConnection = function() {
        if (!window.active && isWindowVisible(window)) {
            console.log("[ghostty-quake] Window lost focus, auto-hiding");
            hideWindow(window);
        }
    };
    
    window.activeChanged.connect(autoHideConnection);
    console.log("[ghostty-quake] Auto-hide on focus loss enabled");
}

// Main toggle function
function toggleGhosttyQuake() {
    console.log("[ghostty-quake] Toggle triggered");
    
    // Try to find existing window
    let window = null;
    if (ghosttyWindowId !== null) {
        window = findWindowById(ghosttyWindowId);
    }
    
    // If stored window doesn't exist, search for any Ghostty window
    if (!window) {
        console.log("[ghostty-quake] Searching for Ghostty window...");
        window = findGhosttyWindow();
        if (window) {
            console.log("[ghostty-quake] Found existing Ghostty window:", window.internalId);
            ghosttyWindowId = window.internalId;
            saveState();
            // Set up auto-hide for newly found window
            setupAutoHide(window);
        }
    }
    
    // If no window exists, show notification
    if (!window) {
        console.log("[ghostty-quake] No Ghostty window found");
        launchGhostty(function(newWindow) {
            showWindow(newWindow);
        });
        return;
    }
    
    // Toggle visibility
    if (isWindowVisible(window)) {
        hideWindow(window);
    } else {
        showWindow(window);
    }
}

// Register global shortcut
registerShortcut(
    "toggleGhosttyQuake",
    "Toggle Ghostty Quake Terminal",
    "Meta+O",
    toggleGhosttyQuake
);

// Initialize
isLaunching = false; // Reset launch flag on script init
loadState();
console.log("[ghostty-quake] Script initialized");
