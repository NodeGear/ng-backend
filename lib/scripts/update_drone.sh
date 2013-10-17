#!/bin/bash

cd $DRONE_LOCATION;
git reset --hard;
git pull /home/nodecloud/repositories/${GL_REPO}.git
