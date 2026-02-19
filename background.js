// ── Config constants ──────────────────────────────────────────────────────────
const LOGGING_ON = true;
const FAST_TIMER_MS = 200;
const SLOW_TIMER_MS = 1500;
const STAY_ALIVE_PORT = "tab-group-collapse-stayalive";

// ── Logging utility ───────────────────────────────────────────────────────────
function log(str) {
    if (LOGGING_ON) console.log(str);
}

// ── MRU list + operations ─────────────────────────────────────────────────────
const mru = [];

function addTabToMRUAtBack(tabId) {
    if (mru.indexOf(tabId) === -1) {
        mru.push(tabId);
    }
}

function addTabToMRUAtFront(tabId) {
    if (mru.indexOf(tabId) === -1) {
        mru.splice(0, 0, tabId);
    }
}

function putExistingTabToTop(tabId) {
    const index = mru.indexOf(tabId);
    if (index !== -1) {
        mru.splice(index, 1);
        mru.unshift(tabId);
    }
}

function removeTabFromMRU(tabId) {
    const index = mru.indexOf(tabId);
    if (index !== -1) mru.splice(index, 1);
}

function removeItemAtIndexFromMRU(index) {
    if (index < mru.length) mru.splice(index, 1);
}

// ── Switch session state + operations ────────────────────────────────────────
const switchState = {
    ongoing: false,
    isFast: false,
    forward: false,
    index: 0,
    lastIndex: 0,
    timer: null,
};

function incrementIndex() {
    switchState.index = (switchState.index + 1) % mru.length;
}

function decrementIndex() {
    switchState.index =
        switchState.index === 0 ? mru.length - 1 : switchState.index - 1;
}

async function doIntSwitch() {

    log("MRU:: in int switch, index: " + switchState.index + ", mru.length: " + mru.length);

    if (switchState.index >= mru.length || switchState.index < 0) return;

    if (switchState.forward) {
        decrementIndex();
    } else {
        incrementIndex();
    }

    const tabId = mru[switchState.index];

    try {
        const tab = await chrome.tabs.get(tabId);
        await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(tabId, { active: true, highlighted: true });
        switchState.lastIndex = switchState.index;
    } catch {
        log( "MRU:: in int switch, >>invalid tab found. index: " + switchState.index + ", mru.length: " + mru.length);
        removeItemAtIndexFromMRU(switchState.index);
        if (switchState.index >= mru.length) {
            switchState.index = 0;
        }
        await doIntSwitch();
    }
}

function endSwitch() {
    log("MRU::END_SWITCH");
    switchState.ongoing = false;
    const tabId = mru[switchState.lastIndex];
    putExistingTabToTop(tabId);
}

function resetTimer(isFast) {
    if (switchState.timer) {
        clearTimeout(switchState.timer);
    }
    switchState.timer = setTimeout(endSwitch, isFast ? FAST_TIMER_MS : SLOW_TIMER_MS);
}

function startSwitch(isFast, forward) {
    switchState.ongoing = true;
    switchState.isFast = isFast;
    switchState.forward = forward;
    switchState.index = 0;
    log("MRU::START_SWITCH");
    doIntSwitch();
}

function processCommand(command) {
    log("Command recd:" + command);

    const isFast = command === "alt_switch_fast";
    const forward = command === "alt_switch_slow_forward";

    if (!switchState.ongoing) {
        startSwitch(isFast, forward);
        resetTimer(isFast);
        return;
    }

    if (switchState.isFast === isFast) {
        log("MRU::DO_INT_SWITCH");
        doIntSwitch();
        resetTimer(isFast);
        return;
    }

    // Mode changed — end old session, start fresh
    endSwitch();
    startSwitch(isFast, forward);
    resetTimer(isFast);
}

// ── Tab-group commands ────────────────────────────────────────────────────────
async function collapseOtherGroups(activeTab, groups) {
    for (const group of groups) {
        if (group.id === activeTab.groupId) continue;
        try {
            await chrome.tabGroups.update(group.id, { collapsed: true });
        } catch (e) {
            console.error("Failed to collapse group", group.id, e);
        }
    }
    await forceRepaint(activeTab.windowId);
}

