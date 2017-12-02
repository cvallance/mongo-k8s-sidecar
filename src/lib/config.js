'use strict';

const dns = require('dns');


const getMongoPodLabels = () => process.env.MONGO_SIDECAR_POD_LABELS || false;

const getMongoPodLabelCollection = () => {
  const podLabels = getMongoPodLabels();
  if (!podLabels) {
    return false;
  }
  let labels = process.env.MONGO_SIDECAR_POD_LABELS.split(',');
  for (let i in labels) {
    const keyAndValue = labels[i].split('=');
    labels[i] = {
      key: keyAndValue[0],
      value: keyAndValue[1]
    };
  }

  return labels;
};

const getk8sROServiceAddress = () => process.env.KUBERNETES_SERVICE_HOST + ':' + process.env.KUBERNETES_SERVICE_PORT;

/**
 * @returns k8sClusterDomain should the name of the kubernetes domain where the cluster is running.
 * Can be convigured via the environmental variable 'KUBERNETES_CLUSTER_DOMAIN'.
 */
const getK8sClusterDomain = () => {
  const domain = process.env.KUBERNETES_CLUSTER_DOMAIN || 'cluster.local';
  verifyCorrectnessOfDomain(domain);
  return domain;
};

/**
 * Calls a reverse DNS lookup to ensure that the given custom domain name matches the actual one.
 * Raises a console warning if that is not the case.
 * @param clusterDomain the domain to verify.
 */
const verifyCorrectnessOfDomain = clusterDomain => {
  if (!clusterDomain) {
    return;
  }

  const servers = dns.getServers();
  if (!servers || !servers.length) {
    console.log('dns.getServers() didn\'t return any results when verifying the cluster domain \'%s\'.', clusterDomain);
    return;
  }

  // In the case that we can resolve the DNS servers, we get the first and try to retrieve its host.
  dns.reverse(servers[0], (err, host) => {
    if (err) {
      console.warn('Error occurred trying to verify the cluster domain \'%s\'',  clusterDomain);
    }
    else if (host.length < 1 || !host[0].endsWith(clusterDomain)) {
      console.warn('Possibly wrong cluster domain name! Detected \'%s\' but expected similar to \'%s\'',  clusterDomain, host);
    }
    else {
      console.log('The cluster domain \'%s\' was successfully verified.', clusterDomain);
    }
  });
};

/**
 * @returns k8sMongoServiceName should be the name of the (headless) k8s service operating the mongo pods.
 */
const getK8sMongoServiceName = () => process.env.KUBERNETES_MONGO_SERVICE_NAME || false;

/**
 * @returns mongoPort this is the port on which the mongo instances run. Default is 27017.
 */
const getMongoDbPort = () => {
  const mongoPort = process.env.MONGO_PORT || 27017;
  console.log('Using mongo port: %s', mongoPort);
  return mongoPort;
};

/**
 *  @returns boolean to define the RS as a configsvr or not. Default is false
 */
const isConfigRS = () => {
  const configSvr = (process.env.CONFIG_SVR || '').trim().toLowerCase();
  const configSvrBool = /^(?:y|yes|true|1)$/i.test(configSvr);
  if (configSvrBool) {
    console.log('ReplicaSet is configured as a configsvr');
  }

  return configSvrBool;
};

/**
 * @returns boolean
 */
const stringToBool = boolStr => ( boolStr === 'true' ) || false;

module.exports = {
  namespace: process.env.KUBE_NAMESPACE,
  username: process.env.MONGODB_USERNAME,
  password: process.env.MONGODB_PASSWORD,
  database: process.env.MONGODB_DATABASE || 'local',
  loopSleepSeconds: process.env.MONGO_SIDECAR_SLEEP_SECONDS || 5,
  unhealthySeconds: process.env.MONGO_SIDECAR_UNHEALTHY_SECONDS || 15,
  mongoSSLEnabled: stringToBool(process.env.MONGO_SSL_ENABLED),
  mongoSSLAllowInvalidCertificates: stringToBool(process.env.MONGO_SSL_ALLOW_INVALID_CERTIFICATES),
  mongoSSLAllowInvalidHostnames: stringToBool(process.env.MONGO_SSL_ALLOW_INVALID_HOSTNAMES),
  env: process.env.NODE_ENV || 'local',
  mongoPodLabels: getMongoPodLabels(),
  mongoPodLabelCollection: getMongoPodLabelCollection(),
  k8sROServiceAddress: getk8sROServiceAddress(),
  k8sMongoServiceName: getK8sMongoServiceName(),
  k8sClusterDomain: getK8sClusterDomain(),
  mongoPort: getMongoDbPort(),
  isConfigRS: isConfigRS(),
};
