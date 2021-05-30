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
 * Registers event listeners for input fields and buttons.
 */
function registerListeners() {
    // disable default reload for form encapsulating password
    Util.addListener("#passwordform", "keypress", event => {
        if (event.key === "Enter") {
            event.preventDefault();
        }
    });

    // register listeners for master key input field
    async function checkChangedInput(event) {
        await importMasterKey();
        if (event.key === "Enter") {
            await decryptConfig(); // try decryption, when master key entered
        }
    }
    Util.addListener("#masterkey", "paste", checkChangedInput);
    Util.addListener("#masterkey", "keypress", checkChangedInput);


    // register listeners for buttons
    Util.addListener("#decrypt-config", "click", () => {
        importMasterKey().then(decryptConfig);
    }); // try decryption, when button clicked
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
    try {
        const configAsArrayBuffer = await window.crypto.subtle.decrypt(
            {name: "AES-CBC", iv: initVector},
            Config.configKeyAES,
            Converter.encodeFromHexString(payload)
        );
        const decodedConfig = Converter.decodeToText(configAsArrayBuffer);
        Config.services = JSON.parse(decodedConfig);
        Util.replaceClasses("#decrypt-config", "btn-danger", "btn-success");
        Logger.debug("Decrypt services configuration for " + Config.services.length + " services (finished)");

        deriveServiceKeys();
    } catch (result) {
        Logger.log("Wrong master key: " + result, "Wrong master key");
        Util.replaceClasses("#decrypt-config", "btn-success", "btn-danger");
    }
}

/**
 * Derives raw service keys for all services configured with the given count of iterations. Patterns are applied later.
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
 * Computes passwords for services and render them.
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

    const row = document.createElement("tr");
    tbody.appendChild(row);

    const cellServiceName = document.createElement("td");
    row.appendChild(cellServiceName); // TODO make service name clickable
    cellServiceName.innerText = service.name;

    const cellServiceKey = document.createElement("td");
    row.appendChild(cellServiceKey);
    cellServiceKey.innerText = serviceKey;
    cellServiceKey.setAttribute("class", "key");
    cellServiceKey.addEventListener("click", data => {
        selectElementText(data.target); // select key on click
    });

    // handle pattern selector
    const cellPattern = document.createElement("td");
    row.appendChild(cellPattern);

    const select = document.createElement("select");
    cellPattern.appendChild(select);
    select.setAttribute("class", "form-control form-control-sm");

    for (const template of Object.getOwnPropertyNames(Patterns.templates)) {
        select.appendChild(new Option(template, template,
            template === service.pattern, template === service.pattern));
    }

    select.addEventListener("change", () => {
        service.pattern = select.value.trim();
        deriveServiceKeys();
    });

    // handle iterations selector
    const cellIterations = document.createElement("td");
    row.appendChild(cellIterations);

    // TODO add extra decrement and increment buttons to the left and right side of a readonly number
    const count = document.createElement("input");
    cellIterations.appendChild(count);
    count.setAttribute("class", "form-control form-control-sm");
    count.setAttribute("type", "number");
    count.setAttribute("min", "1");
    count.value = service.iterations.toString();

    count.addEventListener("change", () => {
        service.iterations = parseInt(count.value);
        deriveServiceKeys();
    });

    // management buttons
    const cellActions = document.createElement("td");
    row.appendChild(cellActions);

    // button for showing QR code
    const buttonQrCode = document.createElement("button");
    cellActions.appendChild(buttonQrCode);
    buttonQrCode.setAttribute("class", "btn btn-light");
    buttonQrCode.setAttribute("type", "button");
    buttonQrCode.setAttribute("data-toggle", "tooltip");
    buttonQrCode.setAttribute("title", "Show QR code for " + service.name);
    buttonQrCode.innerHTML = "<i class='fas fa-qrcode'></i>";
    buttonQrCode.addEventListener("click", () => {
        showQrCode(serviceKey);
    });

    // button for deleting service from list
    const buttonDelete = document.createElement("button");
    cellActions.appendChild(buttonDelete);
    buttonDelete.setAttribute("class", "btn btn-danger");
    buttonDelete.setAttribute("type", "button");
    buttonDelete.setAttribute("data-toggle", "tooltip");
    buttonDelete.setAttribute("title", "Remove " + service.name + " from services list");
    buttonDelete.innerHTML = "<i class='fas fa-trash'></i>";
    buttonDelete.addEventListener("click", () => {
        Config.removeService(service.name);
        deriveServiceKeys();
        // TODO make removal action more smooth in terms of refreshing the table contents
    });
}

/**
 * Creates a QR code from a string and display it as a modal.
 *
 * @param {string} text string to convert and display as a QR code
 */
function showQrCode(text) {
    let qr = qrcode(4, "M"); // type number and error correction level
    qr.addData(text);
    qr.make();
    let qrCodeSvgTag = qr.createSvgTag({cellSize: 4});

    // update content and show modal
    let qrCodeContainer = document.querySelector("#qrcode");
    qrCodeContainer.querySelector(".modal-content").innerHTML = qrCodeSvgTag;
    new bootstrap.Modal(qrCodeContainer).show();
}

/**
 * Selects text to copy easily.
 *
 * @param {Node} element DOM element containing text to be selected
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
 * @param {CryptoKey} masterKey key to derive other key from
 * @param {string} salt salt for key derivation
 * @param {number} iterations hashing iterations
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
