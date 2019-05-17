"use strict";

/**
 * This converter provides string conversion utility functions.
 *
 * @author Andreas Rümpel <ruempel@gmail.com>
 */
export default class {
    /**
     * Converts a text string to a Uint8Array.
     *
     * @param {string} string input string
     * @returns {Uint8Array} output array
     */
    static encodeFromText(string) {
        const encoder = new TextEncoder();
        return encoder.encode(string); // provide Uint8Array
    }

    /**
     * Converts a Uint8Array to a text string.
     *
     * @param {ArrayBuffer} arrayBuffer input array
     * @returns {string} output string
     */
    static decodeToText(arrayBuffer) {
        const decoder = new TextDecoder("utf-8");
        return decoder.decode(arrayBuffer);
    }

    /**
     * Converts a hex string to a Uint8Array. Each output character is represented by a two-digit hexadecimal input string.
     *
     * @param {string} string input hex string
     * @returns {Uint8Array} output character array
     */
    static encodeFromHexString(string) {
        const hex = string.toString(); // force conversion
        const array = new Uint8Array(string.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            array[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return array;
    }

    /**
     * Converts a Uint8Array to a hexadecimal string. Each input character is converted to a two-digit hex output string.
     *
     * @param {ArrayBuffer|Uint8Array} arrayBuffer input array
     * @returns {string} string of concatenated two-digit hexadecimal character representations
     */
    static decodeToHexString(arrayBuffer) {
        const byteArray = new Uint8Array(arrayBuffer);
        let hexString = "";
        for (let i = 0; i < byteArray.byteLength; i++) {
            let nextHexByte = byteArray[i].toString(16);
            if (nextHexByte.length < 2) nextHexByte = "0" + nextHexByte; // add leading zero
            hexString += nextHexByte;
        }
        return hexString;
    }
}
