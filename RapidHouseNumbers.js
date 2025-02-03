/* global W */
/* global $ */
/* global WazeWrap */
/* global getWmeSdk, SDK_INITIALIZED */

// ==UserScript==
// @name          WME Rapid House Numbers
// @description   A House Number script with its controls in the House Number mini-editor.  It injects the next value in a sequence into each new HN. All house number formats are supported.
// @namespace     https://github.com/WazeDev
// @version       3.0
// @include       /^https:\/\/(www|beta)\.waze\.com\/(?!user\/)(.{2,6}\/)?editor\/?.*$/
// @copyright     2017-2024, kjg53
// @author        kjg53, WazeDev (2023-?), SaiCode (2024-?)
// @license       MIT
// @grant         GM_addStyle
// @require       https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// ==/UserScript==

(function main() {
  "use strict";

  const scriptName = GM_info.script.name;
  const { version } = GM_info.script;

  console.log(`${scriptName}: Loading `);

  // Display change log immediately as it has no dependencies on waze itself.
  const changeLog = [
    { version: "1.0", message: "Initial Version" },
    { version: "1.1", message: "The changelog now handles missing entries." },
    { version: "1.2", message: "Now does full reset when exiting House Number Editor." },
    { version: "1.3", message: "Fixed typo in change log." },
    { version: "1.4", message: "The accelerator key bindings are removed upon exiting the House Number editor." },
    { version: "1.5", message: "The primary accelerator has been changed from 'a' to 'h'. The keys '1' .. '9' are now accelerators that create the next house number then increment next by the value of the key." },
    { version: "1.6", message: "Disabled numeric accelerators in text fields." },
    { version: "1.7", message: "Added support for numpads. Event handler now removed when the House Number editor is exited." },
    { version: "1.8", message: "Removed info dialog." },
    { version: "1.9", message: "Increased width of increment field." },
    { version: "1.10", message: "The increment is now persisted between sessions." },
    { version: "1.11", message: "Added missing dependencies to rapidHN." },
    { version: "1.12", message: "Added support for HN such as 7A and 10-5." },
    { version: "1.13", message: "Added control to enable/disable alphanumeric HN. Pressing <enter> on the next HN field will switch the focus to the map so that you can then press <h> to direct the editor to add a house number to the map." },
    { version: "1.14", message: "Restored accelerators." },
    { version: "1.15", message: "Updated global symbols." },
    { version: "1.16", message: "Updated to latest WME" },
    { version: "1.17", message: "Resume after saving" },
    { version: "1.18", message: "Exiting house number editor should clear the next rapid house number field in Beta WME." },
    { version: "2.0", message: "New implementation to work with the current WME." },
    { version: "2.1", message: "Minor change to work with the current WME." },
    { version: "2.5", message: "Firefox compatibility and Style update." },
    { version: "2.6", message: "Fixed bug when re entering HN editor." },
    { version: "2.7", message: "Minor version check fix." },
    { version: "2.8", message: "Changelog UI enhancements." },
    { version: "2.9", message: "Bug fixing." },
    { version: "3.0", message: "Support any house number format." },
  ];

  const KEYBOARD = {
    ONE: "1".charCodeAt(0),
    NINE: "9".charCodeAt(0),
    H: "H".charCodeAt(0),
    NUMPAD1: 97,
    NUMPAD9: 105,
  };

  let wmeSDK = null;

  let rapidHNtoolbarButton = null;
  let oneTimeIncrement;
  let houseNumbersObserver;

  const config = loadConfig();

  async function checkVersion() {
    if (!WazeWrap?.Ready && !WazeWrap?.Interface?.ShowScriptUpdate) {
      setTimeout(checkVersion, 200);
      return;
    }

    const versionKey = `${scriptName.replace(/\s/g, "")}Version`;
    const previousVersion = window.localStorage.getItem(versionKey);

    if (previousVersion === version) {
      return;
    }

    let announcement = "";
    let startIndex = 0;

    // Find the index of the previous version in the change log
    if (previousVersion) {
      startIndex = changeLog.findIndex(log => log.version === previousVersion);
      if (startIndex === -1) {
        startIndex = 0; // If not found, start from the beginning
      }
    }
    announcement += "<ul>";
    // Build the announcement message from the change log
    for (let i = startIndex + 1; i < changeLog.length; i++) {
      const msg = `<li> V${changeLog[i].version}: ${changeLog[i].message} </li>\n`;
      announcement += msg;
    }
    announcement += "</ul>";

    console.group(`${scriptName} v${version} changelog:`);
    changeLog.slice(startIndex + 1).forEach(log => console.log(`V${log.version}: ${log.message}`));
    console.groupEnd();
    const title = startIndex > 0 ? `V${changeLog[startIndex].version} -> V${version}` : `Welcome to RHN V${version}`;
    console.log("ShwowScriptUpdate", scriptName, title, announcement);
    WazeWrap.Interface.ShowScriptUpdate(
      scriptName,
      title,
      announcement,
      "https://greasyfork.org/en/scripts/35931-wme-rapid-house-numbers",
    );
    window.localStorage.setItem(versionKey, version);
  }
  checkVersion();

  function loadConfig() {
    const loaded = JSON.parse(window.localStorage.getItem("rapidHN"));
    const defaultConfig = {
      increment: 2,
      value: "",
    };
    return { ...defaultConfig, ...loaded };
  }

  function saveConfig() {
    window.localStorage.setItem("rapidHN", JSON.stringify(config));
  }

  function wmeReady() {
    wmeSDK = getWmeSdk({
      scriptId: "RHN_Script",
      scriptName,
    });
    return new Promise(resolve => {
      if (wmeSDK.State.isReady()) { resolve(); }
      wmeSDK.Events.once({ eventName: "wme-ready" }).then(resolve);
    });
  }

  // Delay until Waze has been loaded.
  async function rapidHNBootstrap() {
    await SDK_INITIALIZED;
    await wmeReady();
    initialize();
  }

  // Initialize RHN once Waze has been loaded.
  function initialize() {
    console.log(`${scriptName} initializing.`);

    // Register keyboard shortcuts
    wmeSDK.Shortcuts.createShortcut({
      callback: () => handleQuickShortcut(1),
      description: "New HN (+1)",
      shortcutId: "WME_RHN_plus1",
      shortcutKeys: null,
    });
    wmeSDK.Shortcuts.createShortcut({
      callback: () => handleQuickShortcut(2),
      description: "New HN (+2)",
      shortcutId: "WME_RHN_plus2",
      shortcutKeys: null,
    });
    wmeSDK.Shortcuts.createShortcut({
      callback: handleCustomShortcut,
      description: "New HN (+CUSTOM_VALUE)",
      shortcutId: "WME_RHN_plusCustom",
      shortcutKeys: null,
    });

    wmeSDK.Events.on({
      eventName: "wme-selection-changed",
      eventHandler: handleSelectionChanges,
    });

    wmeSDK.Events.on({
      eventName: "wme-map-zoom-changed",
      eventHandler: () => {
        enableDisableControls(rapidHNtoolbarButton, wmeSDK.Map.getZoomLevel() < 18);
      },
    });

    console.log(`${scriptName} initialized.`);
  }

  function createRHNcontrols(addHouseNumberNode) {
    $(addHouseNumberNode).append(/* html */ `
            <div class="rapidHN-control">
                <div class="toolbar-button rapidHN-input">
                    <span class="menu-title rapidHN-text">Next #</span>
                    <div class="rapidHN-text-input sm">
                        <input type="text" class="rapidHN next">
                    </div>
                </div>
                <div class="toolbar-button rapidHN-input">
                    <span class="menu-title rapidHN-text">Increment</span>
                    <div class="rapidHN-text-input sm">
                        <input type="number" name="incrementHN" class="rapidHN increment" value="${config.increment}" min="1" step="1">
                    </div>
                </div>
            </div>
        `);
    rapidHNtoolbarButton = addHouseNumberNode.nextSibling;

    enableDisableControls(rapidHNtoolbarButton, W.map.getZoom() < 18);

    // if the <return> key is released blur so that you can type <h> to add a house number rather than see it appended to the next value.
    $("input.rapidHN.next").keyup(evt => {
      if (evt.which === 13) {
        evt.target.blur();
      }
    });

    $("input.rapidHN.next").change(() => {
      config.value = $("input.rapidHN.next").val();
      saveConfig();
    });

    $("input.rapidHN.increment").change(() => {
      config.increment = Number($("input.rapidHN.increment").val());
      saveConfig();
    });

    $("div.rapidHN-control input").on("change", () => {
      const rapidHNenabled = config.increment !== 0 && (config.value !== "" || config.val !== 0);

      if (rapidHNenabled) {
        if (houseNumbersObserver === undefined) {
          console.log("registering house number observer");

          // Find OpenLayers container
          const container = document.querySelector('[id$="_OpenLayers_Container"]');
          if (!container) {
            console.warn("OpenLayers container not found");
            return;
          }

          // Listen for changes in the OpenLayers container
          houseNumbersObserver = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
              // Look for house numbers layer
              const hnLayers = document.querySelectorAll('.olLayerDiv.house-numbers-layer .house-number');
              if (!hnLayers.length) return;

              // Find active house number input
              const input = $(".house-numbers-layer .house-number .content.active:not(\".new\") input.number");
              if (input.length && input.val() === "") {
                injectHouseNumber(input);
                // Move focus from input field to WazeMap
                $("div#WazeMap").focus();
              }
            });
          });

          // Observe the OpenLayers container for all changes
          houseNumbersObserver.observe(container, {
            childList: true,
            subtree: true,
            attributes: true,
          });

          // Register rapidAccelerator on keydown event in map.  Use rapidHN namespace to selectively remove later.
          $(W.map.olMap.div).on("keydown.rapidHN", rapidAccelerator);
          const eventList = $._data(W.map.olMap.div, "events");
          eventList.keydown.unshift(eventList.keydown.pop());
        }
      } else {
        disconnectHouseNumbersObserver();
      }
    });

    if (config.value) {
      $("input.rapidHN.next")
        .filter(":visible")
        .focus()
        .val(config.value)
        .blur()
        .trigger("change");
    }
  }

  function disconnectHouseNumbersObserver() {
    if (houseNumbersObserver !== undefined) {
      const ahn1 = $("div.toolbar-button.add-house-number");
      ahn1.css("font-weight", "normal");
      ahn1.css("color", "inherit");

      houseNumbersObserver.disconnect();
      houseNumbersObserver = undefined;

      const div = $(W.map.olMap.div);
      div.off("keydown.rapidHN");
    }
  }

  function enableDisableControls(toolbarButton, disabled) {
    if (toolbarButton) {
      toolbarButton.childNodes.forEach(node => {
        if (node.nodeName === "INPUT" && node.classList.contains("rapidHN")) {
          if (disabled) {
            node.setAttribute("disabled", "disabled");
            disconnectHouseNumbersObserver();
          } else {
            node.removeAttribute("disabled");
          }
        }
      });
    }
  }

  async function handleSelectionChanges() {
    const selection = wmeSDK.Editing.getSelection();
    if (!selection || selection?.objectType !== "segment") return;
    await new Promise(resolve => { setTimeout(resolve, 100); });
    createRHNcontrols(document.querySelectorAll("div#segment-edit-general > div")[1]);
  }

  function setNativeValue(element, value) {
    const lastValue = element.value;
    element.value = value;
    const event = new Event("input", { target: element, bubbles: true });
    // React 15
    event.simulated = true;
    // React 16
    const tracker = element._valueTracker;
    if (tracker) {
      tracker.setValue(lastValue);
    }
    element.dispatchEvent(event);
  }

  function injectHouseNumber(newHouseNumber) {
    let increment = oneTimeIncrement ?? config.increment;
    oneTimeIncrement = undefined;

    const nextElement = $("input.rapidHN.next").filter(":visible");
    const next = nextElement.val();

    // Inject next HN into WME
    setNativeValue(newHouseNumber[0], next);

    const nextParts = next.match(/[0-9]+|[a-z]|[A-Z]|\S/g);

    for (const [index, part] of nextParts.reverse().entries()) {
      if (!Number.isNaN(Number(part))) {
        nextParts[index] = (Number(part) + increment).toString().padStart(part.length, '0');
        break;
      }

      if (/[a-z]/i.test(part)) {
        let nextLetter = part.codePointAt(0) + (increment % 26);

        increment = Math.floor(increment / 26);

        if ((/[a-z]/.test(part) && nextLetter > 'z'.codePointAt(0)) ||
          (/[A-Z]/.test(part) && nextLetter > 'Z'.codePointAt(0))) {
          nextLetter -= 26;
          increment++;
        }

        nextParts[index] = String.fromCodePoint(nextLetter);

        if (!increment) break;
      }
    }

    config.value = nextParts.reverse().join('');
    nextElement.val(config.value);
  }

  // Type 1-9 instead of 'h' to specify a one-time increment that be applied after the current "next" value is added to the map
  function rapidAccelerator(event) {
    // if not in house number editor mode, return
    if ($(".toolbar wz-button.add-house-number").length === 0) {
      disconnectHouseNumbersObserver();
      return;
    }
    if (!event.shiftKey && !event.altKey && !event.metaKey) {
      let acceleratorSelected = false;

      if (
        event.target.localName !== "input"
        && KEYBOARD.ONE <= event.which
        && event.which <= KEYBOARD.NINE
      ) {
        oneTimeIncrement = event.which - KEYBOARD.ONE + 1;
        acceleratorSelected = true;
      } else if (
        event.target.localName !== "input"
        && KEYBOARD.NUMPAD1 <= event.which
        && event.which <= KEYBOARD.NUMPAD9
      ) {
        oneTimeIncrement = event.which - KEYBOARD.NUMPAD1 + 1;
        acceleratorSelected = true;
      } else if (event.which === KEYBOARD.H) {
        oneTimeIncrement = undefined;
        acceleratorSelected = true;
      }

      if (acceleratorSelected) {
        // Prevent further event listeners from running
        event.preventDefault();
        event.stopImmediatePropagation();

        // Click the Add House Number in the top nav bar
        $(".toolbar wz-button.add-house-number").click();
      }
    }
  }

  function handleQuickShortcut(value) {
    if ($(".toolbar wz-button.add-house-number").length === 0) return;

    const incrementInput = $("input.rapidHN.increment");
    const originalValue = incrementInput.val();

    incrementInput.val(value);
    $(".toolbar wz-button.add-house-number").click();
    incrementInput.val(originalValue);
  }

  function handleCustomShortcut() {
    if ($(".toolbar wz-button.add-house-number").length === 0) return;
    $(".toolbar wz-button.add-house-number").click();
  }

  rapidHNBootstrap();
})();

