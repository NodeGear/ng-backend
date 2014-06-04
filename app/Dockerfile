# DOCKER-VERSION 0.3.4
FROM centos:6.4

# Enable EPEL for Node.js
RUN rpm -Uvh http://download.fedoraproject.org/pub/epel/6/i386/epel-release-6-8.noarch.rpm
# Install Node.js and npm
RUN yum install -y npm

ADD . /src
RUN cd /src; npm install

EXPOSE 8080

ENV NODE_ENV production
ENV PORT 8080

CMD ["node", "/src/test.js"]
