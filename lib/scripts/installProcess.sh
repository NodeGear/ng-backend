#!/bin/bash

# $1 User ID
# $2 Process ID
# $3 Git Location
# $4 Git Branch
# $5 Uses snapshot?
# $6 Snapshot location

# Exit codes:
# 0 - OK
# 1 - /home/$1/$2 exists
# 2 - Git not valid
# 3 - Could not find Branch
# 5 - Other error

#source ~/.bashrc

#PATH=$PATH:/usr/local/bin

printf "#\041/bin/bash\nssh -i /home/${1}/.ssh/id_rsa \$1 \$2\n" > /home/$1/ssh_wrapper.sh
chmod +x /home/$1/ssh_wrapper.sh

GIT_SSH=/home/$1/ssh_wrapper.sh git clone "$3" $2
if [ $? -ne 0 ]; then
	exit 2
fi

cd $2

git checkout "$4"
if [ $? -ne 0 ]; then
	exit 3
fi

if [ $5 -eq 1 ]; then
	git apply $6
	rm -f $6
fi

exit 0
