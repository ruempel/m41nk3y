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
 * Management of configurable service keys using a main password and PBKDF2.
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

    // register listeners for main key input field
    async function checkChangedInput(event) {
        await importMainKey();
        if (event.key === "Enter") {
            await decryptConfig(); // try decryption, when main key entered
        }
    }

    Util.addListener("#m41nk3y", "paste", checkChangedInput);
    Util.addListener("#m41nk3y", "keypress", checkChangedInput);

    // register listeners for buttons
    Util.addListener("#decrypt-config", "click", () => {
        importMainKey().then(decryptConfig);
    }); // try decryption, when button clicked
    Util.addListener("#derive-keys", "click", deriveServiceKeys);
    Util.addListener("#export-config", "click", encryptConfig);

    // register listener for filter change
    Util.addListener("#filter-text", "input", event => {
        updateFilter(event.target.value.toLowerCase());
    });

    Util.addListener("#action-clear-filter", "click", () => {
        document.querySelector("#filter-text").value = '';
        updateFilter('');
    });

    function updateFilter(filterString) {
        const hiddenClass = 'hidden';
        const serviceElements = document.querySelector(".service-list").children;
        for (const service of serviceElements) {
            const serviceNameLowerCase = service.querySelector(".service-name").innerText.toLowerCase();
            if (serviceNameLowerCase.includes(filterString)) {
                service.classList.remove(hiddenClass);
            } else {
                service.classList.add(hiddenClass);
            }
        }
    }

    // register click listener for new service input form elements
    Util.addListener("#add-new-service-name", "click", async () => {
        const newServiceName = document.querySelector("#new-service-name");
        newServiceName.value = newServiceName.value.trim();
        // validate service name
        if (null === newServiceName.value.match(/\w+[.]\w+/)) {
            Logger.log("Invalid service name to add.");
        } else {
            await renderServiceToList(Config.addService(newServiceName.value));
            newServiceName.value = ""; // reset input field
        }
    });
}

/**
 * Imports the user secret from the password field to a CryptoKey object.
 * Stores the main key imported from user input to Config.userSecret.
 * Stores the AES key for config file decryption to Config.configKeyAES.
 */
