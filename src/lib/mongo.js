'use strict';

const fs = require('fs');
const {promisify} = require('util');

const MongoClient = require('mongodb').MongoClient;

const config = require('./config');


const localhost = '127.0.0.1'; // Can access mongo as localhost from a sidecar

let certificates = null;

const getConnectionURI = host => {
  let credentials = '';
  if (config.mongoUsername) {
    const username = encodeURIComponent(config.mongoUsername);
    const password = encodeURIComponent(config.mongoPassword);
    credentials = `${username}:${password}@`;
  }

  return `mongodb://${credentials}${host}:${config.mongoPort}/${config.mongoDatabase}`;
};

const getSSLCertificates = async () => {
  const readFile = promisify(fs.readFile);

  try {
    let tasks = [];
    if (config.mongoSSLCert) tasks[0] = readFile(config.mongoSSLCert);
    if (config.mongoSSLKey) tasks[1] = readFile(config.mongoSSLKey);
    if (config.mongoSSLCA) tasks[2] = readFile(config.mongoSSLCA);
    if (config.mongoSSLCRL) tasks[3] = readFile(config.mongoSSLCRL);

    const files = await Promise.all(tasks);

    let certs = {};
    if (files[0]) certs.sslCert = files[0];
    if (files[1]) certs.sslKey = files[1];
    if (files[2]) certs.sslCA = files[2];
    if (files[3]) certs.sslCRL = files[3];
    return certs;

  } catch (err) {
    return Promise.reject(err);
  }
};

const getClient = async host => {

  host = host || localhost;
  let options = {
    authSource: 'admin',
    ssl: config.mongoSSL,
    sslPass: config.mongoSSLPassword,
    checkServerIdentity: config.mongoSSLServerIdentityCheck
  };

  try {
    if (config.mongoSSL) {
      certificates = certificates || await getSSLCertificates();
      Object.assign(options, certificates);
    }
    const uri = getConnectionURI(host);
    const client = new MongoClient(uri, options);
    return await client.connect();
  } catch (err) {
    return Promise.reject(err);
  }
};

const replSetGetConfig = db => db.admin().command({ replSetGetConfig: 1 }, {})
  .then(results => results.config);

const replSetGetStatus = db => db.admin().command({ replSetGetStatus: {} }, {});

const initReplSet = async (db, hostIpAndPort) => {
  console.log('initReplSet', hostIpAndPort);

  try {
    await db.admin().command({ replSetInitiate: {} }, {});

    // We need to hack in the fix where the host is set to the hostname which isn't reachable from other hosts
    const rsConfig = await replSetGetConfig(db);

    console.log('initial rsConfig is', rsConfig);
    rsConfig.configsvr = config.isConfigRS;
    rsConfig.members[0].host = hostIpAndPort;

    const times = 20;
    const interval = 500;
    const wait = time => new Promise(resolve => setTimeout(resolve, time));

    let tries = 0;
    while (tries < times) {
      try {
        return await replSetReconfig(db, rsConfig, false);
      } catch (err) {
        await wait(interval);
        tries++;
        if (tries >= times) return Promise.reject(err);
      }
    }

  } catch (err) {
    return Promise.reject(err);
  }
};

const replSetReconfig = (db, rsConfig, force) => {
  console.log('replSetReconfig', rsConfig);

  rsConfig.version++;

  return db.admin().command({ replSetReconfig: rsConfig, force: force }, {});
};

const addNewReplSetMembers = async (db, addrToAdd, addrToRemove, shouldForce) => {
  try {
    let rsConfig = await replSetGetConfig(db);
    removeDeadMembers(rsConfig, addrToRemove);
    addNewMembers(rsConfig, addrToAdd);
    return await replSetReconfig(db, rsConfig, shouldForce);
  } catch (err) {
    return Promise.reject(err);
  }
};

const addNewMembers = (rsConfig, addrsToAdd) => {
  if (!addrsToAdd || !addrsToAdd.length) return;

  // Follows what is basically in mongo's rs.add function
  let max = 0;

  for (let i in rsConfig.members) {
    if (rsConfig.members[i]._id > max) {
      max = rsConfig.members[i]._id;
    }
  }

  for (let i in addrsToAdd) {
    const addrToAdd = addrsToAdd[i];

    // Somehow we can get a race condition where the member config has been updated since we created the list of
    // addresses to add (addrsToAdd) ... so do another loop to make sure we're not adding duplicates
    let exists = false;
    for (let j in rsConfig.members) {
      let member = rsConfig.members[j];
      if (member.host === addrToAdd) {
        console.log('Host [%s] already exists in the Replicaset. Not adding...', addrToAdd);
        exists = true;
        break;
      }
    }

    if (exists) continue;

    const cfg = {
      _id: ++max,
      host: addrToAdd
    };

    rsConfig.members.push(cfg);
  }
};

const removeDeadMembers = (rsConfig, addrsToRemove) => {
  if (!addrsToRemove || !addrsToRemove.length) return;

  for (let i in addrsToRemove) {
    const addrToRemove = addrsToRemove[i];
    for (let j in rsConfig.members) {
      const member = rsConfig.members[j];
      if (member.host === addrToRemove) {
        rsConfig.members.splice(j, 1);
        break;
      }
    }
  }
};

const isInReplSet = async ip => {
  try {
    const client = await getClient(ip);
    await replSetGetConfig(client);
    client.close();
    return true;
  } catch (err) {
    if (err.code === 93) return false;
    return Promise.reject(err);
  }
};

module.exports = {
  getClient: getClient,
  replSetGetStatus: replSetGetStatus,
  initReplSet: initReplSet,
  addNewReplSetMembers: addNewReplSetMembers,
  isInReplSet: isInReplSet
};
