# A service that applies Melinda-specific conversions when records change in Aleph [![NPM Version](https://img.shields.io/npm/v/@natlibfi/aleph-record-caretaker.svg)](https://npmjs.org/package/aleph-record-caretaker) [![Build Status](https://travis-ci.org/NatLibFi/aleph-record-caretaker.svg)](https://travis-ci.org/NatLibFi/aleph-record-caretaker)

# Installation

This system requires oracle connections. Check instructions for installing [node-oracledb](https://github.com/oracle/node-oracledb).

Installation in short:

Oracle instantclient installed into /opt/instantclient_12_2
```
export OCI_LIB_DIR=/opt/instantclient_12_2
export OCI_INC_DIR=/opt/instantclient_12_2/sdk/include

npm install
```

# Running

The tnsnames.ora file must be used for connection. This can be done with TNS_ADMIN environment variable.

Example:
```
TNS_ADMIN=`pwd` LD_LIBRARY_PATH=/opt/instantclient_12_2/ node index.js
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

This example uses oracle in localhost. The repository contains file called `tnsnames.ora.template` which can be used to make the tnsname.ora with sed, for example:
```
cat tnsnames.ora.template | sed 's/%PROTOCOL%/TCP/g' | sed 's/%HOST%/tunnel/g' | sed 's/%SID%/ALEPH20/g' | sed 's/%PORT%/1521/g'
```
## Encrypted communication with the Oracle DB
Encrypted communication can be enabled by generating configuration files like so:
```
cat tnsnames.ora.template | sed 's/%PROTOCOL%/TCPS/g' | sed 's/%HOST%/tunnel/g' | sed 's/%SID%/ALEPH20/g' | sed 's/%PORT%/2484/g'
```

```
cat sqlnet.ora.template | sed 's/%WALLET_DIRECTORY%/\/path\/to\/wallet/g' | sed 's/%HOST%/tunnel/g' | sed 's/%SID%/ALEPH20/g' | sed 's/%PORT%/1521/g'
```
Refer to [official instructions](https://docs.oracle.com/middleware/1213/wls/JDBCA/oraclewallet.htm) for wallet management.
## Configuration
The following environment variables are used to configure the system:

| name | mandatory | description | default |
|---|---|---|---|
| Z106_BASES | | Z106 bases for polling | FIN01\|FIN10\|FIN11 |
| Z115_BASE | | Z115 base for polling | USR00 |
| CURSOR_FILE | | file for saving the polling cursors | .aleph-changelistener-cursors.json |
| Z106_STASH_PREFIX | | file for saving intermediate info about Z106 | .z106_stash |
| POLL_INTERVAL_MS | | wait time between pollings | 5000 |
| ORACLE_USER | x | oracle username | -
| ORACLE_PASS | x | oracle password | -
| ORACLE_CONNECT_STRING | x | oracle connection string | -
| X_SERVER | x | Aleph X-server url | -
| ALEPH_CARETAKER_USER | x | Aleph username | -
| ALEPH_CARETAKER_PASS | x | Aleph password | -
| MELINDA_API | | melinda api endpoint | http://libtest1.csc.fi:8992/API
| NOOP |  | run without making changes to database | 0
| NOOP_BIBCHANGE | | run without making bib change triggered changes to database | 0
| ONLINE | | times to run the service | '00:00-21:55, 22:30-24:00' |
| TNS_ADMIN | | Path to Oracle configuration files |  |

Since the Z106 resolution is only 60 seconds in Aleph, the changes that have already been handled are saved so that nothing is handled multiple times.

The ORACLE_CONNECT_STRING must match the connection string in the tnsnames.ora file. With above tnsnames.ora it should be "tunnel".

## License and copyright

Copyright (c) 2017-2019 **University Of Helsinki (The National Library Of Finland)**

This project's source code is licensed under the terms of **Apache License 2.0**.