async function importMainKey() {
    Logger.debug("Import main key from user input");
    Config.userSecret = await window.crypto.subtle.importKey( // create CryptoKey from input main password
        "raw",
        Converter.encodeFromText(document.querySelector("#m41nk3y").value.trim()),
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
    const initVector = Converter.encodeFromHexString(Config.servicesEncrypted.substring(0, initVectorLength)); // extract init vector
    const payload = Config.servicesEncrypted.substring(initVectorLength); // cut off init vector from payload
    try {
        const configAsArrayBuffer = await window.crypto.subtle.decrypt(
            {name: "AES-CBC", iv: initVector},
            Config.configKeyAES,
            Converter.encodeFromHexString(payload)
        );
        const decodedConfig = Converter.decodeToText(configAsArrayBuffer);
        Config.services = JSON.parse(decodedConfig);
        document.querySelector("#decrypt-config").classList.replace("btn-danger", "btn-success");
        Logger.debug("Decrypt services configuration for " + Config.services.length + " services (finished)");
        await deriveServiceKeys();
        document.querySelector("#filter-text").focus(); // move cursor to filter input without extra click
    } catch (result) {
        Logger.log("Wrong main key: " + result, "Wrong main key");
        document.querySelector("#decrypt-config").classList.replace("btn-success", "btn-danger");
    }
}

/**
 * Derives raw service keys for all services configured with the given count of iterations. Patterns are applied later.
 */
async function deriveServiceKeys() {
    document.querySelector(".service-list").textContent = ""; // remove all services from list

    const progressLabel = document.querySelector("#decrypt-config");
    const startTime = Date.now();
    let servicesLoaded = 0;
    for (const service of Config.services) { // process all services configured
        let iterations = 1;
        if (service.iterations !== undefined && !isNaN(parseInt(service.iterations, 10))) {
            iterations = parseInt(service.iterations, 10);
        } else {
            service.iterations = 1; // set iterations to 1 when missing
        }
        await renderServiceToList(service);
        servicesLoaded++;
        progressLabel.textContent = `${servicesLoaded.toString()} of ${Config.services.length} loaded`;
    }
    progressLabel.textContent = `${servicesLoaded.toString()} loaded in ${Date.now() - startTime} ms`;
}

/**
 * Returns the services key.
 *
 * @param service service to get the key for
 * @returns {Promise<string>} derived key
 */
async function getKey(service) {
    const aesKey = await deriveKey(Config.userSecret, service.name, 1000 + service.iterations);
    const arrayBuffer = await window.crypto.subtle.exportKey("raw", aesKey); // export key for display
    const keyBytes = new Uint8Array(arrayBuffer);
    if (service.pattern === undefined) service.pattern = Object.getOwnPropertyNames(Patterns.templates)[0];
    const templateClass = Patterns.templates[service.pattern];
    const template = templateClass[keyBytes[0] % templateClass.length];
    return template.split("").map(function (c, i) {
        const characters = Patterns.keycharacters[c];
        return characters[keyBytes[i + 1] % characters.length];
    }).join("");
}

/**
 * Renders service entry including the derived key to the service list.
 *
 * @param {Service} service service entry object
 */
async function renderServiceToList(service) {
    const serviceKey = await getKey(service); // derive key for this service

    // import document fragment from HTML template and fill with service data
    const serviceList = document.querySelector(".service-list");
    const fragment = document.importNode(document.querySelector("#entry-template").content, true);
    const serviceElement = fragment.querySelector(".service-entry");

    // fill service name and add delete button listener
    fragment.querySelector(".service-name").innerText = service.name;
    fragment.querySelector(".action-delete").addEventListener("click", () => {
        Config.removeService(service.name);
        serviceList.removeChild(serviceElement);
    });

    // fill service password and listeners for copy and qr code buttons
    const passwordElement = fragment.querySelector(".service-password code");
    passwordElement.innerText = serviceKey;
    fragment.querySelector('.action-copy').addEventListener('click', () => {
        navigator.clipboard.writeText(passwordElement.textContent);
    });
    fragment.querySelector('.action-reveal').addEventListener('click', () => {
        passwordElement.classList.toggle('revealed');
    });
    fragment.querySelector('.action-show-qrcode').addEventListener('click', () => {
        showQrCode(serviceKey);
    });

    // fill pattern selector
    const selectElement = fragment.querySelector("select");
    for (const template of Object.getOwnPropertyNames(Patterns.templates)) {
        selectElement.add(new Option(template, template, // TODO display human-readable pattern label
            template === service.pattern, template === service.pattern));
    }
    selectElement.addEventListener("change", async () => {
        service.pattern = selectElement.value.trim();
        passwordElement.innerText = await getKey(service);
    });

    // fill iterations config and register change listener
    const iterationsCountElement = fragment.querySelector(".iterations-count");
    iterationsCountElement.innerText = service.iterations.toString();

    const iterationsCountObserver = new MutationObserver(async () => {
        const value = iterationsCountElement.innerText;
        if (value) {
            service.iterations = parseInt(iterationsCountElement.innerText);
            passwordElement.innerText = await getKey(service);
        }
    });
    iterationsCountObserver.observe(iterationsCountElement, {childList: true});

    const iterationsCountMinimum = 1;
    const buttonDecrement = fragment.querySelector(".action-iterations-decrement");
    buttonDecrement.addEventListener("click", () => {
        const iterationsCount = parseInt(iterationsCountElement.innerText);
        if (iterationsCount > iterationsCountMinimum) { // prevent settings counts below 1
            iterationsCountElement.innerText = (iterationsCount - 1).toString();
        }
        if (iterationsCount - 1 === iterationsCountMinimum) {
            buttonDecrement.classList.add("disabled");
        }
    })
    if (parseInt(iterationsCountElement.innerHTML) <= iterationsCountMinimum) {
        buttonDecrement.classList.add("disabled");
    }
    fragment.querySelector(".action-iterations-increment").addEventListener("click", () => {
        iterationsCountElement.innerText = (parseInt(iterationsCountElement.innerText) + 1).toString();
        buttonDecrement.classList.remove("disabled");
    });
    serviceList.appendChild(fragment);
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
 * Derives configuration key or services keys from main key.
 *
 * @param {CryptoKey} mainKey key to derive other key from
 * @param {string} salt salt for key derivation
 * @param {number} iterations hashing iterations
 * @returns {PromiseLike<CryptoKey>} promise containing the derived key
 */
function deriveKey(mainKey, salt, iterations) {
    return window.crypto.subtle.deriveKey({
            name: "PBKDF2",
            salt: Converter.encodeFromText(salt),
            iterations: iterations,
            hash: "SHA-512"
        },
        mainKey,
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
