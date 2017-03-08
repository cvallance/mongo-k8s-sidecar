var getMongoPodLabels = function() {
  return process.env.MONGO_SIDECAR_POD_LABELS || false;
};

var getMongoPodLabelCollection = function() {
  var podLabels = getMongoPodLabels();
  if (!podLabels) {
    return false;
  }
  var labels = process.env.MONGO_SIDECAR_POD_LABELS.split(',');
  for (var i in labels) {
    var keyAndValue = labels[i].split('=');
    labels[i] = {
      key: keyAndValue[0],
      value: keyAndValue[1]
    };
  }

  return labels;
};

var getk8sROServiceAddress = function() {
  return process.env.KUBERNETES_SERVICE_HOST + ":" + process.env.KUBERNETES_SERVICE_PORT
};

/**
 * @returns k8sClusterDomain should the name of the kubernetes domain where the cluster is running.
 * Can be convigured via the environmental variable 'KUBERNETES_CLUSTER_DOMAIN'.
 */
var getK8sClusterDomain = function() {
  var domain = process.env.KUBERNETES_CLUSTER_DOMAIN || "cluster.local";
  verifyCorrectnessOfDomain(domain);
  return domain;

  /**
   * Calls a reverse DNS lookup to ensure that the given custom domain name matches the actual one.
   * Raises a console warning if that is not the case.
   * @param clusterDomain the domain to verify.
   */
  function verifyCorrectnessOfDomain(clusterDomain) {
    var dns = require('dns');
    if(clusterDomain && dns.getServers() && dns.getServers().length > 0) {
      // In the case that we can resolve the DNS servers, we get the first and try to retrieve its host.
      dns.reverse(dns.getServers()[0], function(err, host) {
        if(err || host.length < 1 || !host[0].endsWith(clusterDomain)) {
          console.warn("Possibly wrong cluster domain name! Detected '%s' but expected similar to: %s",  clusterDomain, host);
        } else {
          console.log("The cluster domain '%s' was successfully verified.", clusterDomain)
        }
      });
    }
  }
};

/**
 * @returns k8sMongoServiceName should be the name of the (headless) k8s service operating the mongo pods.
 */
var getK8sMongoServiceName = function() {
  return process.env.KUBERNETES_MONGO_SERVICE_NAME || false;
};

/**
 * @returns mongoPort this is the port on which the mongo instances run. Default is 27017.
 */
var getMongoDbPort = function() {
  var mongoPort = process.env.MONGO_PORT || 27017;
  console.log("Using mongo port: %s", mongoPort);
  return mongoPort;
};

module.exports = {
  namespace: process.env.KUBE_NAMESPACE,
  loopSleepSeconds: process.env.MONGO_SIDECAR_SLEEP_SECONDS || 5,
  unhealthySeconds: process.env.MONGO_SIDECAR_UNHEALTHY_SECONDS || 15,
  env: process.env.NODE_ENV || 'local',
  mongoPodLabels: getMongoPodLabels(),
  mongoPodLabelCollection: getMongoPodLabelCollection(),
  k8sROServiceAddress: getk8sROServiceAddress(),
  k8sMongoServiceName: getK8sMongoServiceName(),
  k8sClusterDomain: getK8sClusterDomain(),
  mongoPort: getMongoDbPort()
};
