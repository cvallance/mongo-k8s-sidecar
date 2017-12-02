'use strict';

const async = require('async');
const Db = require('mongodb').Db;
const MongoServer = require('mongodb').Server;

const config = require('./config');


const localhost = '127.0.0.1'; //Can access mongo as localhost from a sidecar

const getDb = (host, done) => {
  //If they called without host like getDb(function(err, db) { ... });
  if (arguments.length === 1) {
    if (typeof arguments[0] === 'function') {
      done = arguments[0];
      host = localhost;
    } else {
      throw new Error('getDb illegal invocation. User either getDb(\'options\', function(err, db) { ... }) OR getDb(function(err, db) { ... })');
    }
  }

  let mongoOptions = {};
  host = host || localhost;

  if (config.mongoSSLEnabled) {
    mongoOptions = {
      ssl: config.mongoSSLEnabled,
      sslAllowInvalidCertificates: config.mongoSSLAllowInvalidCertificates,
      sslAllowInvalidHostnames: config.mongoSSLAllowInvalidHostnames
    };
  }

  const mongoDb = new Db(config.database, new MongoServer(host, config.mongoPort, mongoOptions));

  mongoDb.open((err, db) => {
    if (err) {
      return done(err);
    }

    if(config.username) {
      mongoDb.authenticate(config.username, config.password, err => {
        if (err) {
          return done(err);
        }

        return done(null, db);
      });
    } else {
      return done(null, db);
    }

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

  db.admin().command({ replSetInitiate: {} }, {}, (err) => {
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
  getDb(ip, (err, db) => {
    if (err) {
      return done(err);
    }

    replSetGetConfig(db, (err, rsConfig) => {
      db.close();
      if (!err && rsConfig) {
        done(null, true);
      }
      else {
        done(null, false);
      }
    });
  });
};

module.exports = {
  getDb: getDb,
  replSetGetStatus: replSetGetStatus,
  initReplSet: initReplSet,
  addNewReplSetMembers: addNewReplSetMembers,
  isInReplSet: isInReplSet
};
