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

- KUBE_NAMESPACE  
  Required: NO  
  The namespace to look up pods in. Not setting it will search for pods in all namespaces.
- MONGO_SIDECAR_POD_LABELS  
  Required: YES  
  This should be a be a comma separated list of key values the same as the podTemplate labels. See above for example.
- MONGO_SIDECAR_SLEEP_SECONDS  
  Required: NO  
  Default: 5  
  This is how long to sleep between work cycles.
- MONGO_SIDECAR_UNHEALTHY_SECONDS  
  Required: NO  
  Default: 15  
  This is how many seconds a replica set member has to get healthy before automatically being removed from the replica set.
- MONGO_PORT
  Required: NO
  Default: 27017
  Configures the mongo port, allows the usage non-standard ports.
- KUBERNETES_MONGO_SERVICE_NAME  
  Required: NO  
  This should point to the MongoDB Kubernetes service that identifies all the pods. It is used for setting up the DNS
  configuration when applying this to stateful sets.  
- KUBERNETES_CLUSTER_DOMAIN  
  Required: NO  
  Default: cluster.local  
  This allows the specification of custom cluster domains. Used for the stable network ID of the k8s Mongo pods. Example for
  a different domain name could be: "kube.local".   

In its default configuration the sidecar uses the pods' IPs for MongodDB replica names. An example follows:
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

If you want to use the StatefulSets' stable network IDs, you have to make sure that you use the `KUBERNETES_MONGO_SERVICE_NAME`
environmental variable. Then the MongoDB replica set node names could look like this:
```
[ { _id: 1,
   name: 'mongo-prod-0.mongodb.db-namespace.svc.cluster.local:27017',
   stateStr: 'PRIMARY',
   ...},
 { _id: 2,
   name: 'mongo-prod-1.mongodb.db-namespace.svc.cluster.local:27017',
   stateStr: 'SECONDARY',
   ...},
 { _id: 2,
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

A thing to consider when running a cluster with the mongo-k8s-sidecar, it will prefer the stateful set stable
network ID over the pod IP. Also if you have pods already having the IP as identifier, it should not add an additional
entry for it, using the stable network ID, it should only add it for new entries in the cluster.

Finally if you have a preconfigured replica set you have to make sure that:
- the names of the mongo nodes are their IPs
- the names of the mongo nodes are their stable network IDs (for more info see the link above)

Example of acceptable names:
```
10.48.0.72:27017
mongo-prod-0.mongodb.db-namespace.svc.cluster.local:27017
```
Example of not-acceptable names:
```
mongodb-service-0
```

If you run the sidecar alongside such a cluster, it may lead to a broken replica set, so make sure to test it well before
going to production with it (which applies for all software).

## Debugging

TODO: Instructions for cloning, mounting and watching

## Still to do

- Add tests!
- Add to circleCi
- Alter k8s call so that we don't have to filter in memory
