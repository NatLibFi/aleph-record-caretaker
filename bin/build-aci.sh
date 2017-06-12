#!/bin/bash

ACBUILD_CMD="acbuild --no-history --debug"

if [ -z $ACBUILD_ENGINE ];then
  ACBUILD_ENGINE="systemd-nspawn"
fi

ACI_OS="linux"
ACI_ARCH="amd64"
ACI_RELEASE="xenial"
ACI_NAME_DOMAIN="appc.cont-registry-kk.lib.helsinki.fi"
ACI_NAME_GROUP="melinda"
ACI_NAME="aleph-record-caretaker-ubuntu"
ACI_VERSION="1.0.0"

npm run build &&

$ACBUILD_CMD begin docker://ubuntu:xenial

$ACBUILD_CMD set-name "$ACI_NAME_DOMAIN/$ACI_NAME_GROUP/$ACI_NAME"
$ACBUILD_CMD label add version $ACI_VERSION
$ACBUILD_CMD label add os $ACI_OS
$ACBUILD_CMD label add arch $ACI_ARCH
$ACBUILD_CMD label add release $ACI_RELEASE

$ACBUILD_CMD set-exec -- /usr/bin/node /opt/aleph-record-caretaker/app/index.js

$ACBUILD_CMD mount add logs /opt/aleph-record-caretaker/logs
$ACBUILD_CMD mount add --read-only conf /opt/aleph-record-caretaker/conf

$ACBUILD_CMD copy-to-dir ./build/ /opt/aleph-record-caretaker/app
$ACBUILD_CMD copy ./package.json /opt/aleph-record-caretaker/app/

if [ $ACBUILD_ENGINE == 'chroot' ];then
  $ACBUILD_CMD run --engine chroot -- /bin/bash -c "echo '$(grep -m1 -E ^nameserver /etc/resolv.conf)' > /etc/resolv.conf"
fi

$ACBUILD_CMD run --engine $ACBUILD_ENGINE --working-dir /opt/aleph-record-caretaker/app -- npm install --production

if [ $ACBUILD_ENGINE == 'chroot' ];then
  $ACBUILD_CMD run --engine chroot -- rm /etc/resolv.conf
fi

$ACBUILD_CMD write "build/$ACI_NAME_GROUP-$ACI_NAME-$ACI_OS-$ACI_ARCH-$ACI_RELEASE-$ACI_VERSION.aci"
$ACBUILD_CMD end

chmod og+rx build
