#!/bin/sh
sed \
  -e "s/%/|/g" \
  -e "s/|PROTOCOL|/$PROTOCOL/g" \
  -e "s/|HOST|/$HOST/g" \
  -e "s/|SID|/$SID/g" \
  -e "s/|PORT|/$PORT/g" \
  tnsnames.ora.template > tnsnames.ora

if [ -n $WALLET_DIRECTORY ];then
  sed \
    -e "s/%/_/g" \
    -e "s|_WALLET_DIRECTORY_|$WALLET_DIRECTORY|g" \
    sqlnet.ora.template > sqlnet.ora
fi

exec $@
