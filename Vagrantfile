# -*- mode: ruby -*-
# vi: set ft=ruby :

VAGRANTFILE_API_VERSION = "2"

Vagrant.configure(VAGRANTFILE_API_VERSION) do |config|
  config.vm.box = "hashicorp/precise32"

  for i in 9000..9100
    config.vm.network :forwarded_port, guest: i, host: i
  end
  # config.vm.network "private_network", ip: "192.168.33.10"
  # config.vm.network "public_network"

  config.vm.synced_folder "../ng-models", "/ng-models"
  config.vm.synced_folder "../ng-frontend", "/ng/ng-frontend"
  config.vm.synced_folder "../ng-git", "/ng/ng-git"
  config.vm.synced_folder "../ng-proxy", "/ng/ng-proxy"

  config.vm.provider "virtualbox" do |vb|
    # vb.gui = true
    vb.customize ["modifyvm", :id, "--memory", "512"]
  end
end
