'use strict';

const fs = require('fs');
const {promisify} = require('util');

const async = require('async');
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

const getSSLCertificates = () => {
  return new Promise(async(resolve, reject) => {
    const readFile = promisify(fs.readFile);

    let tasks = [];
    if (config.mongoSSLCert) tasks[0] = readFile(config.mongoSSLCert);
    if (config.mongoSSLKey) tasks[1] = readFile(config.mongoSSLKey);
    if (config.mongoSSLCA) tasks[2] = readFile(config.mongoSSLCA);
    if (config.mongoSSLCRL) tasks[3] = readFile(config.mongoSSLCRL);
    Promise.all(tasks).then(file => {
      let certs = {};
      if (file[0]) certs.sslCert = file[0];
      if (file[1]) certs.sslKey = file[1];
      if (file[2]) certs.sslCA = file[2];
      if (file[3]) certs.sslCRL = file[3];

      resolve(certs);
    }).catch(err => {
      reject('An error occurred while reading the SSL files', err);
    });
  });
};

const getDB = host => {
  return new Promise(async(resolve, reject) => {

    host = host || localhost;
    let options = {
      authSource: 'admin',
      ssl: config.mongoSSL,
      sslPass: config.mongoSSLPassword,
      checkServerIdentity: config.mongoSSLServerIdentityCheck
    };

    if (config.mongoSSL) {
      if (!certificates) {
        try {
          certificates = await getSSLCertificates();
        } catch (err) {
          return reject(err);
        }
      }
      Object.assign(options, certificates);
    }

    const mongoDB = new MongoClient();
    const uri = getConnectionURI(host);
    mongoDB.connect(uri, options, (err, db) => {
      if (err) return reject(err);

      resolve(db);
    });
  });
};

const replSetGetConfig = (db, done) => {
  db.admin().command({ replSetGetConfig: 1 }, {}, (err, results) => {
    if (err) {
      return done(err);
    }

    return done(null, results.config);
  });
};

const replSetGetStatus = (db, done) => {
  db.admin().command({ replSetGetStatus: {} }, {}, (err, results) => {
    if (err) {
      return done(err);
    }

    return done(null, results);
  });
};

const initReplSet = (db, hostIpAndPort, done) => {
  console.log('initReplSet', hostIpAndPort);

  db.admin().command({ replSetInitiate: {} }, {}, err => {
    if (err) {
      return done(err);
    }

    //We need to hack in the fix where the host is set to the hostname which isn't reachable from other hosts
    replSetGetConfig(db, (err, rsConfig) => {
      if (err) {
        return done(err);
      }

      console.log('initial rsConfig is', rsConfig);
      rsConfig.configsvr = config.isConfigRS;
      rsConfig.members[0].host = hostIpAndPort;
      async.retry({times: 20, interval: 500},
        callback => replSetReconfig(db, rsConfig, false, callback), err => {
          if (err) {
            return done(err);
          }

          return done();
        });
    });
  });
};

const replSetReconfig = (db, rsConfig, force, done) => {
  console.log('replSetReconfig', rsConfig);

  rsConfig.version++;

  db.admin().command({ replSetReconfig: rsConfig, force: force }, {}, err => {
    if (err) {
      return done(err);
    }

    return done();
  });
};

const addNewReplSetMembers = (db, addrToAdd, addrToRemove, shouldForce, done) => {
  replSetGetConfig(db, (err, rsConfig) => {
    if (err) {
      return done(err);
    }

    removeDeadMembers(rsConfig, addrToRemove);

    addNewMembers(rsConfig, addrToAdd);

    replSetReconfig(db, rsConfig, shouldForce, done);
  });
};

const addNewMembers = (rsConfig, addrsToAdd) => {
  if (!addrsToAdd || !addrsToAdd.length) return;

  //Follows what is basically in mongo's rs.add function
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

    if (exists) {
      continue;
    }

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

const isInReplSet = (ip, done) => {
  getDB(ip).then(db => {
    replSetGetConfig(db, (err, rsConfig) => {
      db.close();
      if (!err && rsConfig) {
        done(null, true);
      }
      else {
        done(null, false);
      }
    });
  }).catch(err => done(err));
};

module.exports = {
  getDB: getDB,
  replSetGetStatus: replSetGetStatus,
  initReplSet: initReplSet,
  addNewReplSetMembers: addNewReplSetMembers,
  isInReplSet: isInReplSet
};
