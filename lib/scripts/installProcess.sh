#!/bin/bash

# $1 User ID
# $2 Process ID
# $3 Git Location
# $4 Git Branch
# $5 NPM Options

# Exit codes:
# 0 - OK
# 1 - /home/$1/$2 exists
# 2 - Git not valid
# 3 - Could not find Branch
# 4 - Could not install
# 5 - Other error

source ~/.bashrc

#PATH=$PATH:/usr/local/bin

git clone "$3" $2
if [ $? -ne 0 ]; then
	exit 2
fi

cd $2

git checkout "$4"
if [ $? -ne 0 ]; then
	exit 3
fi

npm --no-color ${5} install
if [ $? -ne 0 ]; then
	exit 4
fi

exit 0