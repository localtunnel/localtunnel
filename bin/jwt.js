#!/usr/bin/env node
/* eslint-disable no-console */

const yargs = require('yargs');
const util = require('util');

const {version} = require('../package');
const jwt = require('jsonwebtoken');


const {argv} = yargs
    .usage('Usage: jwt --name [name] --shared-token [token] --number-of-days [numberOfDays] ')
    .env(true)
    .option('n', {
        alias: 'name',
        describe: 'JWT name',
    })
    .require('name')
    .option('t', {
        alias: 'shared-token',
        describe: 'JWT shared token',
    })
    .require('shared-token')
    .option('d', {
        alias: 'number-of-days',
        describe: 'Validity number of days',
    })
    .option('j', {
        alias: 'as-json',
        describe: 'Output as json',
    })
    .boolean('as-json')
    .help('help', 'Show this help and exit')
    .version(version);

const tokenData = {
    name: argv.name
};

if (argv.numberOfDays) {
    tokenData.iat = Math.floor(Date.now() / 1000) + 3600 * 24
}

const token = jwt.sign(tokenData, argv.sharedToken, {algorithm: 'HS256'});

if (argv.asJson) {
    console.log(JSON.stringify({token, tokenData}));
    process.exit(0);
}

console.log(token);
process.exit(0);
