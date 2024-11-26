/* global W */
/* global I18n */
/* global $ */
/* global WazeWrap */

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

  const ONE = 49;
  const NINE = 57;
  const NUMPAD1 = 97;
  const NUMPAD9 = 105;
  const LETTER_H = "H".charCodeAt(0);

  let rapidHNtoolbarButton = null;
  let oneTimeIncrement;
  let houseNumbersObserver;
  let rapidHnNext;

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

  // Delay until Waze has been loaded.
  function rapidHNBootstrap() {
    if (
      typeof W === "undefined"
      || typeof W.map === "undefined"
      || typeof W.selectionManager === "undefined"
      || typeof I18n === "undefined"
      || typeof I18n.translations === "undefined"
      || $("#toolbar [class^='primaryToolbar']").length === 0
    ) {
      console.log(`${scriptName} dependencies not ready. Waiting...`);
      setTimeout(rapidHNBootstrap, 500);
      return;
    }

    setTimeout(initialize, 999);
  }

  // Initialize RHN once Waze has been loaded.
  function initialize() {
    console.log(`${scriptName} initializing.`);

    // Quick hack to make sure RHN controls are removed whenever HN editing mode is toggled on/off.
    W.editingMediator.on("change:editingHouseNumbers", () => $(".rapidHN-control").remove());

    // Listen for changes in the edit mode
    // The contents of .primaryToolbar is updated when switching into, and out of, house number mode.

    const primaryToolbar = $("#toolbar [class^='primaryToolbar']");
    const primaryToolbarObserver = new MutationObserver(
      handlePrimaryToolbarMutations,
    );
    if (primaryToolbar.length) {
      primaryToolbarObserver.observe(primaryToolbar[0], {
        childList: true,
        subtree: true,
      });
    } else {
      console.log("ERROR: Failed to find the primary toolbar");
    }

    W.map.registerMapEvent(
      "zoomend",
      event => {
        enableDisableControls(rapidHNtoolbarButton, event.object.zoom < 18);
      },
      this,
    );
    console.log(`${scriptName} initialized.`);
  }

  function createRHNcontrols(addHouseNumberNode) {
    const initialIncrement = (
      window.localStorage.getItem("rapidHNincrement") || 2
    ).toString();

    $(addHouseNumberNode).after(`
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
                        <input type="number" name="incrementHN" class="rapidHN increment" value="${initialIncrement}" step="1">
                    </div>
                </div>
            </div>
        `);
    rapidHNtoolbarButton = addHouseNumberNode.nextSibling;
    
    enableDisableControls(rapidHNtoolbarButton, W.map.getZoom() < 18);

    // if the <return> key is released blur so that you can type <h> to add a house number rather than see it appended to the next value.
    $("input.rapidHN.next").keyup(evt => {
      if (evt.which === 13) {
        this.blur();
      }
    });

    $("input.rapidHN.increment").change(() => {
      window.localStorage.setItem("rapidHNincrement", $("input.rapidHN.increment").val());
    });

    $("div.rapidHN-control input").on("change", () => {
      const controls = $("div.rapidHN-control");
      const rapidHNenabled = $("input.rapidHN.next", controls).filter(":visible").val()
        && nonZero($("input.rapidHN.increment", controls));

      if (rapidHNenabled) {
        if (houseNumbersObserver === undefined) {
          const ahn = $("div.toolbar-button.add-house-number");
          ahn.css("font-weight", "bold");
          ahn.css("color", "#2196f3");

          // Listen for WME displaying a new HN input field
          houseNumbersObserver = new MutationObserver(mutations => {
            mutations.forEach(() => {
              const input = $(
                "div.olLayerDiv.house-numbers-layer div.house-number div.content.active:not(\".new\") input.number",
              );
              if (input.val() === "") {
                injectHouseNumber(input);
                // Move focus from input field to WazeMap to prevent accidental additions to the injected HN.
                $("div#WazeMap").focus();
              }
            });
          });
          houseNumbersObserver.observe(
            $("div.olLayerDiv.house-numbers-layer")[0],
            { childList: false, subtree: true, attributes: true },
          );

          // Register rapidAccelerator on keydown event in map.  Use rapidHN namespace to selectively remove later.
          $(W.map.olMap.div).on("keydown.rapidHN", rapidAccelerator);
          const eventList = $._data(W.map.olMap.div, "events");
          eventList.keydown.unshift(eventList.keydown.pop());
        }
      } else {
        disconnectHouseNumbersObserver();
      }
    });

    if (rapidHnNext) {
      $("input.rapidHN.next")
        .filter(":visible")
        .focus()
        .val(rapidHnNext)
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

  function handlePrimaryToolbarMutations(mutations) {
    for (let i = 0; i < mutations.length; i++) {
      const mutation = mutations[i];
      if (mutation.type === "childList") {
        let addHouseNumber = recursiveSearchFor(mutation.addedNodes, [
          "add-house-number",
        ]);
        if (addHouseNumber && !$(".rapidHN-control").length) {
          createRHNcontrols(addHouseNumber);
        }

        const rapidHNNextInput = recursiveSearchFor(mutation.removedNodes, [
          "rapidHN",
          "next",
        ]);
        if (rapidHNNextInput) {
          rapidHNtoolbarButton = undefined;
          rapidHnNext = rapidHNNextInput.value;
          disconnectHouseNumbersObserver();
        }
      }
    }
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
    let increment = oneTimeIncrement ?? Number($("input.rapidHN.increment").val());
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

          increment = Math.floor(increment/26);

          if ((/[a-z]/.test(part) && nextLetter > 'z'.codePointAt(0)) ||
              (/[A-Z]/.test(part) && nextLetter > 'Z'.codePointAt(0))) {
            nextLetter -= 26;
            increment++;
          }

          nextParts[index] = String.fromCodePoint(nextLetter);
          
          if (!increment) break;
        }
    }

    nextElement.val(nextParts.reverse().join(''));
  }

  function nonZero(input) {
    const i = parseInt(input.val(), 10);
    return !isNaN(i) && i !== 0;
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
        && ONE <= event.which
        && event.which <= NINE
      ) {
        oneTimeIncrement = event.which - ONE + 1;
        acceleratorSelected = true;
      } else if (
        event.target.localName !== "input"
        && NUMPAD1 <= event.which
        && event.which <= NUMPAD9
      ) {
        oneTimeIncrement = event.which - NUMPAD1 + 1;
        acceleratorSelected = true;
      } else if (event.which === LETTER_H) {
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

  // Recursively search within the nodeList, and its member's child lists, for a node that has the specified classname.
  // When multiple matching sibling are found returns the first visible match.  Otherwise, returns null.
  function recursiveSearchFor(nodeList, classNames) {
    let secondary = null;
    // eslint-disable-next-line no-restricted-syntax
    for (const node of nodeList) {
      if (
        node.classList
        && classNames.findIndex(
          className => !node.classList.contains(className),
        ) === -1
      ) {
        const visible = node.style.display !== "none";

        if (visible) {
          return node;
        }

        secondary = node;
      }

      if (secondary === null) {
        const primary = recursiveSearchFor(node.childNodes, classNames);
        if (primary != null) {
          return primary;
        }
      }
    }

    return secondary;
  }

  rapidHNBootstrap();
})();

GM_addStyle(`

.rapidHN-control {
    padding-right: 3px;
    float: right;
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--wz-button-height, 40px);
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
