-- Supabaseのダッシュボードで「SQL Editor」を開いて実行してください

-- projectsテーブル作成
create table projects (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  image_url text not null,
  canvas_json text,
  created_at timestamp with time zone default now()
);

-- Storageバケット作成（GUIでも可）
insert into storage.buckets (id, name, public)
values ('feedback-images', 'feedback-images', true);

-- Storageの公開ポリシー（誰でも画像を読める）
create policy "Public read feedback images"
on storage.objects for select
using ( bucket_id = 'feedback-images' );

-- Storageのアップロードポリシー（誰でもアップロード可）
create policy "Anyone can upload feedback images"
on storage.objects for insert
with check ( bucket_id = 'feedback-images' );

-- projectsテーブルの読み書きポリシー
create policy "Public read projects"
on projects for select
using (true);

create policy "Anyone can insert projects"
on projects for insert
with check (true);

create policy "Anyone can update projects"
on projects for update
using (true);

create policy "Anyone can delete projects"
on projects for delete
using (true);

-- RLSを有効化
alter table projects enable row level security;
