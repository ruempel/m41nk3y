/**
 * Provides export functionality for browser download.
 */
export default class Download {
    /**
     * Provides the given string as a file download.
     *
     * @param {string} payload string to download as a file
     */
    static downloadFile(payload) {
        const limit = 120; // maximum line length
        let chunkedPayload = "";
        for (let i = 0; i < payload.length; i += limit) {
            chunkedPayload += payload.substring(i, i + limit) + "%0A"; // add line breaks
        }

        const downloadURI = "data:text/plain;charset=utf-8," + chunkedPayload;

        const blindAnchor = document.createElement("a");
        document.querySelector("body").appendChild(blindAnchor);
        blindAnchor.setAttribute("href", downloadURI);
        blindAnchor.setAttribute("download", "download");
        blindAnchor.setAttribute("hidden", "hidden");
        blindAnchor.click();
        blindAnchor.remove();
    }
}
