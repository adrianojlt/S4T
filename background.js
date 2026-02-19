var mru = [];
var slowActive = 0;
var quickActive = 0;
var wPressed = false;
var prevTimestamp = 0;
var altPressed = false;
var intSwitchCount = 0;
var fastTimerValue = 200;
var slowTimerValue = 1500;
var lastIntSwitchIndex = 0;
var slowSwitchOngoing = false;
var fastSwitchOngoing = false;


var timer;
var slowSwitchForward = false;
var initialized = false;
var loggingOn = false;



var processCommand = function (command) {

  Clog("Command recd:" + command);

  var fastSwitch = true;

  slowSwitchForward = false;

  if (command == "alt_switch_fast") {
    fastSwitch = true;
  } else if (command == "alt_switch_slow_backward") {
    fastSwitch = false;
    slowSwitchForward = false;
  } else if (command == "alt_switch_slow_forward") {
    fastSwitch = false;
    slowSwitchForward = true;
  }

  if (!slowSwitchOngoing && !fastSwitchOngoing) {
    if (fastSwitch) {
      fastSwitchOngoing = true;
    } else {
      slowSwitchOngoing = true;
    }
    Clog("MRU::START_SWITCH");
    intSwitchCount = 0;
    doIntSwitch();
  } else if (
    (slowSwitchOngoing && !fastSwitch) ||
    (fastSwitchOngoing && fastSwitch)
  ) {
    Clog("MRU::DO_INT_SWITCH");
    doIntSwitch();
  } else if (slowSwitchOngoing && fastSwitch) {
    endSwitch();
    fastSwitchOngoing = true;
    Clog("MRU::START_SWITCH");
    intSwitchCount = 0;
    doIntSwitch();
  } else if (fastSwitchOngoing && !fastSwitch) {
    endSwitch();
    slowSwitchOngoing = true;
    Clog("MRU::START_SWITCH");
    intSwitchCount = 0;
    doIntSwitch();
  }

  if (timer) {
    if (fastSwitchOngoing || slowSwitchOngoing) {
      clearTimeout(timer);
    }
  }
  if (fastSwitch) {
    timer = setTimeout(function () {
      endSwitch();
    }, fastTimerValue);
  } else {
    timer = setTimeout(function () {
      endSwitch();
    }, slowTimerValue);
  }
};

chrome.commands.onCommand.addListener(async (command) => {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!activeTab) return;

  const groups = await chrome.tabGroups.query({ windowId: activeTab.windowId });

  //if (MRU_COMMANDS.includes(command)) { processCommand(command); return; }

  switch (command) {
    case "collapse_other_groups": {
      for (const group of groups) {
        if (group.id !== activeTab.groupId) {
          try {
            await chrome.tabGroups.update(group.id, { collapsed: true });
          } catch (e) {
            console.error("Failed to collapse group", group.id, e);
          }
        }
      }
      await forceRepaint(activeTab.windowId);
      break;
    }

    case "collapse_all_groups": {
        const anyExpanded = groups.some((g) => !g.collapsed);
        if (anyExpanded) {
            // Collapse ALL groups (including active — Chrome won't visually
            // collapse it, but setting the state lets the toggle work)
            for (const group of groups) {
                try {
                    await chrome.tabGroups.update(group.id, { collapsed: true });
                } catch (e) {
                    console.error("Failed to collapse group", group.id, e);
                }
            }
        } else {
            // All collapsed -> expand the active tab's group
            if (activeTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
                await chrome.tabGroups.update(activeTab.groupId, {
                    collapsed: false,
                });
            }
        }
        await forceRepaint(activeTab.windowId);
        break;
    }
    case "alt_switch_fast":
    case "alt_switch_slow_backward":
    case "alt_switch_slow_forward": {
        processCommand(command);
        break;
    }
  }
});

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

chrome.action.onClicked.addListener(function (tab) {
  Clog("Click recd");
  processCommand("alt_switch_fast");
});

chrome.runtime.onStartup.addListener(function () {
  Clog("on startup");
  initialize();
});

chrome.runtime.onInstalled.addListener(function () {
  Clog("on startup");
  initialize();
});

var doIntSwitch = function () {

    Clog("MRU:: in int switch, intSwitchCount: " + intSwitchCount + ", mru.length: " + mru.length);

    if (intSwitchCount < mru.length && intSwitchCount >= 0) {

        var tabIdToMakeActive;

        //check if tab is present, sometimes tabs go missing
        var invalidTab = true;

        var thisWindowId;

        if (slowSwitchForward) {
            decrementSwitchCounter();
        } else {
            incrementSwitchCounter();
        }

        tabIdToMakeActive = mru[intSwitchCount];

        chrome.tabs.get(tabIdToMakeActive, function (tab) {
            if (tab) {
                invalidTab = false;
                thisWindowId = tab.windowId;
                chrome.windows.update(thisWindowId, { focused: true });
                chrome.tabs.update(tabIdToMakeActive, { active: true, highlighted: true, });
                lastIntSwitchIndex = intSwitchCount;
            } else {
                Clog("MRU:: in int switch, >>invalid tab found.intSwitchCount: " + intSwitchCount + ", mru.length: " + mru.length);
                removeItemAtIndexFromMRU(intSwitchCount);
                if (intSwitchCount >= mru.length) {
                    intSwitchCount = 0;
                }
                doIntSwitch();
            }
        });
    }
};

