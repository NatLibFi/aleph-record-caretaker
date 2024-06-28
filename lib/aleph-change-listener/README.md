# A module to listen for record changes in Aleph ILS [![NPM Version](https://img.shields.io/npm/v/@natlibfi/aleph-change-listener.svg)](https://npmjs.org/package/@natlibfi/aleph-change-listener) [![Build Status](https://travis-ci.org/NatLibFi/aleph-change-listener.svg)](https://travis-ci.org/NatLibFi/aleph-change-listener)

A module to listen for record changes in Aleph ILS

# Installation

Oracle instantclient installed into /opt/instantclient_12_2
```
export OCI_LIB_DIR=/opt/instantclient_12_2
export OCI_INC_DIR=/opt/instantclient_12_2/sdk/include

npm install
```

# Running

The tnsnames.ora file must be used for connection. This cane be done with TNS_ADMIN.

Example:
```
TNS_ADMIN=`pwd` LD_LIBRARY_PATH=/opt/instantclient_12_2/ node auth-sync-service.js
```

Example of tnsnames.ora 
```
$ cat tnsnames.ora 
tunnel =
 (DESCRIPTION =
   (ADDRESS = (PROTOCOL = TCP)(HOST = localhost)(PORT = 1521))
   (CONNECT_DATA =
     (SID = ALEPH20)
   )
 )
 ```
 This example uses oracle in localhost

## License and copyright

Copyright (c) 2017 **University Of Helsinki (The National Library Of Finland)**

This project's source code is licensed under the terms of  **Apache License 2.0**.
