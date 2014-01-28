#!/bin/bash

git clone /home/git/repositories/${2}.git ${1}
cd $1

/usr/local/bin/npm install