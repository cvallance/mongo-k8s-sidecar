NUM_REPLICAS=$(shell kubectl get rc -l role=mongo -o template --template='{{ len .items }}')
NEW_REPLICA_NUM=$(shell expr $(NUM_REPLICAS) + 1 )
CREATE_SERVICE=TRUE
MONGO_SECRET_NAME ?= "mongo-ssl"
KUBECTL_NAMESPACE ?= "default"


# ENV Options
# -GoogleCloudPlatform
# -FLOCKERAWS
# -AWS (NOT YET SUPPORTED)
ENV=GoogleCloudPlatform

# Default volume size on creation
DISK_SIZE=100GB

# GoogleCloudPlatform Specific Environment Variables
ZONE=us-central1-f

# FLOCKERAWS Specific Environment Variables
CONTROL_DNS=<FLOCKER CONTROL DNS>
INITIAL_NODE_ID=<A FLOCKER NODE ID TO SEED A VOLUME>
VOLUME_PREFIX=<any name to prefix your volumes with>
KUBECONFIG=clusters/<K8s Cluster Name>/kubeconfig


count:
	@echo 'Current Number of MongoDB Replicas: $(NUM_REPLICAS)'
create-volume:
ifeq ($(ENV),FLOCKERAWS)
	-flockerctl --control-service=$(CONTROL_DNS) create -m name=$(VOLUME_PREFIX)-$(NEW_REPLICA_NUM) -s $(DISK_SIZE) --node=$(INITIAL_NODE_ID)
endif
add-replica:
ifeq ($(ENV),GoogleCloudPlatform)
	@echo 'Creating Disk'
	-gcloud compute disks create mongo-persistent-storage-node-$(NEW_REPLICA_NUM)-disk --size $(DISK_SIZE) --zone $(ZONE)

	@echo 'Adding Replica'
	-sed -e 's~<num>~$(NEW_REPLICA_NUM)~g' mongo-controller-template.yaml | kubectl create -f -
endif
ifeq ($(ENV),AWS)
	@echo 'AWS not supported yet'
endif
ifeq ($(ENV),FLOCKERAWS)
	@echo 'Adding Replica $(NEW_REPLICA_NUM)'

	-touch mongo-rc-$(NEW_REPLICA_NUM).yaml
	# replace volume name with declared $(VOLUME_PREFIX) and $(NEW_REPLICA_NUM)
	# This will create a new file allowing you to remove and redeploy specific Replication Controllers
	# kubectl create -f mongo-rc-1.yaml
	# kubectl delete -f mongo-rc-1.yaml
	-sed -e 's/<num>/$(NEW_REPLICA_NUM)/g' -e 's/VOLUME_PREFIX/$(VOLUME_PREFIX)/g' mongo-controller-flocker-template.yaml | tee mongo-rc-$(NEW_REPLICA_NUM).yaml
	-kubectl create -f mongo-rc-$(NEW_REPLICA_NUM).yaml
endif
ifeq ($(CREATE_SERVICE),TRUE)
	@echo 'Creating Service'
	-sed -e 's~<num>~$(NEW_REPLICA_NUM)~g' mongo-service-template.yaml | kubectl create -f -
endif

delete-replica:
	@echo 'Deleting Service'
	-kubectl delete svc mongo-$(NUM_REPLICAS)
ifeq ($(ENV),GoogleCloudPlatform)
	@echo 'Deleting Replic'
	-kubectl delete rc mongo-$(NUM_REPLICAS)

	@echo 'Deleting Disk'
	sleep 60
	-yes | gcloud compute disks delete mongo-persistent-storage-node-$(NUM_REPLICAS)-disk --zone $(ZONE)
endif
ifeq ($(ENV),AWS)
	@echo 'AWS not supported yet'
endif

generate-certificate:
	@echo 'Generating self signed certificate'
	-openssl genrsa -des3 -passout pass:x -out server.pass.key 2048
	-openssl rsa -passin pass:x -in server.pass.key -out server.key
	-rm server.pass.key
	-openssl req -new -key server.key -out server.csr -subj "/C=US/ST=Georgia/L=Atlanta/O=Self/OU=Ops/CN=localhost"
	-openssl x509 -req -days 365 -in server.csr -signkey server.key -out server.crt
	-cat server.key server.crt > mongodb.pem
	-rm server.key server.crt server.csr
	# Will need to consider setting the correct namespace
	-kubectl --namespace=$(KUBECTL_NAMESPACE) delete secret $(MONGO_SECRET_NAME)
	-kubectl --namespace=$(KUBECTL_NAMESPACE) create secret generic $(MONGO_SECRET_NAME) --from-file=./mongodb.pem
	-rm mongodb.pem
