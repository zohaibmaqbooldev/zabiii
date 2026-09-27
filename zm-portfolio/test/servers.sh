#!/bin/bash
# (re)start the local Supabase-compatible gateway and the static site server
cd "$(dirname "$0")/.."
for f in /tmp/zm-gw.pid /tmp/zm-web.pid; do [ -f $f ] && kill $(cat $f) 2>/dev/null; done
sleep 0.4
ANON_KEY=sb_publishable_localtestkey nohup node test/gateway.mjs > /tmp/gw.log 2>&1 & echo $! > /tmp/zm-gw.pid
nohup node build.mjs --preview > /tmp/web.log 2>&1 & echo $! > /tmp/zm-web.pid
sleep 0.8
