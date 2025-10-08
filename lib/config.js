const ini = require('ini');
const os = require('os');
const fs = require('fs');
const path = require('path');
const prompt = require('prompt');

const configFileName = '.ltrc'

const homedir = os.homedir();

const configFilePath = path.resolve(homedir, configFileName);

const readConfigFile = () => {
  try {
    return ini.parse(fs.readFileSync(configFilePath, 'utf-8'));
  }
  catch (err) {
    return ini.parse('');
  }
}

const saveConfigFile = (config) => {
  fs.writeFileSync(configFilePath, ini.stringify(config));
}

const loginPromptSchema = {
  properties: {
    username: {
      type: 'string',
      message: 'username is required',
      required: true,
    },
    password: {
      type: 'string',
      hidden: true,
      message: 'password is required',
      required: true
    },
  },
};

const getLoginAuthKey = (host) => {
  const url = new URL(host);

  let href = url.href.replace(url.protocol, '');

  // Append a trailing slash
  if (href.substr(-1) != '/') {
    href = href + '/';
  }

  const key = `${href}:_auth`; // Result: //localtunnel.me/:_auth

  return key;
}

const login = (host) => {
  const loginKey = getLoginAuthKey(host);

  prompt.start();

  prompt.get(loginPromptSchema, (err, result) => {
    const config = readConfigFile();

    const auth = btoa(`${result.username}:${result.password}`);

    config[loginKey] = auth;

    saveConfigFile(config);

    console.log(`Basic auth for %s (%s) has been added!`, host, result.username);
  });
}

const logout = (host) => {
  const loginKey = getLoginAuthKey(host);

  const config = readConfigFile();

  delete config[loginKey];

  saveConfigFile(config);

  console.log('Basic auth for %s has been removed!', host);
}

const getAuthorization = (host) => {
  const config = readConfigFile();
  const loginKey = getLoginAuthKey(host);
  const auth = config[loginKey];

  if (!auth) return undefined;

  return `Basic ${auth}`;
}

module.exports = {
  login,
  logout,
  getAuthorization,
}
