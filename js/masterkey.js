"use strict";

import Logger from "./logger.js";
import Patterns from "./patterns.js";
import Converter from "./convert.js";
import Config from "./serviceconfig.js";
import Download from "./download.js";

if ("serviceWorker" in navigator) {
    navigator.serviceWorker
        .register("serviceworker.js")
        .then(() => {
            console.log("service worker registered");
        });
}

/**
 * Management of configurable service keys using a master password and PBKDF2.
 *
 * @author Andreas Rümpel <ruempel@gmail.com>
 */
window.addEventListener('DOMContentLoaded', async () => {
    // check for APIs
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder || !window.TextDecoder) {
        Logger.log("Browser lacks API support, get a new one");
        return;
    }

    registerListeners();

    // load config file contents into Config object
    const response = await fetch('data/config.txt');
    const responseText = await response.text();
    Config.servicesEncrypted = responseText.trim().replace(/[\r\n]/g, "");
    Logger.debug("Load encrypted services configuration from file (finished)");
});

/**
 * Register event listeners for input fields and buttons.
 */
function registerListeners() {
    // register master key input and decrypt button handlers
    const decryptButton = jQuery("#decrypt-config");
    jQuery("#masterkey")
        .change(importMasterKey) // re-import master key on each input string change
        .keypress(event => {
            decryptButton.removeClass("btn-success").addClass("btn-danger"); // switch to red color
            if (event.key === "Enter")
                importMasterKey().then(decryptConfig); // try decryption, when master key entered
        });
    decryptButton.click(decryptConfig); // try decryption, when button clicked

    // register listeners for other buttons
    jQuery("#derive-keys").click(deriveServiceKeys);
    jQuery("#export-config").click(encryptConfig);

    // register click listener for new service input form elements
    jQuery("#add-new-service-name").click(() => {
        const newServiceName = jQuery("#new-service-name");
        // validate service name
        if (null === newServiceName.val().trim().match(/\w+[.]\w+/)) {
            Logger.log("Invalid service name to add.");
        } else {
            Config.addService(newServiceName.val().trim());
            // force re-render
            deriveServiceKeys();
            newServiceName.val("");
        }
    });

    // disable default reload for form encapsulating password
    jQuery("#passwordform").submit(() => {
        return false;
    });
}

/**
 * Imports the user secret from the password field to a CryptoKey object.
 * Stores the derived master key in Config.userSecret.
 *
 * @returns {PromiseLike<CryptoKey>} master key derived from user secret
 */
function importMasterKey() {
    Logger.debug("Import master key from user input");
    return window.crypto.subtle.importKey( // create CryptoKey from input master password
        "raw",
        Converter.encodeFromText(jQuery("#masterkey").val().trim()),
        "PBKDF2",
        false,
        ["deriveKey"]).then(key => {
        Config.userSecret = key;
        return deriveKey(key, "config", 1000).then(aesKey => { // use pre-defined salt and iterations count
            Config.configKeyAES = aesKey;
        });
    });
}

/**
 * Attempts to decrypt services configuration with the master key derived from the input user secret.
 */
function decryptConfig() {
    const iv = Converter.encodeFromHexString(Config.servicesEncrypted.substr(0, 32)); // extract init vector from first 32 characters
    const payload = Config.servicesEncrypted.substr(32); // cut off init vector from payload
    window.crypto.subtle.decrypt(
        {name: "AES-CBC", iv: iv},
        Config.configKeyAES,
        Converter.encodeFromHexString(payload)
    ).then(config => {
        const decodedConfig = Converter.decodeToText(config);
        Config.services = JSON.parse(decodedConfig);
        jQuery("#decrypt-config").removeClass("btn-danger").addClass("btn-success");
        Logger.debug("Decrypt services configuration for " + Config.services.length + " services (finished)");
    }).catch(reason => {
        Logger.log("Wrong master key: " + reason, "Wrong master key");
    });
}

/**
 * Derive raw service keys for all services configured with the given count of iterations. Patterns are applied later.
 */
function deriveServiceKeys() {
    const table = jQuery("table#services tbody");
    table.empty();
    for (const service of Config.services) { // process all services configured
        let iterations = 1;
        if (service.iterations !== undefined && !isNaN(parseInt(service.iterations, 10))) {
            iterations = parseInt(service.iterations, 10);
        } else {
            service.iterations = 1; // set iterations to 1 when missing
        }

        deriveKey(Config.userSecret, service.name, 1000 + iterations).then(aesKey => {
            return window.crypto.subtle.exportKey("raw", aesKey); // export key for display
        }).then(arrayBuffer => {
            computeAndRenderServiceKey(new Uint8Array(arrayBuffer), service, table);
        }).catch(reason => {
            Logger.log("Key derivation failed: " + reason, "Key derivation failed");
        });
    }
}

