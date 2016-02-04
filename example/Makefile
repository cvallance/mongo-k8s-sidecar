NUM_REPLICAS=$(shell kubectl get rc -l role=mongo -o template --template='{{ len .items }}')
NEW_REPLICA_NUM=$(shell expr $(NUM_REPLICAS) + 1 )

ZONE=us-central1-f

DISK_SIZE=500GB

ENV=GoogleCloudPlatform

CREATE_SERVICE=TRUE

count:
	@echo 'Current Number of MongoDB Replicas: $(NUM_REPLICAS)'

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
