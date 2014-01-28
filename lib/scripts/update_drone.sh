#!/bin/bash

cd $1;
git reset --hard &> /dev/null;
# TODO security issue right here...
git pull /home/git/repositories/${2}.git &> /dev/null

/usr/local/bin/npm install