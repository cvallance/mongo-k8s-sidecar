var Client = require('node-kubernetes-client');
var config = require('./config');
fs = require('fs');

var readToken='';
fs.readFile('/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf8', function (err,data) {
  if (err) {
    return console.log(err);
  }
  readToken=data;
});

var client = new Client({
  host:  config.kubernetesROServiceAddress,
  protocol: 'https',
  version: 'v1',
  token: readToken
});

// /var/run/secrets/kubernetes.io/serviceaccount

var getMongoPods = function getPods(done) {
  client.pods.get(function (err, podResult) {
    if (err) {
      return done(err);
    }
    var pods = podResult[0].items;
    var labels = config.mongoPodLabelCollection;
    var results = [];
    for (var i in pods) {
      var pod = pods[i];
      if (podContainsLabels(pod, labels)) {
        results.push(pod);
      }
    }

    done(null, results);
  });
};

var podContainsLabels = function podContainsLabels(pod, labels) {
  if (!pod.metadata || !pod.metadata.labels) return false;

  for (var i in labels) {
    var kvp = labels[i];
    if (!pod.metadata.labels[kvp.key] || pod.metadata.labels[kvp.key] != kvp.value) {
      return false;
    }
  }

  return true;
};

module.exports = {
  getMongoPods: getMongoPods
};
