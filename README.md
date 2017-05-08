# Mongo Kubernetes Replica Set Sidecar

This project is as a PoC to setup a mongo replica set using Kubernetes. It should handle resizing of any type and be
resilient to the various conditions both mongo and kubernetes can find themselves in.

## How to use it

The docker image is hosted on docker hub and can be found here:
https://hub.docker.com/r/cvallance/mongo-k8s-sidecar/

An example kubernetes replication controller can be found in the examples directory on github here:
https://github.com/cvallance/mongo-k8s-sidecar

There you will also find some helper scripts to test out creating the replica set and resizing it.

### Settings

| Environment Variable | Required | Default | Description |
| --- | --- | --- | --- |
| KUBE_NAMESPACE | NO |  | The namespace to look up pods in. Not setting it will search for pods in all namespaces. |
| MONGO_SIDECAR_POD_LABELS | YES |  | This should be a be a comma separated list of key values the same as the podTemplate labels. See above for example. |
| MONGO_SIDECAR_SLEEP_SECONDS | NO | 5 | This is how long to sleep between work cycles. |
| MONGO_SIDECAR_UNHEALTHY_SECONDS | NO | 15 | This is how many seconds a replica set member has to get healthy before automatically being removed from the replica set. |
| MONGO_PORT | NO | 27017 | Configures the mongo port, allows the usage of non-standard ports. |
| CONFIG_SVR | NO | false | Configures the [configsvr](https://docs.mongodb.com/manual/reference/replica-configuration/#rsconf.configsvr) variable when initializing the replicaset. |
| KUBERNETES_MONGO_SERVICE_NAME | NO |  | This should point to the MongoDB Kubernetes (headless) service that identifies all the pods. It is used for setting up the DNS configuration for the mongo pods, instead of the default pod IPs. Works only with the StatefulSets' stable network ID. |
| KUBERNETES_CLUSTER_DOMAIN | NO | cluster.local | This allows the specification of a custom cluster domain name. Used for the creation of a stable network ID of the k8s Mongo   pods. An example could be: "kube.local". |
| MONGODB_USERNAME | NO | | Configures the mongo username for authentication |
| MONGODB_PASSWORD | NO | | Configures the mongo password for authentication |
| MONGODB_DATABASE | NO | local | Configures the mongo authentication database |
| MONGO_SSL_ENABLED | NO | false | Enable SSL for MongoDB. |
| MONGO_SSL_ALLOW_INVALID_CERTIFICATES | NO | true | This should be set to true if you want to use self signed certificates. |
| MONGO_SSL_ALLOW_INVALID_HOSTNAMES | NO | true | This should be set to true if your certificates FQDN's do not match the host name set in your replset. |

In its default configuration the sidecar uses the pods' IPs for the MongodDB replica names. Here is a trimmed example:
```
[ { _id: 1,
   name: '10.48.0.70:27017',
   stateStr: 'PRIMARY',
   ...},
 { _id: 2,
   name: '10.48.0.72:27017',
   stateStr: 'SECONDARY',
   ...},
 { _id: 3,
   name: '10.48.0.73:27017',
   stateStr: 'SECONDARY',
   ...} ]
```

If you want to use the StatefulSets' stable network ID, you have to make sure that you have the `KUBERNETES_MONGO_SERVICE_NAME`
environmental variable set. Then the MongoDB replica set node names could look like this:
```
[ { _id: 1,
   name: 'mongo-prod-0.mongodb.db-namespace.svc.cluster.local:27017',
   stateStr: 'PRIMARY',
   ...},
 { _id: 2,
   name: 'mongo-prod-1.mongodb.db-namespace.svc.cluster.local:27017',
   stateStr: 'SECONDARY',
   ...},
 { _id: 3,
   name: 'mongo-prod-2.mongodb.db-namespace.svc.cluster.local:27017',
   stateStr: 'SECONDARY',
   ...} ]
```
StatefulSet name: `mongo-prod`.
Headless service name: `mongodb`.
Namespace: `db-namespace`.

Read more about the stable network IDs
<a href="https://kubernetes.io/docs/concepts/abstractions/controllers/statefulsets/#stable-network-id">here</a>.

An example for a stable network pod ID looks like this:
`$(statefulset name)-$(ordinal).$(service name).$(namespace).svc.cluster.local`.
The `statefulset name` + the `ordinal` form the pod name, the `service name` is passed via `KUBERNETES_MONGO_SERVICE_NAME`,
the namespace is extracted from the pod metadata and the rest is static.

A thing to consider when running a cluster with the mongo-k8s-sidecar is that it will prefer the stateful set stable
network ID to the pod IP. It is however compatible with replica sets, configured with the pod IP as identifier - the sidecar
should not add an additional entry for it, nor alter the existing entries. The mongo-k8s-sidecar should only use the stable
network ID for new entries in the cluster.

Finally if you have a preconfigured replica set you have to make sure that:
- the names of the mongo nodes are their IPs
- the names of the mongo nodes are their stable network IDs (for more info see the link above)

Example of compatible mongo replica names:
```
10.48.0.72:27017 # Uses the default pod IP name
mongo-prod-0.mongodb.db-namespace.svc.cluster.local:27017 # Uses the stable network ID
```

Example of not compatible mongo replica names:
```
mongodb-service-0 # Uses some custom k8s service name. Risks being a duplicate entry for the same mongo.
```

If you run the sidecar alongside such a cluster, it may lead to a broken replica set, so make sure to test it well before
going to production with it (which applies for all software).

#### MongoDB Command
The following is an example of how you would update the mongo command enabling ssl and using a certificate obtained from a secret and mounted at /data/ssl/mongodb.pem

Command
```
        - name: my-mongo
          image: mongo
          command:
            - mongod
            - "--replSet"
            - heroku
            - "--smallfiles"
            - "--noprealloc"
            - "--sslMode"
            - "requireSSL"
            - "--sslPEMKeyFile"
            - "/data/ssl/mongodb.pem"
            - "--sslAllowConnectionsWithoutCertificates"
            - "--sslAllowInvalidCertificates"
            - "--sslAllowInvalidHostnames"
```

Volume & Volume Mount
```
          volumeMounts:
            - name: mongo-persistent-storage
              mountPath: /data/db
            - name: mongo-ssl
              mountPath: /data/ssl
        - name: mongo-sidecar
          image: cvallance/mongo-k8s-sidecar:latest
          env:
            - name: MONGO_SIDECAR_POD_LABELS
              value: "role=mongo,environment=prod"
            - name: MONGO_SSL_ENABLED
              value: 'true'
      volumes:
        - name: mongo-ssl
          secret:
            secretName: mongo
```

#### Creating Secret for SSL
Use the Makefile:

| Environment Variable | Required | Default | Description |
| --- | --- | --- | --- |
| MONGO_SECRET_NAME | NO | mongo-ssl | This is the name that the secret containing the SSL certificates will be created with. |
| KUBECTL_NAMESPACE | NO | default | This is the namespace in which the secret containing the SSL certificates will be created. |

```
export MONGO_SECRET_NAME=mongo-ssl
export KUBECTL_NAMESPACE=default
cd examples && make generate-certificate
```

or

Generate them on your own and push the secrets `kube create secret generic mongo --from-file=./keys`
where `keys` is a directory containing your SSL pem file named `mongodb.pem`

## Debugging

TODO: Instructions for cloning, mounting and watching

## Still to do

- Add tests!
- Add to circleCi
- Alter k8s call so that we don't have to filter in memory