/**
 * Compute passwords for services and render them.
 *
 * @param {Uint8Array} keyBytes - derived service key as raw bytes
 * @param {Service} service - service entry object
 * @param {jQuery} table - jQuery object to render the service entries into
 */
function computeAndRenderServiceKey(keyBytes, service, table) {
    if (service.pattern === undefined) service.pattern = Object.getOwnPropertyNames(Patterns.templates)[0];
    const templateClass = Patterns.templates[service.pattern];
    const template = templateClass[keyBytes[0] % templateClass.length];
    const serviceKey = template.split("").map(function (c, i) {
        const characters = Patterns.keycharacters[c];
        return characters[keyBytes[i + 1] % characters.length];
    }).join("");

    const row = jQuery("<tr/>").appendTo(table);
    jQuery("<td/>").text(service.name).appendTo(row);
    jQuery("<td/>").text(serviceKey).appendTo(row).addClass("key").click(data => {
        selectElementText(data.target); // select key on click
    });

    // handle pattern selector
    const select = jQuery("<select/>").addClass("form-control form-control-sm");
    for (const template of Object.getOwnPropertyNames(Patterns.templates)) {
        const option = jQuery("<option/>").text(template).val(template).appendTo(select);
        if (template === service.pattern) option.prop("selected", true);
    }
    select.change(() => {
        service.pattern = select.val().trim();
        deriveServiceKeys();
    });
    jQuery("<td/>").append(select).appendTo(row);

    // handle iterations selector
    const count = jQuery("<input/>").addClass("form-control form-control-sm").attr({
        type: "number",
        min: "1"
    }).val(service.iterations);
    count.change(() => {
        service.iterations = parseInt(count.val());
        deriveServiceKeys();
    });
    jQuery("<td/>").append(count).appendTo(row);

    // management buttons
    const qrcodeButton = jQuery("<button/>")
        .addClass("btn btn-light")
        .attr({type: "button", "data-toggle": "tooltip", title: "Show QR Code"})
        .html("<i class='fas fa-qrcode'></i>");

    qrcodeButton.click(() => {
        // create QR code
        let qr = qrcode(4, "M"); // type number and error correction level
        qr.addData(serviceKey);
        qr.make();

        jQuery("div#qrcode").remove(); // remove old modals to prevent memory leak
        jQuery("<div/>").addClass("modal")
            .attr({tabindex: -1, role: "dialog", id: "qrcode"})
            .html(qr.createSvgTag({cellSize: 4})).modal("show");
    });

    const deleteButton = jQuery("<button/>")
        .addClass("btn btn-danger").attr("type", "button").html("<i class='fas fa-trash'></i>");
    deleteButton.click(() => {
        Config.removeService(service.name);
        deriveServiceKeys();
        // TODO make removal action more smooth in terms of refreshing the table contents
    });
    jQuery("<td/>").append(qrcodeButton).append(deleteButton).appendTo(row);
}

/**
 * Select text to copy easily.
 *
 * @param {Node} element - DOM element containing text to be selected
 */
function selectElementText(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Derives configuration key or services keys from master key.
 *
 * @param {CryptoKey} masterKey - key to derive other key from
 * @param {string} salt - salt for key derivation
 * @param {number} iterations - hashing iterations
 * @returns {PromiseLike<CryptoKey>} promise containing the derived key
 */
function deriveKey(masterKey, salt, iterations) {
    return window.crypto.subtle.deriveKey({
            name: "PBKDF2",
            salt: Converter.encodeFromText(salt),
            iterations: iterations,
            hash: "SHA-512"
        },
        masterKey,
        {name: "AES-CBC", length: 256},
        true,
        ["encrypt", "decrypt"]
    );
}

/**
 * Manages encryption of services configuration and its download as a file.
 */
async function encryptConfig() {
    const iv = window.crypto.getRandomValues(new Uint8Array(16));
    if (Config.configKeyAES != null) {
        const encryptedConfig = await window.crypto.subtle.encrypt(
            {name: "AES-CBC", iv: iv},
            Config.configKeyAES,
            Converter.encodeFromText(JSON.stringify(Config.services))
        );
        const decodedEncryptedConfig = Converter.decodeToHexString(encryptedConfig);
        const configToExport = Converter.decodeToHexString(iv) + decodedEncryptedConfig; // prepend init vector
        Download.downloadFile(configToExport);
    } else
        Logger.debug("Please load service configuration before trying to export.", "No config to export");
}
