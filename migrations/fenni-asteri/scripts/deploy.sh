

rsync -avz --exclude node_modules --exclude tnsnames.ora --exclude dbconfig.js --delete .. petuomin@libnet2-kk.lib.helsinki.fi:/home/petuomin/sync-tool

ssh libnet2-kk.lib.helsinki.fi -l petuomin -i ~/.ssh/id_dsa_kk -A -C "rsync -avz sync-tool petuomin@melinda-proc-kk.lib.helsinki.fi:/home/petuomin"
