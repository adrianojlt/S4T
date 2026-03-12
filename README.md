# S4T (Shortcuts for Tabs)


## Tab Groups
I use Chrome tab groups all the time. They help me keep my open tabs organized. When I need a specific tab, I simply search for it, and Chrome takes me there automatically. However, if I jump to a tab in a different group, I often end up with multiple groups expanded at once, which clutters the tab bar. It would be useful to have a quick way to collapse all groups that aren't currently in focus, or simply collapse them all.

## MRU - Most Recent  Usage
This extension solves that problem adding keyboard shortcuts not only for collapsing tab groups but also to cycling through recently used tabs like the (Alt+Tab from Windows, Mac and Linux window managers).

## Shortcuts

| Shortcut | Description |
| -------- | ----------- |
| Alt+Shift+Up | Collapse all tab groups except the active one |
| Alt+Shift+Down | Collapse all tab groups; if all are already collapsed, expand the active tab's group |
| Alt+W *(assign in settings)* | Fast MRU tab switch — cycle through recent tabs quickly |
| Alt+S *(assign in settings)* | Slow MRU tab switch — cycle forward through recent tabs |
| Alt+Shift+S *(assign in settings)* | Slow MRU tab switch — cycle backward through recent tabs |

MRU shortcuts cycle through tabs in most-recently-used order. Releasing the shortcut (after the timeout) finalises the selection and moves the chosen tab to the top of the MRU list.

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the folder containing this project

The extension is now active. You can verify it by checking for the icon in the toolbar.

> **Note:** To assign or change keyboard shortcuts, go to `chrome://extensions/shortcuts`.

## Debugging

Set `LOGGING_ON = true` at the top of `background.js` to enable console logging of MRU operations and command events.
