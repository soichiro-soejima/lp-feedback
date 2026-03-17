'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase, type Project } from '@/lib/supabase'
import type { CommentItem } from '@/app/edit/[id]/page'

export default function SharePage() {
  const params = useParams()
  const id = params.id as string

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [comments, setComments] = useState<CommentItem[]>([])
  const [notFound, setNotFound] = useState(false)

  useEffect(() => { loadProject() }, [id])

  async function loadProject() {
    const { data, error } = await supabase.from('projects').select('*').eq('id', id).single()
    if (error || !data) { setNotFound(true); return }
    setProject(data)
  }

  useEffect(() => {
    if (!project) return
    renderCanvas()
  }, [project])

  async function renderCanvas() {
    const { Canvas, FabricImage, Rect, Circle, FabricText, Group } = await import('fabric')
    if (!canvasRef.current) return
    const canvas = new Canvas(canvasRef.current, { selection: false })

    const img = await FabricImage.fromURL(project!.image_url, { crossOrigin: 'anonymous' })

    const maxW = window.innerWidth - 360
    const scale = maxW < img.width! ? maxW / img.width! : 1
    canvas.setDimensions({ width: img.width! * scale, height: img.height! * scale })
    img.set({ left: 0, top: 0, originX: 'left', originY: 'top', scaleX: scale, scaleY: scale })
    canvas.backgroundImage = img
    canvas.renderAll()

    if (project!.canvas_json) {
      try {
        const saved = JSON.parse(project!.canvas_json)
        if (saved.comments && Array.isArray(saved.comments)) {
          setComments(saved.comments)
          const BADGE_R = 11
          for (const c of saved.comments as CommentItem[]) {
            const { left, top, width, height } = c.rect

            const commentRect = new Rect({
              left, top, width, height,
              fill: `${c.color}18`,
              stroke: c.color,
              strokeWidth: 2,
              selectable: false,
              evented: false,
            })
            const badgeCircle = new Circle({
              radius: BADGE_R,
              fill: c.color,
              originX: 'center',
              originY: 'center',
            })
            const badgeLabel = new FabricText(String(c.number), {
              fontSize: 12,
              fontWeight: 'bold',
              fill: '#ffffff',
              fontFamily: 'Arial',
              originX: 'center',
              originY: 'center',
            })
            const badge = new Group([badgeCircle, badgeLabel], {
              left: left - BADGE_R,
              top: top - BADGE_R,
              selectable: false,
              evented: false,
            })
            canvas.add(commentRect, badge)
          }
          canvas.renderAll()
        }
      } catch {}
    }
  }

  if (notFound) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        <div className="text-center">
          <p className="text-xl">ページが見つかりません</p>
          <p className="text-sm mt-2">URLが間違っているか、削除された可能性があります</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">LP フィードバック</p>
            <p className="font-semibold text-gray-800">{project?.name ?? '読み込み中...'}</p>
          </div>
          <p className="text-xs text-gray-400">
            {project ? new Date(project.created_at).toLocaleDateString('ja-JP') : ''}
          </p>
        </div>
      </div>

      {/* メインエリア */}
      <div className="flex flex-1 overflow-hidden">
        {/* キャンバス */}
        <div className="flex-1 overflow-auto p-6">
          <div className="inline-block">
            <canvas ref={canvasRef} className="shadow-xl rounded-lg" />
          </div>
        </div>

        {/* サイドバー */}
        <div className="w-72 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">修正コメント</p>
            <p className="text-xs text-gray-400 mt-0.5">{comments.length}件</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {comments.length === 0 && (
              <div className="p-4 text-center text-gray-400 text-sm mt-8">
                コメントがありません
              </div>
            )}
            {comments.map((c) => (
              <div key={c.id} className="px-4 py-3 border-b border-gray-50 flex gap-3 items-start">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: c.color }}
                >
                  {c.number}
                </div>
                <p className="text-sm text-gray-700 flex-1 leading-relaxed">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
