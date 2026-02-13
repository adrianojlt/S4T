chrome.commands.onCommand.addListener(async (command) => {

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab) return;

  const groups = await chrome.tabGroups.query({ windowId: activeTab.windowId });

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

      const anyExpanded = groups.some(g => !g.collapsed);

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
        // All collapsed → expand the active tab's group
        if (activeTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
          await chrome.tabGroups.update(activeTab.groupId, { collapsed: false });
        }
      }

      await forceRepaint(activeTab.windowId);

      break;
    }
  }
});

async function forceRepaint(windowId) {
  try {
    const win = await chrome.windows.get(windowId);
    await chrome.windows.update(windowId, { width: win.width + 1 });
    await new Promise(r => setTimeout(r, 100));
    await chrome.windows.update(windowId, { width: win.width });
  } catch (e) {
    console.error("Repaint trick failed", e);
  }
}