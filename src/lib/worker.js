var mongo = require('./mongo');
var k8s = require('./k8s');
var config = require('./config');
var ip = require('ip');
var async = require('async');
var moment = require('moment');
var dns = require('dns');
var os = require('os');

var loopSleepSeconds = config.loopSleepSeconds;
var unhealthySeconds = config.unhealthySeconds;

var hostIp = false;
var hostIpAndPort = false;

var init = function(done) {
  //Borrowed from here: http://stackoverflow.com/questions/3653065/get-local-ip-address-in-node-js
  var hostName = os.hostname();
  dns.lookup(hostName, function (err, addr) {
    if (err) {
      return done(err);
    }

    hostIp = addr;
    hostIpAndPort = hostIp + ':27017'

    done();
  });
};

var workloop = function workloop() {
  if (!hostIp || !hostIpAndPort) {
    throw new Error('Must initialize with the host machine\'s addr');
  }

  async.parallel([ mongo.getDb, k8s.getMongoPods ], function(err, results) {
    if (err) {
      return finish(err);
    }

    var db = results[0];
    var pods = results[1];

    //Lets remove any pods that aren't running
    for (var i = pods.length - 1; i >= 0; i--) {
      var pod = pods[i];
      if (pod.status.phase !== 'Running') {
        pods.splice(i, 1);
      }
    }

    if (!pods.length) {
      return finish('No pods are currently running, probably just give them some time.');
    }

    //Lets try and get the rs status for this mongo instance
    //If it works with no errors, they are in the rs
    //If we get a specific error, it means they aren't in the rs
    mongo.replSetGetStatus(db, function(err, status) {
      if (err) {
        if (err.code && err.code == 94) {
          notInReplicaSet(db, pods, function(err) {
            finish(err, db);
          });
        }
        else {
          finish(err, db);
        }
        return;
      }

      inReplicaSet(db, pods, status, function(err) {
        finish(err, db);
      });
    });
  });
};

var finish = function(err, db) {
  if (err) {
    console.error('Error in workloop', err);
  }

  if (db) {
    db.close();
  }

  setTimeout(workloop, loopSleepSeconds * 1000);
};

var inReplicaSet = function(db, pods, status, done) {
  //If we're already in a rs and we ARE the primary, do the work of the primary instance (i.e. adding others)
  //If we're already in a rs and we ARE NOT the primary, just continue, nothing to do
  //If we're already in a rs and NO ONE is a primary, elect someone to do the work for a primary
  var members = status.members;

  var primaryExists = false;
  for (var i in members) {
    var member = members[i];

    if (member.state === 1) {
      if (member.self) {
        return primaryWork(db, pods, members, false, done);
      }

      primaryExists = true;
      break;
    }
  }

  if (!primaryExists && podElection(pods)) {
    console.log('Pod has been elected as a secondary to do primary work');
    return primaryWork(db, pods, members, true, done);
  }

  done();
};

var primaryWork = function(db, pods, members, shouldForce, done) {
  //Loop over all the pods we have and see if any of them aren't in the current rs members array
  //If they aren't in there, add them
  var addrToAdd = [];
  for (var i in pods) {
    var pod = pods[i];
    if (pod.status.phase !== 'Running') {
      continue;
    }

    var podIp = pod.status.podIP;
    var podAddr = podIp  + ':27017';
    var podInRs = false;
    for (var j in members) {
      var member = members[j];
      if (member.name === podAddr) {
        podInRs = true;
        continue;
      }
    }

    if (!podInRs) {
      addrToAdd.push(podAddr);
    }
  }

  //Separate loop for removing members
  var addrToRemove = [];
  for (var i  in members) {
    var member = members[i];
    if (memberShouldBeRemoved(member)) {
      addrToRemove.push(member.name);
    }
  }

  if (addrToAdd.length || addrToRemove.length) {
    console.log('Addresses to add:   ', addrToAdd);
    console.log('Addresses to remove:', addrToRemove);

    mongo.addNewReplSetMembers(db, addrToAdd, addrToRemove, shouldForce, done);
    return;
  }

  done();
};

var memberShouldBeRemoved = function(member) {
  return !member.health
    && moment().subtract(unhealthySeconds, 'seconds').isAfter(member.lastHeartbeatRecv);
};

var notInReplicaSet = function(db, pods, done) {
  var createTestRequest = function(pod) {
    return function(completed) {
      mongo.isInReplSet(pod.status.podIP, completed);
    };
  };

  //If we're not in a rs and others ARE in the rs, just continue, another path will ensure we will get added
  //If we're not in a rs and no one else is in a rs, elect one to kick things off
  var testRequests = [];
  for (var i in pods) {
    var pod = pods[i];

    if (pod.status.phase === 'Running') {
      testRequests.push(createTestRequest(pod));
    }
  }

  async.parallel(testRequests, function(err, results) {
    if (err) {
      return done(err);
    }

    for (var i in results) {
      if (results[i]) {
        return done(); //There's one in a rs, nothing to do
      }
    }

    if (podElection(pods)) {
      console.log('Pod has been elected for replica set initialization');
      mongo.initReplSet(db, hostIpAndPort, done);
      return;
    }

    done();
  });
};

var podElection = function(pods) {
  //Because all the pods are going to be running this code independently, we need a way to consistently find the same
  //node to kick things off, the easiest way to do that is convert their ips into longs and find the highest
  pods.sort(function(a,b) {
    var aIpVal = ip.toLong(a.status.podIP);
    var bIpVal = ip.toLong(b.status.podIP);
    if (aIpVal < bIpVal) return -1;
    if (aIpVal > bIpVal) return 1;
    return 0; //Shouldn't get here... all pods should have different ips
  });

  //Are we the lucky one?
  return pods[0].status.podIP == hostIp;
};

module.exports = {
  init: init,
  workloop: workloop
};
