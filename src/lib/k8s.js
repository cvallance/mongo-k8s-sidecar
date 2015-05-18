var Client = require('node-kubernetes-client');
var config = require('./config');

var client = new Client({
  host:  config.kubernetesROServiceAddress,
  protocol: 'http',
  version: 'v1beta3'
});

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