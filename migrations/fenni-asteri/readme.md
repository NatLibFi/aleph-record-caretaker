

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
TNS_ADMIN=`pwd` LD_LIBRARY_PATH=/opt/instantclient_12_2/ node ora_connect.js
```

Example of tnsnames.ora 
```
$ cat tnsnames.ora 
tunnel =
 (DESCRIPTION =
   (ADDRESS = (PROTOCOL = TCP)(HOST = localhost)(PORT = 1521))
   (CONNECT_DATA =
     (SID = VGER)
   )
 )
 ```
 This example uses oracle in localhost