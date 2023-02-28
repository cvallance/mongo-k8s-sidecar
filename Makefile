IMG_URL ?= shantanubansal/mongo-k8s-sidecar
IMG_TAG ?= latest
MONGOK8SSIDECAR_IMG ?= ${IMG_URL}:${IMG_TAG}


MAKEFILE_PATH := $(abspath $(lastword $(MAKEFILE_LIST)))
CURRENT_DIR := $(dir $(MAKEFILE_PATH))

docker:
	@echo "Generating the docker build for mongo-k8s-sidecar server"
	@docker build . -t ${MONGOK8SSIDECAR_IMG} -f Dockerfile --no-cache
	@echo "Generated the docker image for mongo-k8s-sidecar server"
	docker push ${MONGOK8SSIDECAR_IMG}
