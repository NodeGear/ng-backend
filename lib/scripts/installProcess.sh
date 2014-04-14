#!/bin/bash

# $1 User ID
# $2 Process ID
# $3 Git Location
# $4 Git Branch

# Exit codes:
# 0 - OK
# 1 - /home/$1/$2 exists
# 2 - Git not valid
# 3 - Could not find Branch
# 4 - Could not install
# 5 - Other error

homedir=$( getent passwd "$1" | cut -d: -f6 )

if [ -d "$homedir/$2" ]; then
	exit 1
fi

cd $homedir

git clone "$3" $2
if [ $? -ne 0 ]; then
	exit 2
fi

cd $2

git pull origin "$4"
if [ $? -ne 0 ]; then
	exit 3
fi

git checkout "$4"
if [ $? -ne 0 ]; then
	exit 3
fi

npm install
if [ $? -ne 0 ]; then
	exit 4
fi

exit 0