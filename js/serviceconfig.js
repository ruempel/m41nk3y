"use strict";

/**
 * Key management for multiple services. Service keys are derived based on a master key, a service name as salt and
 * an individually saved iterations count. Configuration for services is encrypted with master key as well.
 *
 * @author Andreas Rümpel <ruempel@gmail.com>
 */
/**
 * @typedef Service
 * @type {object}
 * @property {string} name - service name, common practise is to use a domain name
 * @property {number} [iterations] - iterations count for the hash function to be applied
 * @property {string} [pattern] - password character set and length pattern
 */
/**
 * @typedef Config
 * @type {object}
 * @property {string} userSecret - the user's secret master key
 * @property {string} configKeyAES - symmetric encryption and decryption of services configuration
 * @property {Service[]} services - JSON services configuration
 * @property {string} servicesEncrypted - JSON services configuration encrypted
 */
export default class Config {
    static addService(name) {
        const candidate = name.trim();
        for (const service of this.services) {
            if (service.name === candidate) {
                console.info(`Service with name ${candidate} already exists.`);
                return;
            }
        }
        console.info(`Add service ${candidate}`);
        this.services.push({name: candidate});
        this.sortServices();
    }

    static removeService(name) {
        const servicesUpdated = [];
        for (const service of this.services) {
            if (service.name === name) console.info(`Remove service ${service.name}`);
            else servicesUpdated.push(service);
        }
        this.services = servicesUpdated;
    }

    static sortServices() {
        this.services.sort((a, b) => {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;
            return 0;
        });
    }
}
