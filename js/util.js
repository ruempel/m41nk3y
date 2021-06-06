"use strict";

/**
 * Collection of utility methods.
 *
 * @author Andreas Rümpel <ruempel@gmail.com>
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

    /**
     * Removes and add classes of elements matching the selector.
     *
     * @param {string} selector selector for element to set the classes for
     * @param {string} toRemove class to be removed
     * @param {string} toAdd class to be added
     */
    static replaceClasses(selector, toRemove, toAdd) {
        const element = document.querySelector(selector);
        this.replaceClassesForElement(element, toRemove, toAdd);
    }

    static replaceClassesForElement(element, toRemove, toAdd) {
        const classAttributeName = "class";
        let classes = element.getAttribute(classAttributeName);
        classes = classes.replaceAll(toRemove, "").trim();
        classes += classes.includes(toAdd) ? "" : " " + toAdd;
        element.setAttribute(classAttributeName, classes);
    }
}
