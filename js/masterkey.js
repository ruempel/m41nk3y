"use strict";

import Logger from "./logger.js";
import Util from "./util.js";
import Patterns from "./patterns.js";
import Converter from "./convert.js";
import Config from "./serviceconfig.js";
import Download from "./download.js";

if ("serviceWorker" in navigator) {
    navigator.serviceWorker
        .register("serviceworker.js")
        .then(() => {
            Logger.log("service worker registered");
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
    Logger.debug("Load encrypted services configuration from file (finished).");
});

/**
 * Register event listeners for input fields and buttons.
 */
function registerListeners() {
    // register listeners for master key input field
    Util.addListener("#masterkey", "change", importMasterKey);
    Util.addListener("#masterkey", "keypress", event => {
        Util.replaceClasses("#decrypt-config", "btn-success", "btn-danger");
        if (event.key === "Enter")
            importMasterKey().then(decryptConfig); // try decryption, when master key entered
    });

    // register listeners for buttons
    Util.addListener("#decrypt-config", "click", decryptConfig); // try decryption, when button clicked
    Util.addListener("#derive-keys", "click", deriveServiceKeys);
    Util.addListener("#export-config", "click", encryptConfig);

    // register click listener for new service input form elements
    Util.addListener("#add-new-service-name", "click", () => {
        const newServiceName = document.querySelector("#new-service-name");
        // validate service name
        if (null === newServiceName.value.trim().match(/\w+[.]\w+/)) {
            Logger.log("Invalid service name to add.");
        } else {
            Config.addService(newServiceName.value.trim());
            // force re-render
            deriveServiceKeys();
            newServiceName.value = "";
        }
    });

    // disable default reload for form encapsulating password
    jQuery("#passwordform").submit(() => {
        return false;
    });
}

/**
 * Imports the user secret from the password field to a CryptoKey object.
 * Stores the master key imported from user input to Config.userSecret.
 * Stores the AES key for config file decryption to Config.configKeyAES.
 */
async function importMasterKey() {
    Logger.debug("Import master key from user input");
    Config.userSecret = await window.crypto.subtle.importKey( // create CryptoKey from input master password
        "raw",
        Converter.encodeFromText(document.querySelector("#masterkey").value.trim()),
        "PBKDF2",
        false,
        ["deriveKey"]);
    const salt = "config";
    const iterationsCount = 1000;
    Config.configKeyAES = await deriveKey(Config.userSecret, salt, iterationsCount);
}

/**
 * Attempts to decrypt services configuration with Config.configKeyAES.
 */
async function decryptConfig() {
    const initVectorLength = 32;
    const initVector = Converter.encodeFromHexString(Config.servicesEncrypted.substr(0, initVectorLength)); // extract init vector
    const payload = Config.servicesEncrypted.substr(initVectorLength); // cut off init vector from payload
    window.crypto.subtle.decrypt(
        {name: "AES-CBC", iv: initVector},
        Config.configKeyAES,
        Converter.encodeFromHexString(payload)
    ).then(config => {
            const decodedConfig = Converter.decodeToText(config);
            Config.services = JSON.parse(decodedConfig);
            Util.replaceClasses("#decrypt-config", "btn-danger", "btn-success");
            Logger.debug("Decrypt services configuration for " + Config.services.length + " services (finished)");
        }
    ).catch(result => {
        Logger.log("Wrong master key: " + result, "Wrong master key");
    });
}

/**
 * Derive raw service keys for all services configured with the given count of iterations. Patterns are applied later.
 */
function deriveServiceKeys() {
    const tbody = document.querySelector("table#services tbody");

    // remove all table rows
    while (tbody.firstChild) {
        tbody.removeChild(tbody.lastChild);
    }

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
            computeAndRenderServiceKey(new Uint8Array(arrayBuffer), service, tbody);
        }).catch(reason => {
            Logger.log("Key derivation failed: " + reason, "Key derivation failed");
        });
    }
}

/**
 * Compute passwords for services and render them.
 *
 * @param {Uint8Array} keyBytes derived service key as raw bytes
 * @param {Service} service service entry object
 * @param {Element} tbody tbody element to render the service entries into
 */
function computeAndRenderServiceKey(keyBytes, service, tbody) {
    if (service.pattern === undefined) service.pattern = Object.getOwnPropertyNames(Patterns.templates)[0];
    const templateClass = Patterns.templates[service.pattern];
    const template = templateClass[keyBytes[0] % templateClass.length];
    const serviceKey = template.split("").map(function (c, i) {
        const characters = Patterns.keycharacters[c];
        return characters[keyBytes[i + 1] % characters.length];
    }).join("");

    const row = jQuery("<tr/>").appendTo(tbody);
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
