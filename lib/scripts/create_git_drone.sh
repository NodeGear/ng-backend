#!/bin/bash

# $1 Location
# $2 git location
# $3 user id
# $4 user $HOME

mkdir -p ${4}/logs
git clone /home/git/repositories/${2}.git ${1}
chown -R ${3}:${3} ${4}
chmod -R 770 ${4}

cd $1
/usr/local/bin/npm install