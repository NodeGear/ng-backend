#!/bin/bash

# $1 Location
# $2 git location
# $3 user id

git clone /home/git/repositories/${2}.git ${1}
chown -R ${3}:${3} ${1}
chmod -R 770 ${1}
cd $1

/usr/local/bin/npm install