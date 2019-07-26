"use strict";

importScripts("https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js");

if (workbox) {
    // register third-party resources
    workbox.routing.registerRoute(
        /^https:.+(?:jquery|popper|bootstrap|qrcode|fontawesome|gstatic).+(?:js|css|woff2)$/,
        new workbox.strategies.NetworkFirst(),
    );

    workbox.routing.registerRoute(
        new RegExp("^https://fonts.googleapis.com/css?family="),
        new workbox.strategies.NetworkFirst(),
    );

    workbox.routing.registerRoute( // register in-app resources
        /\.(?:css|txt|png|html|json|js|ico)$/,
        new workbox.strategies.NetworkFirst()
    );
} else {
    console.warn("workbox did not load");
}