var endSwitch = function () {
  Clog("MRU::END_SWITCH");
  slowSwitchOngoing = false;
  fastSwitchOngoing = false;
  var tabId = mru[lastIntSwitchIndex];
  putExistingTabToTop(tabId);
  printMRUSimple();
};

chrome.tabs.onActivated.addListener(function (activeInfo) {
  if (!slowSwitchOngoing && !fastSwitchOngoing) {
    var index = mru.indexOf(activeInfo.tabId);

    //probably should not happen since tab created gets called first than activated for new tabs,
    // but added as a backup behavior to avoid orphan tabs
    if (index == -1) {
      Clog("Unexpected scenario hit with tab(" + activeInfo.tabId + ").");
      addTabToMRUAtFront(activeInfo.tabId);
    } else {
      putExistingTabToTop(activeInfo.tabId);
    }
  }
});

chrome.tabs.onCreated.addListener(function (tab) {
    Clog("Tab create event fired with tab(" + tab.id + ")");
    addTabToMRUAtBack(tab.id);
});

chrome.tabs.onRemoved.addListener(function (tabId, removedInfo) {
  Clog("Tab remove event fired from tab(" + tabId + ")");
  removeTabFromMRU(tabId);
});

var addTabToMRUAtBack = function (tabId) {
  var index = mru.indexOf(tabId);
  if (index == -1) {
    //add to the end of mru
    mru.splice(-1, 0, tabId);
  }
};

var addTabToMRUAtFront = function (tabId) {
  var index = mru.indexOf(tabId);
  if (index == -1) {
    //add to the front of mru
    mru.splice(0, 0, tabId);
  }
};
var putExistingTabToTop = function (tabId) {
  var index = mru.indexOf(tabId);
  if (index != -1) {
    mru.splice(index, 1);
    mru.unshift(tabId);
  }
};

var removeTabFromMRU = function (tabId) {
    var index = mru.indexOf(tabId);
    if (index != -1) { mru.splice(index, 1); }
};

var removeItemAtIndexFromMRU = function (index) {
    if (index < mru.length) { mru.splice(index, 1); }
};

var incrementSwitchCounter = function () {
    intSwitchCount = (intSwitchCount + 1) % mru.length;
};

var decrementSwitchCounter = function () {
    intSwitchCount = (intSwitchCount === 0) ? mru.length - 1 : intSwitchCount - 1;
};

var initialize = function () {
    if (!initialized) {
        initialized = true;
        chrome.windows.getAll({ populate: true }, function (windows) {
            windows.forEach(function (window) {
                window.tabs.forEach(function (tab) {
                    mru.unshift(tab.id);
                });
            });
            Clog("MRU after init: " + mru);
        });
    }
};

var printTabInfo = function (tabId) {
  var info = "";
  chrome.tabs.get(tabId, function (tab) {
    info = "Tabid: " + tabId + " title: " + tab.title;
  });
  return info;
};

var str = "MRU status: \n";

var printMRU = function () {
    str = "MRU status: \n";
    for (var i = 0; i < mru.length; i++) {
        chrome.tabs.get(mru[i], function (tab) {});
    }
    Clog(str);
};

var printMRUSimple = function () {
    Clog("mru: " + mru);
};

var generatePrintMRUString = function () {
    chrome.tabs.query(function () {});
    str += i + " :(" + tab.id + ")" + tab.title;
    str += "\n";
};

// To fix the issue of service worker getting killed by Chrome after 30 seconds of inactivity
const INTERNAL_STAYALIVE_PORT = "Whatever_Port_Name_You_Want";
var alivePort = null;

async function StayAlive() {
  var lastCall = Date.now();

  var wakeUp = setInterval(() => {
    const now = Date.now();
    const age = now - lastCall;

    console.log(
      `(DEBUG StayAlive) ----------------------- time elapsed: ${age}`,
    );

    if (alivePort == null) {
      alivePort = chrome.runtime.connect({ name: INTERNAL_STAYALIVE_PORT });

      alivePort.onDisconnect.addListener((p) => {
        if (chrome.runtime.lastError) {
          console.log(
            `(DEBUG StayAlive) Disconnected due to an error: ${chrome.runtime.lastError.message}`,
          );
        } else {
          console.log(`(DEBUG StayAlive): port disconnected`);
        }

        alivePort = null;
      });
    }

    if (alivePort) {
      alivePort.postMessage({ content: "ping" });

      if (chrome.runtime.lastError) {
        console.log(
          `(DEBUG StayAlive): postMessage error: ${chrome.runtime.lastError.message}`,
        );
      } else {
        console.log(
          `(DEBUG StayAlive): "ping" sent through ${alivePort.name} port`,
        );
      }
    }
  }, 25000);
}

var Clog = function (str) {
    if (loggingOn) { console.log(str); }
};

StayAlive();

initialize();
