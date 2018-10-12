FROM node:8
ENTRYPOINT ["./entrypoint.sh"]
CMD ["/usr/local/bin/node", "index.js"]

ENV TNS_ADMIN /home/node
ENV LD_LIBRARY_PATH /home/node/instantclient

WORKDIR /home/node

COPY --chown=node:node . /home/node

RUN apt-get update && apt-get install -y build-essential git sudo libaio1 \
  && sudo -u node sh -c 'rm -rf node_modules \
    && export OCI_LIB_DIR=/home/node/instantclient \
    && export OCI_INC_DIR=/home/node/instantclient/sdk/include \
    && npm install --prod && npm cache clean -f' \
  && apt-get purge -y build-essential git && apt-get clean \
  && rm -rf tmp/* /var/cache/*

USER node
