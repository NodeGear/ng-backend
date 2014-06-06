for port in `seq 9000 10000`;
do
	echo > /dev/tcp/127.0.0.1/$port 2> /dev/null &&
		echo "port $port is open" ||
		echo "port $port is closed"
done