/* global W */
/* global I18n */
/* global $ */
/* global WazeWrap */

// ==UserScript==
// @name          WME Rapid House Numbers
// @description   A House Number script with its controls in the House Number mini-editor.  It injects the next value in a sequence into each new HN. To support different regions, house numbers may be [0-9]+, [0-9]+[a-z]+, or [0-9]+-[0-9]+.
// @namespace     https://github.com/WazeDev
// @version       2.7
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
    { version: "1.5", message: "The primary accelerator has been changed from 'a' to 'h'.  The keys '1' .. '9' are now accelerators that create the next house number then increment next by the value of the key." },
    { version: "1.6", message: "Disabled numeric accelerators in text fields." },
    { version: "1.7", message: "Added support for numpads.  Event handler now removed when the House Number editor is exited." },
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
  ];

  const ALL_DIGITS = /^[0-9]+$/;
  const DIG_ALPHA = /^([0-9]+)([A-Z]$)/i;
  const DIG_DASH_DIG = /^([0-9]+-)([0-9]+)$/;

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
    if (WazeWrap?.Ready) {
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
        } else {
          startIndex++; // Start from the next version after the previous version
        }
      }
      announcement += "<ul>";
      // Build the announcement message from the change log
      for (let i = startIndex; i < changeLog.length; i++) {
        const msg = `<li> V${changeLog[i].version}: ${changeLog[i].message} </li>\n`;
        announcement += msg;
      }
      announcement += "</ul>";

      // Show the announcement if there are new changes
      if (announcement !== scriptName) {
        console.log(`${scriptName} v${version} changelog:`, announcement);
        WazeWrap.Interface.ShowScriptUpdate(
          scriptName,
          `V${changeLog[startIndex - 1].version} -> V${version}`,
          announcement,
          "https://greasyfork.org/en/scripts/35931-wme-rapid-house-numbers",
        );
        window.localStorage.setItem(versionKey, version);
      }
    } else {
      setTimeout(checkVersion, 200);
    }
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
      || $("div#primary-toolbar>div").length === 0
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
    // The contents of div.primary-toolbar is entirely replaced when switching into, and out of, house number mode.

    const primaryToolbar = $("div#primary-toolbar");
    const primaryToolbarObserver = new MutationObserver(
      handlePrimaryToolbarMutations,
    );
    if (primaryToolbar.length) {
      primaryToolbarObserver.observe(primaryToolbar[0], {
        childList: true,
        subtree: true,
      });
    } else {
      console.log("ERROR: Failed to find div#primary-toolbar");
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

    // NOTE: We have two input.rapidHN.next fields because the type property cannot be modified.  We, instead, create two fields
    // then use a function, updateRapidHNnextVisibility, to determine which one is currently visible.
    $(addHouseNumberNode).after(`
            <div class="rapidHN-control">
                <div class="toolbar-button rapidHN-input">
                    <span class="menu-title rapidHN-text">Next #</span>
                    <div class="rapidHN-text-input sm">
                        <input type="text" class="rapidHN next">
                        <input type="number" class="rapidHN next">
                    </div>
                    <div id="rapidHN-input-type" class="rapidHN-switch-mode">
                        <button id="current-input-type">1</button>
                        <span class="tooltiptext" id="rapidHN-input-is-number">1,2,3</span>
                        <span class="tooltiptext" id="rapidHN-input-is-text" style="display:none">1a,2b,3c & 12-3</span>
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
    updateRapidHNnextVisibility(false);

    enableDisableControls(rapidHNtoolbarButton, W.map.getZoom() < 18);

    $("button#current-input-type").click(() => {
      let nextInputType = window.localStorage.getItem("rapidHNnextInputType") || "number";

      nextInputType = { number: "text", text: "number" }[nextInputType];

      window.localStorage.setItem("rapidHNnextInputType", nextInputType);
      updateRapidHNnextVisibility(true);
    });

    // if the <return> key is released blur so that you can type <h> to add a house number rather than see it appended to the next value.
    $("input.rapidHN.next").keyup(evt => {
      if (evt.which === 13) {
        this.blur();
      }
    });

    $("input.rapidHN.increment").change(() => {
      window.localStorage.setItem("rapidHNincrement", $(this).val());
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

    $("div.toolbar-button.waze-icon-exit").click(() => {
      // Add ItemDisabled to add-house-number to prevent handlePrimaryToolbarMutations from saving a value
      // in rapidHnNext when exiting the house number editor mode.  This is, currently, only
      // an issue in beta as it's firing this event handler BEFORE WME's own event handler
      // deletes the input fields.
      $("div.toolbar-button.add-house-number").addClass("ItemDisabled");
      rapidHnNext = undefined;
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

        const rapidHNNext = recursiveSearchFor(mutation.removedNodes, [
          "rapidHN",
          "next",
        ]);
        if (rapidHNNext) {
          rapidHNtoolbarButton = undefined;

          addHouseNumber = rapidHNNext.previousSibling; // recursiveSearchFor(mutation.addedNodes, ['add-house-number']);
          if (
            addHouseNumber
            && !addHouseNumber.classList.contains("ItemDisabled")
          ) {
            rapidHnNext = rapidHNNext.value;
          }

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
    const incElm = $("input.rapidHN.increment");

    let inc;
    if (oneTimeIncrement) {
      inc = oneTimeIncrement;
      oneTimeIncrement = undefined;
    } else {
      inc = parseInt(incElm.val(), 10);
    }

    const nextElement = $("input.rapidHN.next").filter(":visible");
    const next = nextElement.val();

    if (ALL_DIGITS.test(next)) {
      // Inject next HN into WME
      // newHouseNumber.val(next).change();
      setNativeValue(newHouseNumber[0], next);

      const n = parseInt(next, 10);

      nextElement.val(n + inc);
    } else if (DIG_ALPHA.test(next)) {
      // Inject next HN into WME
      // newHouseNumber.val(next).change();
      setNativeValue(newHouseNumber[0], next);

      const digAlpha = next.match(DIG_ALPHA);
      const curLet = digAlpha[2];
      let min;
      let max;
      if (curLet >= "a" && curLet <= "z") {
        min = "a".codePointAt(0);
        max = "z".codePointAt(0);
      } else if (curLet >= "A" && curLet <= "Z") {
        min = "A".codePointAt(0);
        max = "Z".codePointAt(0);
      } else {
        return;
      }

      let nxtLet = curLet.codePointAt(0) + inc;
      // if we need to wrap the letter
      if (nxtLet > max) {
        // Increment the numeric portion
        digAlpha[1] = `${parseInt(digAlpha[1], 10) + 1}`;

        // wrap the letter
        nxtLet -= max;
        nxtLet += min - 1;
      }
      digAlpha[2] = String.fromCodePoint(nxtLet);

      nextElement.val(digAlpha[1] + digAlpha[2]);
    } else if (DIG_DASH_DIG.test(next)) {
      // Inject next HN into WME
      // newHouseNumber.val(next).change();
      setNativeValue(newHouseNumber[0], next);

      const digDig = next.match(DIG_DASH_DIG);

      // Increment the numeric portion
      digDig[2] = `${parseInt(digDig[2], 10) + inc}`;

      nextElement.val(digDig[1] + digDig[2]);
    }
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

    $(nodeList).each(node => {
      if (
        node.classList
        && classNames.findIndex(
          className => !node.classList.contains(className),
        ) === -1
      ) {
        const { display } = window.getComputedStyle(node);
        const visible = display !== "none";

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

      return null;
    });

    return secondary;
  }

  function updateRapidHNnextVisibility(showTooltip) {
    const nextInputType = window.localStorage.getItem("rapidHNnextInputType") || "number";
    const inputs = $("input.rapidHN.next");

    inputs.hide();
    const nextInput = inputs.filter(`[type='${nextInputType}']`);
    nextInput.show();

    $("button#current-input-type").text(
      { number: "1", text: "A" }[nextInputType],
    );

    if (showTooltip) {
      // hide both tooltips
      ["number", "text"].forEach(type => {
        const tooltip = $(`span#rapidHN-input-is-${type}`);
        tooltip.hide();
      });

      const tooltip = $(`span#rapidHN-input-is-${nextInputType}`);
      tooltip.show();
    }
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
