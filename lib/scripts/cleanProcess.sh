#!/bin/bash

# $1 - User ID
# $2 - Process location..

# Exit codes:
# 0 - Success
# 1 - Owner of directory not equal to the user id
# 2 - Folder does not exist..

echo $2
if [ ! -d "$2" ]; then
	exit 2
fi

rm -rf $2

exit 0