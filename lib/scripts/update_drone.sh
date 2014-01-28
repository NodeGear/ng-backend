#!/bin/bash

cd $DRONE_LOCATION;
git reset --hard &> /dev/null;
# TODO security issue right here...
git pull /home/git/repositories/${GL_REPO}.git &> /dev/null

/usr/local/bin/npm install