async function collapseAllGroups(activeTab, groups) {
    const anyExpanded = groups.some((g) => !g.collapsed);
    if (anyExpanded) {
        for (const group of groups) {
            try {
                await chrome.tabGroups.update(group.id, { collapsed: true });
            } catch (e) {
                console.error("Failed to collapse group", group.id, e);
            }
        }
    } else if (activeTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        await chrome.tabGroups.update(activeTab.groupId, { collapsed: false });
    }
    await forceRepaint(activeTab.windowId);
}

async function forceRepaint(windowId) {
    try {
        const win = await chrome.windows.get(windowId);
        await chrome.windows.update(windowId, { width: win.width + 1 });
        await new Promise((r) => setTimeout(r, 100));
        await chrome.windows.update(windowId, { width: win.width });
    } catch (e) {
        console.error("Repaint trick failed", e);
    }
}

// ── Command dispatch ──────────────────────────────────────────────────────────
const MRU_COMMANDS = new Set([
    "alt_switch_fast",
    "alt_switch_slow_backward",
    "alt_switch_slow_forward",
]);

const COMMANDS = {
    collapse_other_groups: collapseOtherGroups,
    collapse_all_groups: collapseAllGroups,
};

chrome.commands.onCommand.addListener(async (command) => {

    if (MRU_COMMANDS.has(command)) {
        processCommand(command);
        return;
    }

    const handler = COMMANDS[command];
    if (!handler) return;

    const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
    });
    if (!activeTab) return;

    const groups = await chrome.tabGroups.query({
        windowId: activeTab.windowId,
    });
    await handler(activeTab, groups);
});

chrome.action.onClicked.addListener(() => {
    log("Click recd");
    processCommand("alt_switch_fast");
});

// ── Tab lifecycle listeners ───────────────────────────────────────────────────
chrome.tabs.onActivated.addListener((activeInfo) => {

    if (switchState.ongoing) return;

    const index = mru.indexOf(activeInfo.tabId);

    if (index === -1) {
        log("Unexpected scenario hit with tab(" + activeInfo.tabId + ").");
        addTabToMRUAtFront(activeInfo.tabId);
    } else {
        putExistingTabToTop(activeInfo.tabId);
    }
});

chrome.tabs.onCreated.addListener((tab) => {
    log("Tab create event fired with tab(" + tab.id + ")");
    addTabToMRUAtBack(tab.id);
});

chrome.tabs.onRemoved.addListener((tabId) => {
    log("Tab remove event fired from tab(" + tabId + ")");
    removeTabFromMRU(tabId);
});

// ── Initialization ────────────────────────────────────────────────────────────
let initialized = false;

async function initialize() {

    if (initialized) return;
    initialized = true;

    const windows = await chrome.windows.getAll({ populate: true });
    for (const window of windows) {
        for (const tab of window.tabs) {
            mru.unshift(tab.id);
        }
    }
    log("MRU after init: " + mru);
}

chrome.runtime.onStartup.addListener(() => {
    log("on startup");
    initialize();
});

chrome.runtime.onInstalled.addListener(() => {
    log("on installed");
    initialize();
});

// ── Keep-alive ────────────────────────────────────────────────────────────────
let alivePort = null;

// Accept the self-connection so Chrome doesn't throw "Receiving end does not exist"
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === STAY_ALIVE_PORT) {
        port.onMessage.addListener(() => {});
    }
});

function stayAlive() {
    setInterval(() => {
        if (alivePort == null) {
            alivePort = chrome.runtime.connect({ name: STAY_ALIVE_PORT });
            alivePort.onDisconnect.addListener(() => {
                alivePort = null;
            });
        }
        if (alivePort) {
            alivePort.postMessage({ content: "ping" });
            // Read lastError to suppress "Unchecked runtime.lastError" when
            // the port silently disconnects (e.g. during async window ops).
            void chrome.runtime.lastError;
        }
    }, 25000);
}

stayAlive();

initialize();
