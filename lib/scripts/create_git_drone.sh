#!/bin/bash

# Arguments:
# $1 Location
# $2 git location
# $3 user id
# $4 user $HOME

# Exit codes:
# 0 - success
# 1 - fail
# Specific codes:
# 2 - Failed Cloning Repository
# 3 - Failed Installing Dependencies
# 4 - Failed Updating Repository

mkdir -p ${4}/logs

# If app location exists..
if [ -d "$1" ]; then
	cd $1
	
	# Update the code
	git reset --hard
	git pull /home/git/repositories/${2}.git master
	# If that doesn't work
	if [ $? -ne 0 ]; then
		cd $4
		# remove the folder
		rm -rf $1
		
		# and clone it
		git clone /home/git/repositories/${2}.git ${1}
		
		# Unsuccessful git clone
		if [ $? -ne 0 ]; then
			cd $4
			
			# Clean up
			rm -rf $1
			
			echo "Failed Cloning Repository"
			exit 2
		fi
	fi
else
	git clone /home/git/repositories/${2}.git ${1}
	
	# Unsuccessful git clone
	if [ $? -ne 0 ]; then
		cd $4
		
		# Clean up
		rm -rf $1
		
		echo "Failed Cloning Repository"
		exit 2
	fi
fi

# fixing permissions
chown -R ${3}:${3} ${4}
chmod -R 770 ${4}

cd $1
/usr/local/bin/npm install
# Did not install dependencies correctly
if [ $? -ne 0 ]; then
	echo "Failed Installing Dependencies"
	exit 3
fi

exit 0