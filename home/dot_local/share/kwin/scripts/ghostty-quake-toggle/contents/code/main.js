// Ghostty Quake Terminal Toggle Script for KWin
// Toggles Ghostty visibility with Super+O like Yakuake/Guake

const GHOSTTY_CLASS = "com.mitchellh.ghostty";
const LAUNCH_COMMAND = "ghostty";
const POLL_INTERVAL = 100; // ms
const POLL_TIMEOUT = 3000; // ms

// Persistent state
let ghosttyWindowId = null;

// Load stored window ID on script initialization
function loadState() {
    ghosttyWindowId = readConfig("ghosttyWindowId", null);
    console.log("[ghostty-quake] Loaded window ID:", ghosttyWindowId);
    
    // Validate that stored window still exists
    if (ghosttyWindowId !== null) {
        const window = findWindowById(ghosttyWindowId);
        if (!window) {
            console.log("[ghostty-quake] Stored window ID is stale, clearing");
            ghosttyWindowId = null;
            saveState();
        }
    }
}

// Save window ID to persistent storage
function saveState() {
    writeConfig("ghosttyWindowId", ghosttyWindowId);
    console.log("[ghostty-quake] Saved window ID:", ghosttyWindowId);
}

// Find window by ID
function findWindowById(windowId) {
    const windows = workspace.windowList();
    for (let i = 0; i < windows.length; i++) {
        if (windows[i].windowId === windowId) {
            return windows[i];
        }
    }
    return null;
}

// Find Ghostty window by resource class
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
    console.log("[ghostty-quake] Launching Ghostty...");
    
    const success = workspace.launchApplication(LAUNCH_COMMAND);
    if (!success) {
        console.error("[ghostty-quake] Failed to launch Ghostty");
        return;
    }
    
    // Poll for new window
    let elapsed = 0;
    const pollTimer = Qt.createQmlObject(
        'import QtQuick 2.0; Timer {}',
        workspace
    );
    
    pollTimer.interval = POLL_INTERVAL;
    pollTimer.repeat = true;
    pollTimer.triggered.connect(function() {
        elapsed += POLL_INTERVAL;
        
        const window = findGhosttyWindow();
        if (window) {
            console.log("[ghostty-quake] Found new Ghostty window:", window.windowId);
            pollTimer.stop();
            ghosttyWindowId = window.windowId;
            saveState();
            callback(window);
        } else if (elapsed >= POLL_TIMEOUT) {
            console.error("[ghostty-quake] Timeout waiting for Ghostty window");
            pollTimer.stop();
        }
    });
    
    pollTimer.start();
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
}

// Check if window is currently visible
function isWindowVisible(window) {
    return !window.minimized;
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
            console.log("[ghostty-quake] Found existing Ghostty window:", window.windowId);
            ghosttyWindowId = window.windowId;
            saveState();
        }
    }
    
    // If no window exists, launch Ghostty
    if (!window) {
        console.log("[ghostty-quake] No Ghostty window found, launching...");
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
loadState();
console.log("[ghostty-quake] Script initialized");
