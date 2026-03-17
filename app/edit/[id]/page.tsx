'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase, type Project } from '@/lib/supabase'

type Color = '#ef4444' | '#3b82f6' | '#eab308' | '#1f2937'

export type CommentItem = {
  id: string
  number: number
  text: string
  color: Color
  rect: { left: number; top: number; width: number; height: number }
}

export default function EditPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<any>(null)
  const activeColorRef = useRef<Color>('#ef4444')
  const commentsRef = useRef<CommentItem[]>([])

  const [project, setProject] = useState<Project | null>(null)
  const [activeColor, setActiveColor] = useState<Color>('#ef4444')
  const [comments, setComments] = useState<CommentItem[]>([])
  const [pendingRect, setPendingRect] = useState<CommentItem['rect'] | null>(null)
  const [commentInput, setCommentInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { activeColorRef.current = activeColor }, [activeColor])
  useEffect(() => { commentsRef.current = comments }, [comments])

  useEffect(() => { loadProject() }, [id])

  async function loadProject() {
    const { data } = await supabase.from('projects').select('*').eq('id', id).single()
    if (data) setProject(data)
  }

  useEffect(() => {
    if (!project) return
    if (fabricRef.current) {
      fabricRef.current.dispose()
      fabricRef.current = null
    }
    initCanvas()
    return () => {
      if (fabricRef.current) {
        fabricRef.current.dispose()
        fabricRef.current = null
      }
    }
  }, [project])

  async function initCanvas() {
    const { Canvas, FabricImage } = await import('fabric')
    if (!canvasRef.current || fabricRef.current) return

    const canvas = new Canvas(canvasRef.current, {
      selection: false,
      defaultCursor: 'crosshair',
    })
    fabricRef.current = canvas

    const img = await FabricImage.fromURL(project!.image_url, { crossOrigin: 'anonymous' })
    if (!fabricRef.current || fabricRef.current !== canvas) return

    const maxW = window.innerWidth - 360
    const scale = maxW < img.width! ? maxW / img.width! : 1
    canvas.setDimensions({ width: img.width! * scale, height: img.height! * scale })
    img.set({ left: 0, top: 0, originX: 'left', originY: 'top', scaleX: scale, scaleY: scale })
    canvas.backgroundImage = img
    canvas.renderAll()

    // 保存済みデータの復元
    if (project!.canvas_json) {
      try {
        const saved = JSON.parse(project!.canvas_json)
        if (saved.comments && Array.isArray(saved.comments)) {
          setComments(saved.comments)
          for (const c of saved.comments) {
            await drawCommentOnCanvas(canvas, c)
          }
          canvas.renderAll()
        }
      } catch {}
    }

    // ドラッグ描画イベント
    let isDrawing = false
    let startX = 0, startY = 0
    let tempRect: any = null

    canvas.on('mouse:down', async (e: any) => {
      const pointer = e.viewportPoint ?? e.absolutePointer ?? e.pointer
      if (!pointer) return
      isDrawing = true
      startX = pointer.x
      startY = pointer.y
      const { Rect } = await import('fabric')
      tempRect = new Rect({
        left: startX,
        top: startY,
        width: 0,
        height: 0,
        originX: 'left',
        originY: 'top',
        fill: 'transparent',
        stroke: activeColorRef.current,
        strokeWidth: 2,
        strokeDashArray: [6, 3],
        selectable: false,
        evented: false,
      })
      canvas.add(tempRect)
    })

    canvas.on('mouse:move', (e: any) => {
      if (!isDrawing || !tempRect) return
      const pointer = e.viewportPoint ?? e.absolutePointer ?? e.pointer
      if (!pointer) return
      const w = pointer.x - startX
      const h = pointer.y - startY
      tempRect.set({
        left: w < 0 ? pointer.x : startX,
        top: h < 0 ? pointer.y : startY,
        width: Math.abs(w),
        height: Math.abs(h),
      })
      tempRect.setCoords()
      canvas.renderAll()
    })

    canvas.on('mouse:up', (e: any) => {
      if (!isDrawing) return
      isDrawing = false
      if (!tempRect) return
      const { left, top, width, height } = tempRect
      canvas.remove(tempRect)
      tempRect = null
      canvas.renderAll()
      if (width < 10 || height < 10) return
      setPendingRect({ left, top, width, height })
    })
  }

  async function drawCommentOnCanvas(canvas: any, c: CommentItem) {
    const { Rect, Circle, FabricText, Group } = await import('fabric')
    const { left, top, width, height } = c.rect
    const BADGE_R = 11

    const commentRect = new Rect({
      left,
      top,
      width,
      height,
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
      data: { commentId: c.id },
    })

    canvas.add(commentRect, badge)
  }

  async function confirmComment() {
    if (!commentInput.trim() || !pendingRect) return
    const canvas = fabricRef.current
    if (!canvas) return

    const commentId = crypto.randomUUID()
    const nextNumber = commentsRef.current.length + 1

    const newComment: CommentItem = {
      id: commentId,
      number: nextNumber,
      text: commentInput.trim(),
      color: activeColorRef.current,
      rect: pendingRect,
    }

    await drawCommentOnCanvas(canvas, newComment)
    canvas.renderAll()

    setComments(prev => [...prev, newComment])
    setPendingRect(null)
    setCommentInput('')
  }

  function deleteComment(commentId: string) {
    const canvas = fabricRef.current
    if (!canvas) return
    const toRemove = canvas.getObjects().filter((obj: any) => obj.data?.commentId === commentId)
    toRemove.forEach((obj: any) => canvas.remove(obj))
    canvas.renderAll()
    setComments(prev => prev.filter(c => c.id !== commentId))
  }

  async function save() {
    if (!project) return
    setSaving(true)
    const data = { comments: commentsRef.current }
    const { error } = await supabase
      .from('projects')
      .update({ canvas_json: JSON.stringify(data) })
      .eq('id', id)
    setSaving(false)
    if (!error) setShareUrl(`${window.location.origin}/share/${id}`)
  }

  async function copyUrl() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const colors: Color[] = ['#ef4444', '#3b82f6', '#eab308', '#1f2937']

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-4">
        <button onClick={() => router.push('/')} className="text-gray-400 hover:text-gray-600 text-sm">
          ← 一覧
        </button>
        <span className="font-semibold text-gray-800 text-sm truncate max-w-sm">
          {project?.name}
        </span>
        <div className="flex-1" />
        <div className="flex gap-1">
          {colors.map((c) => (
            <button
              key={c}
              onClick={() => setActiveColor(c)}
              className={`w-7 h-7 rounded-full border-2 transition ${
                activeColor === c ? 'border-gray-800 scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="text-sm px-4 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存してURL発行'}
        </button>
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
            <p className="text-sm font-semibold text-gray-700">コメント一覧</p>
            <p className="text-xs text-gray-400 mt-0.5">範囲をドラッグして囲んでください</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {comments.length === 0 && (
              <div className="p-4 text-center text-gray-400 text-sm mt-8">
                まだコメントがありません
              </div>
            )}
            {comments.map((c) => (
              <div key={c.id} className="px-4 py-3 border-b border-gray-50 flex gap-3 items-start group">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: c.color }}
                >
                  {c.number}
                </div>
                <p className="text-sm text-gray-700 flex-1 leading-relaxed">{c.text}</p>
                <button
                  onClick={() => deleteComment(c.id)}
                  className="text-gray-300 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {shareUrl && (
            <div className="p-3 border-t border-gray-200 bg-green-50">
              <p className="text-xs text-green-700 font-medium mb-2">共有URL発行済み</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 text-xs bg-white border border-green-200 rounded px-2 py-1 text-green-800 font-mono truncate"
                />
                <button
                  onClick={copyUrl}
                  className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 whitespace-nowrap"
                >
                  {copied ? '✓' : 'コピー'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* コメント入力モーダル */}
      {pendingRect && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => { setPendingRect(null); setCommentInput('') }}
        >
          <div className="bg-white rounded-xl shadow-2xl p-6 w-96" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-gray-800 mb-3">コメントを入力</p>
            <textarea
              autoFocus
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmComment() }
                if (e.key === 'Escape') { setPendingRect(null); setCommentInput('') }
              }}
              placeholder="修正指示を入力..."
              className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none outline-none focus:border-blue-400"
              rows={4}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => { setPendingRect(null); setCommentInput('') }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={confirmComment}
                disabled={!commentInput.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
              >
                追加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
