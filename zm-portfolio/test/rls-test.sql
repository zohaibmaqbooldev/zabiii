\set ON_ERROR_STOP 0
\echo '== anon'
set role anon;
select count(*) as anon_visible_projects from public.projects;
insert into public.projects(title,slug) values ('hack','hack');
update public.projects set title='pwned';
select count(*) as rows_changed_by_anon from public.projects where title='pwned';
delete from public.projects;
insert into public.skills(name) values ('x');
update public.profiles set name='pwned';
insert into storage.objects(bucket_id,name) values ('portfolio-images','anon.png');
reset role;
\echo '== signed-in but NOT admin'
set role authenticated; select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',false);
insert into public.projects(title,slug) values ('hack2','hack2');
update public.projects set title='pwned2' returning id;
insert into storage.objects(bucket_id,name) values ('portfolio-images','user.png');
select public.is_admin() as random_is_admin;
reset role;
\echo '== admin'
set role authenticated; select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',false);
select public.is_admin() as admin_is_admin;
insert into public.projects(title,slug,published) values ('draft','draft',false) returning title;
update public.projects set title='draft2' where slug='draft' returning title;
insert into storage.objects(bucket_id,name) values ('portfolio-images','admin.png') returning name;
delete from storage.objects where name='admin.png' returning name;
delete from public.projects where slug='draft' returning title;
reset role;
select count(*) total_projects, count(*) filter (where title like 'pwned%' or title like 'hack%') tampered from public.projects;
