-- 在 Supabase SQL Editor 中执行以下代码创建表

-- 注意：因为 ark-api 返回的 task id 可能不是标准的 uuid，推荐使用 varchar
DROP TABLE IF EXISTS public.tasks;

CREATE TABLE public.tasks (
  id varchar PRIMARY KEY,
  prompt text,
  mode varchar DEFAULT 'text2video',
  ratio varchar DEFAULT '16:9',
  duration integer DEFAULT 5,
  seed integer,
  status varchar NOT NULL DEFAULT 'pending',
  video_url text,                -- 原始视频链接（第三方 CDN）
  video_storage_path text,       -- Supabase Storage 中的路径
  video_storage_url text,        -- Supabase Storage 公开访问 URL
  thumbnail_url text,            -- 视频缩略图（尾帧）
  progress integer DEFAULT 0,
  error text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  completed_at timestamp with time zone
);

-- 设置 Row Level Security (RLS)
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 允许 service_role 全权访问（后端使用 service_role key）
CREATE POLICY "Service role full access" ON public.tasks
  FOR ALL USING (true) WITH CHECK (true);

-- ====== Storage Bucket ======
-- 在 Supabase Dashboard → Storage 中创建名为 "videos" 的 Bucket
-- 设置为 Public Bucket（允许公开读取）
-- 或者在 SQL Editor 中执行：
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;
