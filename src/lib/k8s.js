var Client = require('node-kubernetes-client');
var config = require('./config');
var util = require("util");

fs = require('fs');

var readToken = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token');

var client = new Client({
  host: config.k8sROServiceAddress,
  namespace: config.namespace,
  protocol: 'https',
  version: 'v1',
  token: readToken
});

var getMongoPods = async function getPods() {
  return new Promise( (resolve,reject) => {
    client.pods.get(function (err, podResult) {
      
      if (err) {
        reject(err)
        return
      }
 
      var pods = podResult[0].items
      var labels = config.mongoPodLabelCollection;
      var results = pods.filter((pod) => podContainsLabels(pod, labels));
      resolve(results)  
    })
  })
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
