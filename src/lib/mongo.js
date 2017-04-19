var Db = require('mongodb').Db;
var MongoServer = require('mongodb').Server;
var async = require('async');
var config = require('./config');
var pem = require('pem');

var localhost = '127.0.0.1'; //Can access mongo as localhost from a sidecar

var getDb = function(options, done) {
  //If they called without host like getDb(function(err, db) { ... });
  if (arguments.length === 1) {
    if (typeof arguments[0] === 'function') {
      done = arguments[0];
      options = {};
    } else {
      throw new Error('getDb illegal invocation. User either getDb(\'options\', function(err, db) { ... }) OR getDb(function(err, db) { ... })');
    }
  }

  host = options.host || localhost;
  port = options.port;

  var mongoOptions = options.mongoOptions;
  var mongoDb = new Db('local', new MongoServer(host, port, mongoOptions));

  mongoDb.open(function (err, db) {
    if (err) {
      return done(err);
    }

    if(config.username) {
        mongoDb.authenticate(config.username, config.password, function(err, result) {
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

var replSetGetConfig = function(db, done) {
  db.admin().command({ replSetGetConfig: 1 }, {}, function (err, results) {
    if (err) {
      return done(err);
    }

    return done(null, results.config);
  });
};

var replSetGetStatus = function(db, done) {
  db.admin().command({ replSetGetStatus: {} }, {}, function (err, results) {
    if (err) {
      return done(err);
    }

    return done(null, results);
  });
};

var initReplSet = function(db, hostIpAndPort, done) {
  console.log('initReplSet', hostIpAndPort);

  db.admin().command({ replSetInitiate: {} }, {}, function (err) {
    if (err) {
      return done(err);
    }

    //We need to hack in the fix where the host is set to the hostname which isn't reachable from other hosts
    replSetGetConfig(db, function(err, rsConfig) {
      if (err) {
        return done(err);
      }

      console.log('initial rsConfig is', rsConfig);
      rsConfig.configsvr = config.isConfigRS;
      rsConfig.members[0].host = hostIpAndPort;
      async.retry({times: 20, interval: 500}, function(callback) {
        replSetReconfig(db, rsConfig, false, callback);
      }, function(err, results) {
        if (err) {
          return done(err);
        }

        return done();
      });
    });
  });
};

var replSetReconfig = function(db, rsConfig, force, done) {
  console.log('replSetReconfig', rsConfig);

  rsConfig.version++;

  db.admin().command({ replSetReconfig: rsConfig, force: force }, {}, function (err) {
    if (err) {
      return done(err);
    }

    return done();
  });
};

var addNewReplSetMembers = function(db, addrToAdd, addrToRemove, shouldForce, done) {
  replSetGetConfig(db, function(err, rsConfig) {
    if (err) {
      return done(err);
    }

    addNewMembers(rsConfig, addrToAdd);

    removeDeadMembers(rsConfig, addrToRemove);

    replSetReconfig(db, rsConfig, shouldForce, done);
  });
};

var addNewMembers = function(rsConfig, addrsToAdd) {
  if (!addrsToAdd || !addrsToAdd.length) return;

  //Follows what is basically in mongo's rs.add function
  var max = 0;

  for (var j in rsConfig.members) {
    if (rsConfig.members[j]._id > max) {
      max = rsConfig.members[j]._id;
    }
  }

  for (var i in addrsToAdd) {
    var cfg = {
      _id: ++max,
      host: addrsToAdd[i]
    };

    rsConfig.members.push(cfg);
  }
};

var removeDeadMembers = function(rsConfig, addrsToRemove) {
  if (!addrsToRemove || !addrsToRemove.length) return;

  for (var i in addrsToRemove) {
    var addrToRemove = addrsToRemove[i];
    for (var j in rsConfig.members) {
      var member = rsConfig.members[j];
      if (member.host === addrToRemove) {
        rsConfig.members.splice(j, 1);
        break;
      }
    }
  }
};

var isInReplSet = function(options, done) {
  getDb(options, function(err, db) {
    if (err) {
      return done(err);
    }

    replSetGetConfig(db, function(err, rsConfig) {
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

// This method will generate a self signed certificate in the format of a PEM file
// using the addr as the FQDN and the certInfo as the information passed to the certificate
// (Currently unused)
var generateCertificate = function(certInfo, done) {
  pem.createCertificate({
    days: certInfo.days,
    selfSigned: certInfo.selfSigned,
    commonName: addr
  }, function(err, keys) {
    if (err) {
      return done(err);
    }
    var cert = keys.certificate;
    var key = keys.serviceKey;


    return done(null, cert, key)
  });
};

module.exports = {
  getDb: getDb,
  replSetGetStatus: replSetGetStatus,
  initReplSet: initReplSet,
  addNewReplSetMembers: addNewReplSetMembers,
  isInReplSet: isInReplSet
};
