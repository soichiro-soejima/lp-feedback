'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase, type Project } from '@/lib/supabase'

type Color = '#ef4444' | '#3b82f6' | '#eab308'

export type Attachment = {
  name: string
  url: string
  mimeType: string
  path: string
}

export type CommentItem = {
  id: string
  number: number
  text: string
  color: Color
  rect: { left: number; top: number; width: number; height: number }
  attachments?: Attachment[]
}

type EditingComment = {
  id: string
  text: string
  attachments: Attachment[]
  newFiles: File[]
  deletedPaths: string[]
}

export default function EditPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<any>(null)
  const activeColorRef = useRef<Color>('#ef4444')
  const commentsRef = useRef<CommentItem[]>([])
  const originalSavedCommentsRef = useRef<CommentItem[]>([])

  const [project, setProject] = useState<Project | null>(null)
  const [activeColor, setActiveColor] = useState<Color>('#ef4444')
  const [comments, setComments] = useState<CommentItem[]>([])
  const [pendingRect, setPendingRect] = useState<CommentItem['rect'] | null>(null)
  const [commentInput, setCommentInput] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editingComment, setEditingComment] = useState<EditingComment | null>(null)
  const [isLegacyData, setIsLegacyData] = useState(false)
  const [showCorrection, setShowCorrection] = useState(false)
  const [customScreenWidth, setCustomScreenWidth] = useState('')

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

    if (project!.canvas_json) {
      try {
        const saved = JSON.parse(project!.canvas_json)
        if (saved.comments && Array.isArray(saved.comments)) {
          originalSavedCommentsRef.current = saved.comments
          const editCanvasWidth = saved.canvasWidth as number | undefined
          if (!editCanvasWidth) {
            setIsLegacyData(true)
            const renumbered = saved.comments.map((c: CommentItem, i: number) => ({ ...c, number: i + 1 }))
            setComments(renumbered)
            for (const c of renumbered) {
              await drawCommentOnCanvas(canvas, c)
            }
          } else {
            const ratio = Math.abs(editCanvasWidth - canvas.width) > 1
              ? canvas.width / editCanvasWidth
              : 1
            const scaled: CommentItem[] = ratio !== 1
              ? saved.comments.map((c: CommentItem) => ({
                  ...c,
                  rect: {
                    left: c.rect.left * ratio,
                    top: c.rect.top * ratio,
                    width: c.rect.width * ratio,
                    height: c.rect.height * ratio,
                  },
                }))
              : saved.comments
            const displayComments = scaled.map((c: CommentItem, i: number) => ({ ...c, number: i + 1 }))
            setComments(displayComments)
            for (const c of displayComments) {
              await drawCommentOnCanvas(canvas, c)
            }
          }
          canvas.renderAll()
        }
      } catch {}
    }

    let isDrawing = false
    let startX = 0, startY = 0
    let endX = 0, endY = 0
    let tempRect: any = null

    canvas.on('mouse:down', async (e: any) => {
      const pointer = e.absolutePointer ?? e.viewportPoint ?? e.pointer
      if (!pointer) return
      isDrawing = true
      startX = pointer.x
      startY = pointer.y
      endX = pointer.x
      endY = pointer.y
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
      const pointer = e.absolutePointer ?? e.viewportPoint ?? e.pointer
      if (!pointer) return
      endX = pointer.x
      endY = pointer.y
      const w = endX - startX
      const h = endY - startY
      tempRect.set({
        left: w < 0 ? endX : startX,
        top: h < 0 ? endY : startY,
        width: Math.abs(w),
        height: Math.abs(h),
      })
      tempRect.setCoords()
      canvas.renderAll()
    })

    canvas.on('mouse:up', () => {
      if (!isDrawing) return
      isDrawing = false
      if (!tempRect) return
      canvas.remove(tempRect)
      tempRect = null
      canvas.renderAll()
      const left = Math.min(startX, endX)
      const top = Math.min(startY, endY)
      const width = Math.abs(endX - startX)
      const height = Math.abs(endY - startY)
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
      originX: 'left',
      originY: 'top',
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
      left: left + BADGE_R,
      top: top + BADGE_R,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    })

    canvas.add(commentRect, badge)
  }

  async function uploadFiles(files: File[], commentId: string): Promise<Attachment[]> {
    const results: Attachment[] = []
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `attachments/${id}/${commentId}/${Date.now()}_${safeName}`
      const { error } = await supabase.storage.from('feedback-images').upload(path, file)
      if (error) continue
      const { data } = supabase.storage.from('feedback-images').getPublicUrl(path)
      results.push({ name: file.name, url: data.publicUrl, mimeType: file.type, path })
    }
    return results
  }

  async function confirmComment() {
    if (!commentInput.trim() && pendingFiles.length === 0) return
    if (!pendingRect) return
    const canvas = fabricRef.current
    if (!canvas) return

    setUploading(true)
    const commentId = crypto.randomUUID()
    const nextNumber = commentsRef.current.length === 0
      ? 1
      : Math.max(...commentsRef.current.map(c => c.number)) + 1

    const uploaded = await uploadFiles(pendingFiles, commentId)

    const newComment: CommentItem = {
      id: commentId,
      number: nextNumber,
      text: commentInput.trim(),
      color: activeColorRef.current,
      rect: pendingRect,
      attachments: uploaded.length > 0 ? uploaded : undefined,
    }

    await drawCommentOnCanvas(canvas, newComment)
    canvas.renderAll()

    setComments(prev => [...prev, newComment])
    setPendingRect(null)
    setCommentInput('')
    setPendingFiles([])
    setUploading(false)
  }

  async function updateComment(data: EditingComment) {
    setUploading(true)

    for (const path of data.deletedPaths) {
      await supabase.storage.from('feedback-images').remove([path])
    }

    const newlyUploaded = await uploadFiles(data.newFiles, data.id)
    const updatedAttachments = [...data.attachments, ...newlyUploaded]

    const updated = commentsRef.current.map(c =>
      c.id === data.id
        ? { ...c, text: data.text, attachments: updatedAttachments.length > 0 ? updatedAttachments : undefined }
        : c
    )
    setComments(updated)
    setEditingComment(null)
    setUploading(false)
  }

  async function applyLegacyCorrection(originalScreenWidth: number) {
    const canvas = fabricRef.current
    if (!canvas) return
    const source = originalSavedCommentsRef.current.length > 0
      ? originalSavedCommentsRef.current
      : commentsRef.current
    if (source.length === 0) return
    const ratio = canvas.width / (originalScreenWidth - 360)
    const corrected: CommentItem[] = source.map((c: CommentItem) => ({
      ...c,
      rect: {
        left: c.rect.left * ratio,
        top: c.rect.top * ratio,
        width: c.rect.width * ratio,
        height: c.rect.height * ratio,
      },
    }))
    canvas.remove(...canvas.getObjects())
    setComments(corrected)
    commentsRef.current = corrected
    for (const c of corrected) {
      await drawCommentOnCanvas(canvas, c)
    }
    canvas.renderAll()
  }

  async function deleteComment(commentId: string) {
    const canvas = fabricRef.current
    if (!canvas) return

    const target = commentsRef.current.find(c => c.id === commentId)
    if (target?.attachments && target.attachments.length > 0) {
      await supabase.storage.from('feedback-images').remove(target.attachments.map(a => a.path))
    }

    const renumbered = commentsRef.current
      .filter(c => c.id !== commentId)
      .map((c, i) => ({ ...c, number: i + 1 }))
    canvas.remove(...canvas.getObjects())
    for (const c of renumbered) {
      await drawCommentOnCanvas(canvas, c)
    }
    canvas.renderAll()
    setComments(renumbered)
  }

  async function save() {
    if (!project) return
    setSaving(true)
    const data = {
      comments: commentsRef.current,
      canvasWidth: fabricRef.current?.width ?? null,
    }
    await supabase
      .from('projects')
      .update({ canvas_json: JSON.stringify(data) })
      .eq('id', id)
    setSaving(false)
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(`${window.location.origin}/share/${id}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const colors: Color[] = ['#ef4444', '#3b82f6', '#eab308']

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
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${id}`}
            className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-gray-600 font-mono w-64 truncate"
          />
          <button
            onClick={copyUrl}
            className="text-xs px-2 py-1.5 bg-gray-600 text-white rounded hover:bg-gray-700 whitespace-nowrap"
          >
            {copied ? '✓ コピー済み' : 'コピー'}
          </button>
        </div>
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
        {/* サイドバー */}
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">コメント一覧</p>
                <p className="text-xs text-gray-400 mt-0.5">範囲をドラッグして囲んでください</p>
              </div>
              {isLegacyData && !showCorrection && (
                <span className="text-xs text-amber-600 font-medium animate-pulse">⚠ ズレあり?</span>
              )}
            </div>
            <button
              onClick={() => setShowCorrection(v => !v)}
              className="mt-2 text-xs text-gray-400 hover:text-gray-600 underline"
            >
              {showCorrection ? '▲ 位置補正を閉じる' : '▼ 位置ずれを補正する'}
            </button>
          </div>
          {showCorrection && (
            <div className="px-3 py-2 bg-amber-50 border-b border-amber-200">
              <p className="text-xs text-amber-700 mb-2">作成時の画面幅を選択して補正してください</p>
              <div className="flex flex-wrap gap-1 mb-1">
                {[1920, 1440, 1366, 1280].map(w => (
                  <button
                    key={w}
                    onClick={() => applyLegacyCorrection(w)}
                    className="text-xs px-2 py-1 bg-white border border-amber-300 rounded hover:bg-amber-100 transition"
                  >
                    {w}px
                  </button>
                ))}
              </div>
              <div className="flex gap-1 mt-1">
                <input
                  type="number"
                  value={customScreenWidth}
                  onChange={e => setCustomScreenWidth(e.target.value)}
                  placeholder="カスタム幅"
                  className="text-xs w-24 px-2 py-1 border border-amber-300 rounded outline-none"
                />
                <button
                  onClick={() => customScreenWidth && applyLegacyCorrection(Number(customScreenWidth))}
                  className="text-xs px-2 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 transition"
                >
                  適用
                </button>
              </div>
              <p className="text-xs text-amber-500 mt-1">位置が合ったら「保存してURL発行」で確定</p>
            </div>
          )}
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
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm text-gray-700 leading-relaxed cursor-pointer hover:text-blue-600"
                    onClick={() => setEditingComment({
                      id: c.id,
                      text: c.text,
                      attachments: c.attachments ?? [],
                      newFiles: [],
                      deletedPaths: [],
                    })}
                  >{c.text}</p>
                  {c.attachments && c.attachments.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">📎 {c.attachments.length}件</p>
                  )}
                </div>
                <button
                  onClick={() => deleteComment(c.id)}
                  className="text-gray-300 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

        </div>

        {/* キャンバス */}
        <div className="flex-1 overflow-auto p-6">
          <div className="inline-block">
            <canvas ref={canvasRef} className="shadow-xl rounded-lg" />
          </div>
        </div>
      </div>

      {/* コメント入力モーダル */}
      {pendingRect && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => { setPendingRect(null); setCommentInput(''); setPendingFiles([]) }}
        >
          <div className="bg-white rounded-xl shadow-2xl p-6 w-96" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-gray-800 mb-3">コメントを入力</p>
            <textarea
              autoFocus
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); confirmComment() }
                if (e.key === 'Escape') { setPendingRect(null); setCommentInput(''); setPendingFiles([]) }
              }}
              placeholder="修正指示を入力..."
              className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none outline-none focus:border-blue-400"
              rows={4}
            />
            {/* ファイル添付 */}
            <div className="mt-3">
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer hover:text-gray-700 select-none">
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) setPendingFiles(prev => [...prev, ...Array.from(e.target.files!)])
                    e.target.value = ''
                  }}
                />
                <span>📎</span>
                <span>ファイルを添付（画像・PDF）</span>
              </label>
              {pendingFiles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {pendingFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-1 text-xs bg-gray-100 rounded px-2 py-1 max-w-full">
                      <span className="truncate max-w-[140px]">{f.name}</span>
                      <button
                        onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                        className="text-gray-400 hover:text-red-400 flex-shrink-0"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setPendingRect(null); setCommentInput(''); setPendingFiles([]) }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={confirmComment}
                disabled={(!commentInput.trim() && pendingFiles.length === 0) || uploading}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
              >
                {uploading ? 'アップロード中...' : '追加（Ctrl+Enter）'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* コメント編集モーダル */}
      {editingComment && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setEditingComment(null)}
        >
          <div className="bg-white rounded-xl shadow-2xl p-6 w-96" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-gray-800 mb-3">コメントを編集</p>
            <textarea
              autoFocus
              value={editingComment.text}
              onChange={(e) => setEditingComment({ ...editingComment, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); updateComment(editingComment) }
                if (e.key === 'Escape') { setEditingComment(null) }
              }}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none outline-none focus:border-blue-400"
              rows={4}
            />

            {/* 既存の添付ファイル */}
            {editingComment.attachments.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-gray-500 mb-1.5">添付ファイル</p>
                <div className="flex flex-wrap gap-1.5">
                  {editingComment.attachments.map((a, i) => (
                    <div key={i} className="relative group/att">
                      {a.mimeType.startsWith('image/') ? (
                        <img
                          src={a.url}
                          alt={a.name}
                          className="w-14 h-14 object-cover rounded border border-gray-200"
                        />
                      ) : (
                        <div className="flex items-center gap-1 text-xs bg-gray-100 rounded px-2 py-1.5">
                          <span>📄</span>
                          <span className="truncate max-w-[100px]">{a.name}</span>
                        </div>
                      )}
                      <button
                        onClick={() => setEditingComment({
                          ...editingComment,
                          attachments: editingComment.attachments.filter((_, j) => j !== i),
                          deletedPaths: [...editingComment.deletedPaths, a.path],
                        })}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-xs items-center justify-center hidden group-hover/att:flex leading-none"
                      >✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 新規ファイル追加 */}
            <div className="mt-3">
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer hover:text-gray-700 select-none">
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) setEditingComment({
                      ...editingComment,
                      newFiles: [...editingComment.newFiles, ...Array.from(e.target.files!)],
                    })
                    e.target.value = ''
                  }}
                />
                <span>📎</span>
                <span>ファイルを追加（画像・PDF）</span>
              </label>
              {editingComment.newFiles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {editingComment.newFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-1 text-xs bg-blue-50 rounded px-2 py-1">
                      <span className="truncate max-w-[140px]">{f.name}</span>
                      <button
                        onClick={() => setEditingComment({
                          ...editingComment,
                          newFiles: editingComment.newFiles.filter((_, j) => j !== i),
                        })}
                        className="text-gray-400 hover:text-red-400 flex-shrink-0"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setEditingComment(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={() => updateComment(editingComment)}
                disabled={!editingComment.text.trim() || uploading}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
              >
                {uploading ? 'アップロード中...' : '保存（Ctrl+Enter）'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}