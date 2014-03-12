#!/bin/bash

# Arguments:
# $1 Location
# $2 user id
# $3 user $HOME
# $4 Template location

# Exit codes:
# 0 - success
# 1 - fail
# Specific codes:
# 2 - Location $1 exists.
# 3 - Template does not exist
# 4 - Failed to install Dependencies

mkdir -p ${3}/logs

if [ -d "${4}" ]; then
	echo "Ghost Template exists.."
else
	echo "Ghost Template does Not Exist"
	exit 3
fi

# If app location exists..
if [ -d "$1" ]; then
	echo "App Folder Already Exists"
	exit 2
else
	echo "Copying template"
	mkdir -p ${1}
	rsync -az ${4} ${1}
fi

# fixing permissions
chown -R ${2}:${2} ${3}
chmod -R 770 ${3}

cd $1
/usr/local/bin/npm install
# Did not install dependencies correctly
if [ $? -ne 0 ]; then
	echo "Failed Installing Dependencies"
	exit 4
fi

exit 0