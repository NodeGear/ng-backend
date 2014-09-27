# -*- mode: ruby -*-
# vi: set ft=ruby :

VAGRANTFILE_API_VERSION = "2"

Vagrant.configure(VAGRANTFILE_API_VERSION) do |config|
  config.vm.define "ng-backend"
  config.vm.box = "hashicorp/precise64"

  config.vm.network "private_network", ip: "10.0.3.3"

  config.vm.synced_folder ".", "/var/lib/backend", type: "rsync", rsync__exclude: [".git/", "node_modules/"]
  config.vm.synced_folder "../ng-fs", "/var/lib/ng_fs", type: "rsync", rsync__exclude: [".git/", "node_modules/"]

  config.vm.provider "virtualbox" do |v|
    v.memory = 4086
    v.cpus = 2
  end

  config.vm.provision :shell do |s|
    s.inline = <<-EOT
      apt-get update
      apt-get install -y curl
      
      # Check that HTTPS transport is available to APT
      if [ ! -e /usr/lib/apt/methods/https ]; then
        apt-get install -y apt-transport-https
      fi

      # Add the repository to your APT sources
      echo deb https://get.docker.io/ubuntu docker main > /etc/apt/sources.list.d/docker.list

      # Then import the repository key
      apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 36A1D7869245C8950F966E92D8576A8BA88D21E9

      # Install docker
      apt-get update
      apt-get install -y lxc-docker-1.1.2
    EOT
  end

  config.vm.provision :docker do |d|
    d.pull_images "castawaylabs/node-docker"
    d.pull_images "castawaylabs/mongodb-docker"
    d.pull_images "tutum/mysql"

    d.run "ng_client_mongodb",
      image: "castawaylabs/mongodb-docker",
      args: "-p 27017:27017 -v /var/lib/mongodb_client:/var/lib/mongodb",
      cmd: "mongod --config /etc/mongod.conf --smallfiles --noauth"

    d.run "ng_client_mysql",
      image: "tutum/mysql",
      args: "-p 3306:3306 -v /var/lib/ng_client_mysql:/var/lib/mysql -e MYSQL_PASS=ng_backend"

    d.run "ng_fs",
      image: "castawaylabs/node-docker",
      args: "-e PORT=80 -e NODEMON=y -e FILES_DIR=/var/lib/files -e AUTH=ng_fs -p 8899:80 -v /var/lib/files:/var/lib/files -v /var/lib/ng_fs:/srv/app"

    d.run "ng_backend",
      image: "castawaylabs/node-docker",
      args: "-e NODEMON=y -v /var/lib/backend:/srv/app -v /proc:/outside_proc -v /var/run/docker.sock:/var/run/docker.sock -v /home/ng_users:/home"
  end
end
