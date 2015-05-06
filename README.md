# Mongo Kubernetes Replica Set Sidecar

This project is as a PoC to setup a mongo replica set using Kubernetes.

## How to use it

Example Kubernetes mongodb replication controller:

    id: mongo-dev-ctl
    kind: ReplicationController
    apiVersion: v1beta2
    desiredState:
      replicas: 3
      replicaSelector:
        name: mongo
        environment: dev
      podTemplate:
        desiredState:
          manifest:
            version: v1beta2
            id: mongo-dev
            containers:
              - name: mongo
                image: mongo
                command:
                  - mongod
                  - "--replSet"
                  - rs0
                  - "--smallfiles"
                  - "--noprealloc"
                ports:
                  - containerPort: 27017
              - name: mongo-sidecar
                image: leportlabs/mongo-k8s-sidecar
                env:
                  - name: MONGO_SIDECAR_POD_LABELS
                    value: "name:mongo,environment:dev" #should match the labels for this podTemplate
        labels:
          name: mongo
          environment: dev

### Settings

Environment Var Name  | Required  | Default  | Description
--------------------- | --------- | -------- | -----------
MONGO_SIDECAR_POD_LABELS  | YES  |   | This should be a be a comma separated list of key values the same as the podTemplate labels. See above for example.
MONGO_SIDECAR_SLEEP_SECONDS  | NO  | 5  | This is how long to sleep between work cycles.
MONGO_SIDECAR_UNHEALTHY_SECONDS  | NO  | 15  | This is how many seconds a replica set member has to get healthy before automatically being removed from the replica set.

## Debugging

TODO: Instructions for cloning, mounting and watching