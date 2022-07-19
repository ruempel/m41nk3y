/**
 * Collection of utility methods.
 */
export default class Util {
    /**
     * Function to be called when event registered in listener is fired.
     *
     * @callback listenerCallback
     */

    /**
     * Adds event listener to element identified by selector.
     *
     * @param {string} selector query selector identifying an element
     * @param {string} event event to listen to
     * @param {listenerCallback} listener listener to be applied
     */
    static addListener(selector, event, listener) {
        const element = document.querySelector(selector);
        element.addEventListener(event, listener);
    }
}
