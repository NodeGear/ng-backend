#!/bin/bash

# $1 - User ID
# $2 - Process location..
# $3 - Save file diff
# $4 - Diff file location

# Exit codes:
# 0 - Success
# 1 - Owner of directory not equal to the user id
# 2 - Folder does not exist..

echo $2
if [ ! -d "$2" ]; then
	exit 2
fi

if [ $3 -eq 1 ]; then
	cd $2
	git add --all
	git diff --binary --cached HEAD > $4
fi

rm -rf $2

exit 0