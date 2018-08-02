'use strict';

const Promise = require('bluebird');
const findup = require('find-up');
const fs = Promise.promisifyAll(require('fs'));
const yaml = require('js-yaml');
const deepFreeze = require('deep-freeze');

let config = {};
    
let configFile = findup.sync('localtunnel.yaml') || findup.sync('localtunnel.yml');

if (configFile) {
    
    try {
      config = yaml.safeLoad(fs.readFileSync(configFile, 'utf8'));
    } catch(e) {
        const err = new Error(`Unable to load config file: ${configFile}`);
        err.code = 'CONFIG_LOAD_ERROR';
        throw err;
    }
    
}

config = deepFreeze(config || {});

module.exports = config;