'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, type Project } from '@/lib/supabase'

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProjects()
  }, [])

  async function fetchProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) setProjects(data)
    setLoading(false)
  }

  async function deleteProject(id: string) {
    if (!confirm('このフィードバックを削除しますか？')) return
    await supabase.from('projects').delete().eq('id', id)
    setProjects(projects.filter((p) => p.id !== id))
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-800">修正依頼ツール</h1>
        <Link
          href="/new"
          className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition font-medium"
        >
          ＋ 新規作成
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500">読み込み中...</p>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">まだフィードバックがありません</p>
          <p className="mt-2 text-sm">「新規作成」から始めましょう</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 shadow-sm"
            >
              <img
                src={project.image_url}
                alt={project.name}
                className="w-24 h-16 object-cover rounded-lg border border-gray-100"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 truncate">{project.name}</p>
                <p className="text-sm text-gray-400 mt-1">
                  {new Date(project.created_at).toLocaleDateString('ja-JP')}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link
                  href={`/edit/${project.id}`}
                  className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                >
                  編集
                </Link>
                <Link
                  href={`/share/${project.id}`}
                  className="text-sm px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition"
                >
                  共有ページ
                </Link>
                <button
                  onClick={() => deleteProject(project.id)}
                  className="text-sm px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
