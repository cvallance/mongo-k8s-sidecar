#!/usr/bin/env bash

if [[ $1 -eq 0 ]] ; then
    echo "Need to supply the number of replicas to scale to. E.g. ./resize.sh 5"
    exit 1
fi

kubectl resize --replicas=$1 replicationcontrollers mongo-test-ctl