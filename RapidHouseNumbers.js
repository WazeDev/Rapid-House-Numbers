/* global W */
/* global I18n */
/* global $ */

// ==UserScript==
// @name           WME Rapid House Numbers
// @description    A House Number script with its controls in the House Number mini-editor.  It injects the next value in a sequence into each new HN. To support different regions, house numbers may be [0-9]+, [0-9]+[a-z]+, or [0-9]+-[0-9]+.
// @namespace      http://compsol.cc
// @version        2.4
// @include        /^https:\/\/(www|beta)\.waze\.com\/(?!user\/)(.{2,6}\/)?editor\/?.*$/
// @copyright      2017-2022, kjg53
// @author         kjg53, WazeDev (2023-?)
// @license        MIT
// ==/UserScript==

(function() {
    var scriptName = GM_info.script.name;
    var version = GM_info.script.version;

    console.log(scriptName + ": Loading ");

    // Display change log immediately as it has no dependencies on waze itself.
    var changeLog = [
        {version: "1.0", message: ""},
        {version: "1.1", message: "The changelog now handles missing entries."},
        {version: "1.2", message: "Now does full reset when exiting House Number Editor."},
        {version: "1.3", message: "Fixed typo in change log."},
        {version: "1.4", message: "The accelerator key bindings are removed upon exiting the House Number editor."},
        {version: "1.5", message: "The primary accelerator has been changed from 'a' to 'h'.  The keys '1' .. '9' are now accelerators that create the next house number then increment next by the value of the key."},
        {version: "1.6", message: "Disabled numeric accelerators in text fields."},
        {version: "1.7", message: "Added support for numpads.  Event handler now removed when the House Number editor is exited."},
        {version: "1.8", message: "Removed info dialog."},
        {version: "1.9", message: "Increased width of increment field."},
        {version: "1.10", message: "The increment is now persisted between sessions."},
        {version: "1.11", message: "Added missing dependencies to rapidHN."},
        {version: "1.12", message: "Added support for HN such as 7A and 10-5."},
        {version: "1.13", message: "Added control to enable/disable alphanumeric HN. Pressing <enter> on the next HN field will switch the focus to the map so that you can then press <h> to direct the editor to add a house number to the map."},
        {version: "1.14", message: "Restored accelerators."},
        {version: "1.15", message: "Updated global symbols."},
        {version: "1.16", message: "Updated to latest WME"},
        {version: "1.17", message: "Resume after saving"},
        {version: "1.18", message: "Exiting house number editor should clear the next rapid house number field in Beta WME."},
        {version: "2.0", message: "New implementation to work with the current WME."},
        {version: "2.1", message: "Minor change to work with the current WME."},
    ];

    var ALL_DIGITS=/^[0-9]+$/;
    var DIG_ALPHA=/^([0-9]+)([A-Z]$)/i;
    var DIG_DASH_DIG=/^([0-9]+-)([0-9]+)$/;

    var ONE = 49;
    var NINE = 57;
    var NUMPAD1 = 97;
    var NUMPAD9 = 105;
    var LETTER_H = 'H'.charCodeAt(0);

    var rapidHNtoolbarButton = null;
    var oneTimeIncrement;
    var houseNumbersObserver;
    var rapidHnNext;
    var versionKey = scriptName.replace( /\s/g, "") + "Version";
    var checkStorageKey = versionKey + 'Ck';

    var secret = new Date().getTime();
    window.localStorage.setItem(checkStorageKey, secret);
    if (window.localStorage.getItem(checkStorageKey) === secret) {
        var previousVersion = window.localStorage.getItem(versionKey);

        var i = 0;
        if (previousVersion) {
            try {
                while (changeLog[i++].version !== previousVersion) {}
            } catch(e) {
                i = 0;
            }
        }

        var announcement = scriptName;
        while (i < changeLog.length) {
            var log = changeLog[i++];
            var msg = "V" + log.version + ": " + log.message;
            announcement = announcement + "\n" + msg;
        }

        if (announcement !== scriptName) {
            alert(announcement);
            window.localStorage.setItem(versionKey, version);
        }
    }

    // Delay until Waze has been loaded.
    function rapidHN_bootstrap() {
        if (typeof W === "undefined" || typeof W.map === "undefined" ||
            typeof W.selectionManager === "undefined" || typeof I18n === "undefined" ||
            typeof I18n.translations === "undefined" || $('div#primary-toolbar>div').length === 0)
        {
            console.log(scriptName + " dependencies not ready. Waiting...");
            setTimeout(rapidHN_bootstrap, 500);
            return;
        }

        setTimeout(initialize, 999);
    }

    // Initialize RHN once Waze has been loaded.
    function initialize() {
        console.log(scriptName + " initializing.");

        // Quick hack to make sure RHN controls are removed whenever HN editing mode is toggled on/off.
        W.editingMediator.on('change:editingHouseNumbers', evt => $('.rapidHN-control').remove());

        // Listen for changes in the edit mode
        // The contents of div.primary-toolbar is entirely replaced when switching into, and out of, house number mode.

        var primaryToolbar = $('div#primary-toolbar');
        var primaryToolbarObserver = new MutationObserver(handlePrimaryToolbarMutations);
        if (primaryToolbar.length) {
            primaryToolbarObserver.observe( primaryToolbar[0], { childList:true, subtree:true });
        } else {
            console.log("ERROR: Failed to find div#primary-toolbar");
        }

        W.map.registerMapEvent("zoomend", function(e) {
            enableDisableControls(rapidHNtoolbarButton, e.object.zoom < 18);
        }, this);
        console.log(scriptName + " initialized.");
    }

    function createRHNcontrols(addHouseNumberNode) {
        var initialIncrement = (window.localStorage.getItem("rapidHNincrement") || 4).toString();

        // NOTE: We have two input.rapidHN.next fields because the type property cannot be modified.  We, instead, create two fields
        // then use a function, updateRapidHNnextVisibility, to determine which one is currently visible.
        $(addHouseNumberNode).
        after('<div class="toolbar-button rapidHN-control" style="float:left; padding-right: 3px"><span class="menu-title">Next #</span>' +
            '<input type="text"   class="rapidHN next" style="margin: 3px; height:20px; width: 64px; text-align: right">' +
            '<input type="number" class="rapidHN next" style="margin: 3px; height:20px; width: 64px; text-align: right">' +
            '<span id="rapidHN-input-type" style="font-size: 10px;">#</span><span id="rapidHN-input-is-number" style="display:none">1,2,3</span>' +
            '<span id="rapidHN-input-is-text" style="display:none">123,456ABC,789-321</span></div>',
            '<div class="toolbar-button rapidHN-control" style="float:left"><span class="menu-title" style="text-align: right">Increment</span>' +
            '<input type="number" name="incrementHN" class="rapidHN increment" value="' + initialIncrement + '" style="margin: 3px; height:20px; width: 45px; text-align: right" step="1"></div>');

        rapidHNtoolbarButton = addHouseNumberNode.nextSibling;
        updateRapidHNnextVisibility(false);

        enableDisableControls(rapidHNtoolbarButton, W.map.getZoom() < 18);

        $('span#rapidHN-input-type').click(function(evt) {
            var nextInputType = window.localStorage.getItem("rapidHNnextInputType") || 'number';

            nextInputType = {number: 'text', text: 'number'}[nextInputType];

            window.localStorage.setItem("rapidHNnextInputType", nextInputType);
            updateRapidHNnextVisibility(true);
        });

        // if the <return> key is released blur so that you can type <h> to add a house number rather than see it appended to the next value.
        $('input.rapidHN.next').keyup(function(evt) {
            if (evt.which === 13) {
                this.blur();
            }
        });

        $('input.rapidHN.increment').change(function() {
            window.localStorage.setItem("rapidHNincrement", $(this).val());
        });

        $('div.rapidHN-control input').on('change', function(event) {
            var controls = $('div.rapidHN-control');
            var rapidHNenabled =
                $('input.rapidHN.next', controls).filter(":visible").val() &&
                nonZero($('input.rapidHN.increment', controls));

            if (rapidHNenabled) {
                if (houseNumbersObserver === undefined) {
                    var ahn = $('div.toolbar-button.add-house-number');
                    ahn.css('font-weight', 'bold');
                    ahn.css('color', '#2196f3');

                    // Listen for WME displaying a new HN input field
                    houseNumbersObserver = new MutationObserver(function(mutations, observer){
                        mutations.forEach(function(mutation) {
                            var input = $('div.olLayerDiv.house-numbers-layer div.house-number div.content.active:not(".new") input.number');
                            if (input.val() === "") {
                                injectHouseNumber(input);
                                // Move focus from input field to WazeMap to prevent accidental additions to the injected HN.
                                $("div#WazeMap").focus();
                            }
                        });
                    });
                    houseNumbersObserver.observe( $('div.olLayerDiv.house-numbers-layer')[0], { childList:false, subtree:true, attributes: true });

                    // Register rapidAccelerator on keydown event in map.  Use rapidHN namespace to selectively remove later.
                    $(W.map.olMap.div).on('keydown.rapidHN', rapidAccelerator);
                    var eventList = $._data(W.map.olMap.div, "events");
                    eventList.keydown.unshift(eventList.keydown.pop());
                }
            } else {
                disconnectHouseNumbersObserver();
            }
        });

        $('div.toolbar-button.waze-icon-exit').click(function() {
            // Add ItemDisabled to add-house-number to prevent handlePrimaryToolbarMutations from saving a value
            // in rapidHnNext when exiting the house number editor mode.  This is, currently, only
            // an issue in beta as it's firing this event handler BEFORE WME's own event handler
            // deletes the input fields.
            $('div.toolbar-button.add-house-number').addClass('ItemDisabled');
            rapidHnNext = undefined;
        });

        if(rapidHnNext) {
            $('input.rapidHN.next').filter(":visible").focus().val(rapidHnNext).blur().trigger('change');
        }
    }

    function disconnectHouseNumbersObserver() {
        if (houseNumbersObserver !== undefined) {
            var ahn1 = $('div.toolbar-button.add-house-number');
            ahn1.css('font-weight', 'normal');
            ahn1.css('color', 'inherit');

            houseNumbersObserver.disconnect();
            houseNumbersObserver = undefined;

            var div = $(W.map.olMap.div);
            div.off('keydown.rapidHN');
        }
    }


    function enableDisableControls(toolbarButton, disabled) {
        if (toolbarButton) {
            toolbarButton.childNodes.forEach(function (node) {
                if (node.nodeName === 'INPUT' && node.classList.contains('rapidHN')) {
                    if (disabled) {
                        node.setAttribute('disabled', 'disabled');
                        disconnectHouseNumbersObserver();
                    } else {
                        node.removeAttribute('disabled');
                    }
                }
            });
        }
    }

    function handlePrimaryToolbarMutations(mutations, observer) {
        for(let i = 0; i < mutations.length; i++) {
            var mutation = mutations[i];
            if (mutation.type === 'childList') {
                var addHouseNumber = recursiveSearchFor(mutation.addedNodes, ['add-house-number']);
                if (addHouseNumber && !$('.rapidHN-control').length) {
                    createRHNcontrols(addHouseNumber);
                }

                var rapidHN_next = recursiveSearchFor(mutation.removedNodes, ["rapidHN", "next"]);
                if (rapidHN_next) {
                    rapidHNtoolbarButton = undefined;

                    addHouseNumber = rapidHN_next.previousSibling;//recursiveSearchFor(mutation.addedNodes, ['add-house-number']);
                    if (addHouseNumber && !addHouseNumber.classList.contains('ItemDisabled')) {
                        rapidHnNext = rapidHN_next.value;
                    }

                    disconnectHouseNumbersObserver();
                }
            }
        }
    }

    function setNativeValue(element, value) {
        let lastValue = element.value;
        element.value = value;
        let event = new Event("input", { target: element, bubbles: true });
        // React 15
        event.simulated = true;
        // React 16
        let tracker = element._valueTracker;
        if (tracker) {
            tracker.setValue(lastValue);
        }
        element.dispatchEvent(event);
    }

    function injectHouseNumber(newHouseNumber) {
        var incElm = $('input.rapidHN.increment');

        var inc;
        if (oneTimeIncrement) {
            inc = oneTimeIncrement;
            oneTimeIncrement = undefined;
        } else {
            inc = parseInt(incElm.val());
        }

        var nextElement = $('input.rapidHN.next').filter(":visible");
        var next = nextElement.val();

        if (ALL_DIGITS.test(next)) {
            // Inject next HN into WME
            //newHouseNumber.val(next).change();
            setNativeValue(newHouseNumber[0], next);

            var n = parseInt(next);

            nextElement.val(n + inc);
        } else if (DIG_ALPHA.test(next)) {
            // Inject next HN into WME
            //newHouseNumber.val(next).change();
            setNativeValue(newHouseNumber[0], next);

            var digAlpha = next.match(DIG_ALPHA);
            var curLet = digAlpha[2];
            var min,max;
            if ('a' <= curLet && curLet <= 'z') {
                min = 'a'.codePointAt(0);
                max = 'z'.codePointAt(0);
            } else if ('A' <= curLet && curLet <= 'Z') {
                min = 'A'.codePointAt(0);
                max = 'Z'.codePointAt(0);
            } else {
                return;
            }

            var nxtLet = curLet.codePointAt(0) + inc;
            // if we need to wrap the letter
            if (nxtLet > max) {
                // Increment the numeric portion
                digAlpha[1] = "" + (parseInt(digAlpha[1]) + 1);

                // wrap the letter
                nxtLet -= max;
                nxtLet += (min - 1);
            }
            digAlpha[2] = String.fromCodePoint(nxtLet);

            nextElement.val(digAlpha[1] + digAlpha[2]);
        } else if (DIG_DASH_DIG.test(next)) {
            // Inject next HN into WME
            //newHouseNumber.val(next).change();
            setNativeValue(newHouseNumber[0], next);

            var digDig = next.match(DIG_DASH_DIG);

            // Increment the numeric portion
            digDig[2] = "" + (parseInt(digDig[2]) + inc);

            nextElement.val(digDig[1] + digDig[2]);
        }
    }

    function nonZero(input) {
        var i = parseInt(input.val(), 10);
        return !isNaN(i) && i !== 0;
    }

    // Type 1-9 instead of 'h' to specify a one-time increment that be applied after the current "next" value is added to the map
    function rapidAccelerator(event) {
        if (!event.shiftKey && !event.altKey && !event.metaKey) {
            var acceleratorSelected = false;

            if (event.target.localName != 'input' && ONE <= event.which && event.which <= NINE) {
                oneTimeIncrement = event.which - ONE + 1;
                acceleratorSelected = true;
            } else if (event.target.localName != 'input' && NUMPAD1 <= event.which && event.which <= NUMPAD9) {
                oneTimeIncrement = event.which - NUMPAD1 + 1;
                acceleratorSelected = true;
            } else if (event.which == LETTER_H) {
                oneTimeIncrement = undefined;
                acceleratorSelected = true;
            }

            if (acceleratorSelected) {
                // Prevent further event listeners from running
                event.preventDefault();
                event.stopImmediatePropagation();

                // Click the Add House Number in the top nav bar
                $('.toolbar wz-button.add-house-number').click();
            }
        }
    }

    // Recursively search within the nodeList, and its member's child lists, for a node that has the specified classname.
    // When multiple matching sibling are found returns the first visible match.  Otherwise, returns null.
    function recursiveSearchFor(nodeList, classNames) {
        var secondary = null;

        for (let node of nodeList) {
            if (node.classList && -1 === classNames.findIndex((className) => !node.classList.contains(className))) {
                var display = node.attributeStyleMap.get("display");
                let visible = !display || "none" !== display.value;

                if (visible) {
                    return node;
                }

                secondary = node;
            }

            if (secondary === null) {
                var primary = recursiveSearchFor(node.childNodes, classNames);
                if (primary != null) {
                    return primary;
                }
            }
        }

        return secondary;
    }

    function updateRapidHNnextVisibility(showTooltip) {
        var nextInputType = window.localStorage.getItem("rapidHNnextInputType") || 'number';
        var inputs = $('input.rapidHN.next');

        inputs.hide();
        let nextInput = inputs.filter("[type='" + nextInputType + "']");
        nextInput.show();

        var weight = {number: 'bold', text: 'normal'}[nextInputType];

        $('span#rapidHN-input-type').css('font-weight', weight);

        if (showTooltip) {
            var tooltip = $('span#rapidHN-input-is-' + nextInputType);
            tooltip.show(2000, function() {tooltip.fadeOut(2000);});
        }
    }

    rapidHN_bootstrap();
})();
