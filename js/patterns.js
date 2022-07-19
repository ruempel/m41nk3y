/**
 * Provides patterns based on character classes and lengths for keys to be derived.
 */
export default class {
    /**
     * Provides templates containing character classes from which to derive keys.
     */
    static get templates() {
        return {
            c16: ["aAnoxxxxxxxxxxxa", "axxxxxxxxxxxAnoa", "axxAxxnxxoxxxxxa", "axxxnxxxoxxxAxxa"],
            c12: ["aAnoxxxxxxxa", "axxxxxxxAnoa", "axAxnxoxxxxa", "axxnxxoxxAxa"],
            c8: ["aAnoxxxa", "axnxAxoa", "axxoAnxa", "axxxnoAa"],
            y16: ["aAnyyyyyyyyyyyya", "ayyyyyyyyyyyAnya", "ayyAyynyyyyyyyya", "ayyynyyyyyyyAyya"],
            n6: ["nnnnnn"],
            n5: ["nnnnn"],
            n4: ["nnnn"]
        }
    }

    /**
     * Provides derived character classes.
     */
    static get keycharacters() {
        const b = baseCharacters;
        return { // password character categories mapping
            V: b.v.toUpperCase(),
            C: b.c.toUpperCase(),
            v: b.v,
            c: b.c,
            A: b.v.toUpperCase() + b.c.toUpperCase(),
            a: b.v + b.c,
            n: b.n,
            o: b.o,
            x: b.v.toUpperCase() + b.c.toUpperCase() + b.v + b.c + b.n + b.o,
            y: b.v.toUpperCase() + b.c.toUpperCase() + b.v + b.c + b.n,
            " ": " "
        }
    }
}

/**
 * Provides base character classes.
 */
const baseCharacters = {
    v: "aeiou",
    c: "bcdfghjklmnpqrstvwxyz",
    n: "0123456789",
    o: "!#$%*@"
};
