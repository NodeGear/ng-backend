#!/bin/bash
# To get a $USER id, use `id -u $USER`

useradd -d $HOME -m $USER
RESULT=$?

if [ $RESULT == 9 ]; then
   exit 0
fi

exit 0