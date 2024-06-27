FROM node:8
ENTRYPOINT ["./entrypoint.sh"]
CMD ["/usr/local/bin/node", "index.js"]
WORKDIR /home/node

ENV TNS_ADMIN /home/node
ENV LD_LIBRARY_PATH /home/node/instantclient
ENV WALLET_DIRECTORY /home/node/wallet

COPY --chown=node:node . /home/node

RUN apt-get update && apt-get install -y build-essential git sudo libaio1 \
  && mkdir /data && chown node:node /data \  
  && sudo -u node \
    OCI_LIB_DIR=/home/node/instantclient \
    OCI_INC_DIR=/home/node/instantclient/sdk/include \
    npm install --prod \ 
  && sudo -u node npm cache clean -f \
  && apt-get purge -y build-essential git && apt-get clean \
  && rm -rf tmp/* /var/cache/*

USER node