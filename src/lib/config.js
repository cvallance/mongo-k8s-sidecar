var getPodLabels = function() {
  if (!process.env.MONGO_SIDECAR_POD_LABELS) {
    throw new Error('Enivronment variable "MONGO_SIDECAR_POD_LABELS" must be supplied. Is should contain a comma ' +
      'delimited list of values. E.g. "name:mongo,environment:dev".');
  }

  var labels = process.env.MONGO_SIDECAR_POD_LABELS.split(',');
  for (var i in labels) {
    var keyAndValue = labels[i].split(':');
    labels[i] = {
      key: keyAndValue[0],
      value: keyAndValue[1]
    };
  }

  return labels;
};

var getKubernetesROServiceAddress = function() {
  return process.env.KUBERNETES_RO_SERVICE_HOST + ":" + process.env.KUBERNETES_RO_SERVICE_PORT
};

module.exports = {
  podLabelS: getPodLabels(),
  kubernetesROServiceAddress: getKubernetesROServiceAddress(),
  loopSleepSeconds: process.env.MONGO_SIDECAR_SLEEP_SECONDS || 5,
  unhealthySeconds: process.env.MONGO_SIDECAR_UNHEALTHY_SECONDS || 15,
  env: process.env.NODE_ENV || 'local'
};
