#!/bin/bash

# $1 User ID

# Exit codes:
# 1 - Cannot create user

id -u $1 > /dev/null

if [ $? -ne 0 ]
then
	useradd -d /home/$2 -m $1

	if [ $? -ne 0 ]
	then
		exit 1
	fi
fi

user_id=$(id -u $1)
group_id=$(id -g $1)

echo "$user_id|$group_id"

exit 0