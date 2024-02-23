const { MongoClient } = require('mongodb');
var config = require('./config');

var localhost = '127.0.0.1'; //Can access mongo as localhost from a sidecar

var getDb = function(host) {
  //If they called without host like getDb(function(err, db) { ... });

  var mongoOptions = {replicaSet: "rs0",directConnection: true};
  host = host || localhost;

  if (config.mongoSSLEnabled) {
    mongoOptions = {
      ssl: config.mongoSSLEnabled,
      tlsAllowInvalidCertificates: config.mongoSSLAllowInvalidCertificates,
      tlsAllowInvalidHostnames: config.mongoSSLAllowInvalidHostnames,
      replicaSet: "rs0"
    }
  }

  const uri = (config.username) ?
    `mongodb://${config.username}:${config.password}@${host}:${config.mongoPort}/?authSource=${config.database}` :
    `mongodb://${host}:${config.mongoPort}/?directConnection=true`;


  var client = new MongoClient(uri, mongoOptions);
  var mongoDb = client.db(config.database);
  
  return {db : mongoDb, close : () => {client.close()}}
}
//   mongoDb.open(function (err, db) {
//     if (err) {
//       return done(err);
//     }

//     if(config.username) {
//         mongoDb.authenticate(config.username, config.password, function(err, result) {
//             if (err) {
//               return done(err);
//             }

//             return done(null, db);
//         });
//     } else {
//       return done(null, db);
//     }

//   });
// };

var replSetGetConfig = async function(db) {
  const result = await db.admin().command({ replSetGetConfig: 1 } )
  return result.config;
};

var replSetGetStatus = async function(db) {
  result = db.admin().command({ replSetGetStatus: {} } )
  return result;
}

var initReplSet = async function(db, hostIpAndPort) {
  console.trace('initReplSet', hostIpAndPort);

  return db.admin().command({ replSetInitiate: { _id: "rs0", members: [ {_id:0, host: hostIpAndPort} ]} } )

  //We need to hack in the fix where the host is set to the hostname which isn't reachable from other hosts
  // var rsConfig = await replSetGetConfig(db)

  // console.debug('initial rsConfig is', rsConfig);
  // rsConfig.configsvr = config.isConfigRS;
  // rsConfig.members[0].host = hostIpAndPort;
  // return async.retry({times: 20, interval: 500}, replSetReconfig(db, rsConfig, false) )
}

var replSetReconfig = async function(db, rsConfig, force) {
  console.trace('replSetReconfig', rsConfig);

  rsConfig.version++;

  return db.admin().command({ replSetReconfig: rsConfig, force: force }, {})
};

var addNewReplSetMembers = async function(db, addrToAdd, addrToRemove, shouldForce) {
  rsConfig = await replSetGetConfig(db)

  removeDeadMembers(rsConfig, addrToRemove);
  addNewMembers(rsConfig, addrToAdd);

  return replSetReconfig(db, rsConfig, shouldForce);
};

var addNewMembers = function(rsConfig, addrsToAdd) {
  if (!addrsToAdd || !addrsToAdd.length) return;

  var memberIds = [];
  var newMemberId = 0;

  // Build a list of existing rs member IDs
  for (var i in rsConfig.members) {
    memberIds.push(rsConfig.members[i]._id);
  }

  for (var i in addrsToAdd) {
    var addrToAdd = addrsToAdd[i];

    // Search for the next available member ID (max 255)
    for (var i = newMemberId; i <= 255; i++) {
      if (!memberIds.includes(i)) {
        newMemberId = i;
        memberIds.push(newMemberId);
        break;
      }
    }

    // Somehow we can get a race condition where the member config has been updated since we created the list of
    // addresses to add (addrsToAdd) ... so do another loop to make sure we're not adding duplicates
    var exists = false;
    for (var j in rsConfig.members) {
      var member = rsConfig.members[j];
      if (member.host === addrToAdd) {
        console.log("Host [%s] already exists in the Replicaset. Not adding...", addrToAdd);
        exists = true;
        break;
      }
    }

    if (exists) {
      continue;
    }

    var cfg = {
      _id: newMemberId,
      host: addrToAdd
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

var isInReplSet = async function(ip) {
  var {db,close} = getDb(ip)
  try {
    rsConfig = await replSetGetConfig(db)
    return true
  } catch {
    return false
  } finally {
    if (db && close) {
      close()
    }
  }
};

module.exports = {
  getDb: getDb,
  replSetGetStatus: replSetGetStatus,
  initReplSet: initReplSet,
  addNewReplSetMembers: addNewReplSetMembers,
  isInReplSet: isInReplSet
};
