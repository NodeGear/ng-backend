NodeGear
=========

`ng-backend is a standalone node application attached to `Redis`, listening for notifications regarding Applications.

This app has a process manager handling user applications. It is a container to run node applications in nodegear.

Duties:
- Listen to redis
- Boot application
- Notify user when app stops
- Stream app logs to redis db
- Install and manage user on the system ng-backend is running on.
	- `/home/:uid/:app_id/:pid`