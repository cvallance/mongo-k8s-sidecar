var Client = require('node-kubernetes-client');
var config = require('./config');

var client = new Client({
  host:  config.kubernetesROServiceAddress,
  protocol: 'http',
  version: 'v1beta2'
});

var getMongoPods = function getPods(done) {
  client.pods.get(function (err, pods) {
    if (err) {
      return done(err);
    }

    var results = [];
    for (var i in pods[0].items) {
      var pod = pods[0].items[i];
      if (podContainsLabels(pod)) {
        results.push(pod);
      }
    }

    done(null, results);
  });
};

var podContainsLabels = function podContainsLabels(pod) {
  var labels = config.podLabelS;
  for (var i in labels) {
    var kvp = labels[i];
    if (!pod.labels[kvp.key] || pod.labels[kvp.key] != kvp.value) {
      return false;
    }
  }

  return true;
};

module.exports = {
  getMongoPods: getMongoPods
};