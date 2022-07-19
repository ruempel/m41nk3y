/**
 * Provides functionality for console logging and notification.
 */
export default class Logger {
    static debug(message) {
        console.debug(message);
    }

    static log(message, notification = message) {
        // Notification.requestPermission().then(result => {
        //     if (result === "granted") new Notification(notification);
        // });
        console.log(message);
    }
}
