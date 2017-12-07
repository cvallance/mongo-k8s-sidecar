'use strict';

const dns = require('dns');
const {promisify} = require('util');


const getK8sMongoPodLabels = () => process.env.KUBERNETES_POD_LABELS || false;

const getK8sMongoPodLabelCollection = () => {
  const podLabels = getK8sMongoPodLabels();
  if (!podLabels) {
    return false;
  }
  let labels = podLabels.split(',');
  for (let i in labels) {
    const keyAndValue = labels[i].split('=');
    labels[i] = {
      key: keyAndValue[0],
      value: keyAndValue[1]
    };
  }

  return labels;
};

const getK8sROServiceAddress = () => process.env.KUBERNETES_SERVICE_HOST + ':' + process.env.KUBERNETES_SERVICE_PORT;

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
const verifyCorrectnessOfDomain = async clusterDomain => {
  if (!clusterDomain) return;

  const servers = dns.getServers();
  if (!servers || !servers.length) {
    console.log('dns.getServers() didn\'t return any results when verifying the cluster domain \'%s\'.', clusterDomain);
    return;
  }

  try {
    const reverse = promisify(dns.reverse);

    // In the case that we can resolve the DNS servers, we get the first and try to retrieve its host.
    const host = await reverse(servers[0]);
    if (host.length < 1 || !host[0].endsWith(clusterDomain)) {
      console.warn('Possibly wrong cluster domain name! Detected \'%s\' but expected similar to \'%s\'',  clusterDomain, host);
    }
    else {
      console.log('The cluster domain \'%s\' was successfully verified.', clusterDomain);
    }
  } catch (err) {
    console.warn('Error occurred trying to verify the cluster domain \'%s\'',  clusterDomain);
  }

  return;
};

/**
 * @returns k8sMongoServiceName should be the name of the (headless) k8s service operating the mongo pods.
 */
const getK8sMongoServiceName = () => process.env.KUBERNETES_SERVICE_NAME || false;

/**
 * @returns mongoPort this is the port on which the mongo instances run. Default is 27017.
 */
const getMongoPort = () => {
  const mongoPort = process.env.MONGO_PORT || 27017;
  console.log('Using mongo port: %s', mongoPort);
  return mongoPort;
};

/**
 *  @returns boolean to define the RS as a configsvr or not. Default is false
 */
const isConfigRS = () => {
  const configSvr = (process.env.MONGO_CONFIG_SVR || '').trim().toLowerCase();
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
  k8sNamespace: process.env.KUBERNETES_NAMESPACE,
  k8sClusterDomain: getK8sClusterDomain(),
  k8sROServiceAddress: getK8sROServiceAddress(),
  k8sMongoServiceName: getK8sMongoServiceName(),
  k8sMongoPodLabels: getK8sMongoPodLabels(),
  k8sMongoPodLabelCollection: getK8sMongoPodLabelCollection(),

  mongoPort: getMongoPort(),
  mongoUsername: process.env.MONGO_USERNAME,
  mongoPassword: process.env.MONGO_PASSWORD,
  mongoDatabase: process.env.MONGO_DATABASE || 'local',
  mongoSSL: stringToBool(process.env.MONGO_SSL),
  mongoSSLCA: process.env.MONGO_SSL_CA,
  mongoSSLCert: process.env.MONGO_SSL_CERT,
  mongoSSLKey: process.env.MONGO_SSL_KEY,
  mongoSSLPassword: process.env.MONGO_SSL_PASS,
  mongoSSLCRL: process.env.MONGO_SSL_CRL,
  mongoSSLServerIdentityCheck: process.env.MONGO_SSL_IDENTITY_CHECK !== 'false',

  loopSleepSeconds: process.env.SIDECAR_SLEEP_SECONDS || 5,
  unhealthySeconds: process.env.SIDECAR_UNHEALTHY_SECONDS || 15,
  env: process.env.NODE_ENV || 'local',
  isConfigRS: isConfigRS(),
};