GM_addStyle(`

.rapidHN-control {
    display: flex;
    flex-direction: column;
}

.rapidHN-input {
    display: flex;
    flex-direction: row;
    align-items: center;
    margin: 0 5px;
    height: 100%
}

.rapidHN.next,
.rapidHN.increment {
    margin: 3px;
    height:20px;
    width: 64px;
    height: 30px;
}

.rapidHN-text-input input {
  background-color: var(--background_variant, #f2f4f7);
  border-color: var(--background_variant, #f2f4f7);
  border-radius: 6px;
  border-width: 0px 0px 1px;
  box-sizing: border-box;
  color: var(--content_default, #202124);
  flex: 1 1 auto;
  font-size: 14px;
  line-height: 16px;
  margin: 0px;
  min-width: 100px;
  outline: none;
  font-family: inherit;
  padding: 0px 16px;
}

.rapidHN-text {
    text-align: right;
    font-weight: 500;
}

.rapidHN-switch-mode {
    cursor: pointer;
}

.rapidHN-switch-mode .tooltiptext {
    visibility: hidden;
    background-color: #333;
    color: #fff;
    text-align: center;
    border-radius: 6px;
    position: absolute;
    top: 100%;
    padding: 5px 10px;
    z-index: 9999;
    opacity: 0;
    transition: opacity 0.3s;
}

.rapidHN-switch-mode:hover .tooltiptext {
    visibility: visible;
    opacity: 1;
}

#current-input-type {
    background-color: var(--wz-button-background-color, var(--primary, #0099ff));
    color: var(--on_primary, #ffffff);
    border-radius: 100px;
    font-size: 12px;
    font-weight: 500;
    height: 24px;
    padding: 0px 20px;
    align-items: center;
    border: var(--wz-button-border, 1px solid transparent);
    box-shadow: var(--wz-button-box-shadow, none);
    cursor: pointer;
    display: inline-flex;
    font-family: "Waze Boing", "Waze Boing HB", "Rubik", sans-serif;
    justify-content: center;
    letter-spacing: 0.3px;
    outline: none;
    position: relative;
    text-align: center;
    text-decoration: unset;
    user-select: none;
    white-space: nowrap;
}
`);
