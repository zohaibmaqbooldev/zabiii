#!/bin/bash
# Fresh local database that mirrors the real project, then apply setup.sql
set -e
cd "$(dirname "$0")/.."
P="psql -h /tmp -p 54329 -U postgres -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists portfolio with (force)" -c "drop role if exists anon" -c "drop role if exists authenticated" -c "drop role if exists authenticator" -c "create database portfolio"
$P -d portfolio -f test/supabase-stub.sql
$P -d portfolio -c "create extension if not exists pgcrypto; insert into auth.users(id,email,encrypted_password) values ('11111111-1111-1111-1111-111111111111','zohaibmaqbool313@gmail.com',crypt('Admin#2026',gen_salt('bf'))),('22222222-2222-2222-2222-222222222222','random@test.local',crypt('Random#2026',gen_salt('bf')))"
$P -d portfolio -f supabase/setup.sql 2>&1 | grep -E "ERROR|NOTICE" || true
rm -rf test/.storage
