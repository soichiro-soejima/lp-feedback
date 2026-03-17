'use client'

export const dynamic = 'force-dynamic'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'

type Mode = 'upload' | 'url'

export default function NewProject() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('url')
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (!selected) return
    setFile(selected)
    setPreview(URL.createObjectURL(selected))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const dropped = e.dataTransfer.files?.[0]
    if (!dropped) return
    setFile(dropped)
    setPreview(URL.createObjectURL(dropped))
  }

  async function captureUrl() {
    if (!urlInput.trim()) { setError('URLを入力してください'); return }
    setCapturing(true)
    setError(null)
    try {
      const res = await fetch(`/api/screenshot?url=${encodeURIComponent(urlInput.trim())}`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'スクリーンショットの取得に失敗しました')
      }
      const blob = await res.blob()
      const captured = new File([blob], 'screenshot.png', { type: 'image/png' })
      setFile(captured)
      setPreview(URL.createObjectURL(captured))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCapturing(false)
    }
  }

  async function handleSubmit() {
    if (!name.trim()) { setError('案件名を入力してください'); return }
    if (!file) { setError('画像を選択してください'); return }

    setUploading(true)
    setError(null)

    const fileName = `${uuidv4()}.png`

    const { error: uploadError } = await supabase.storage
      .from('feedback-images')
      .upload(fileName, file)

    if (uploadError) {
      setError('画像のアップロードに失敗しました: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('feedback-images')
      .getPublicUrl(fileName)

    const { data: project, error: insertError } = await supabase
      .from('projects')
      .insert({ name: name.trim(), image_url: urlData.publicUrl })
      .select()
      .single()

    if (insertError || !project) {
      setError('保存に失敗しました: ' + insertError?.message)
      setUploading(false)
      return
    }

    router.push(`/edit/${project.id}`)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          ← 戻る
        </button>
        <h1 className="text-xl font-bold text-gray-800">新規フィードバック作成</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">案件名</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：〇〇社 LP修正 2024-03"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* モード切替 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">画像の取得方法</label>
          <div className="flex gap-2">
            <button
              onClick={() => { setMode('url'); setFile(null); setPreview(null) }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                mode === 'url'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              URLからスクショ取得
            </button>
            <button
              onClick={() => { setMode('upload'); setFile(null); setPreview(null) }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                mode === 'upload'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              画像をアップロード
            </button>
          </div>
        </div>

        {/* アップロードモード */}
        {mode === 'upload' && (
          <div>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition"
            >
              {preview ? (
                <img src={preview} alt="プレビュー" className="max-h-60 mx-auto rounded-lg" />
              ) : (
                <>
                  <p className="text-gray-400 text-sm">ここに画像をドラッグ＆ドロップ</p>
                  <p className="text-gray-300 text-xs mt-1">またはクリックしてファイルを選択</p>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>
        )}

        {/* URLモード */}
        {mode === 'url' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') captureUrl() }}
                placeholder="https://example.com"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={captureUrl}
                disabled={capturing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
              >
                {capturing ? '取得中...' : 'スクショ取得'}
              </button>
            </div>
            {capturing && (
              <p className="text-sm text-gray-400 text-center">ページを読み込んでいます（10〜30秒かかる場合があります）</p>
            )}
            {preview && (
              <div className="rounded-xl overflow-hidden border border-gray-200">
                <img src={preview} alt="スクリーンショット" className="max-h-60 w-full object-cover" />
                <p className="text-xs text-gray-400 text-center py-1 bg-gray-50">スクリーンショット取得済み</p>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={uploading || !file}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? 'アップロード中...' : '書き込み画面へ進む →'}
        </button>
      </div>
    </div>
  )
}
