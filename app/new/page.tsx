'use client'

export const dynamic = 'force-dynamic'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'

export default function NewProject() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
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

  async function handleSubmit() {
    if (!name.trim()) { setError('案件名を入力してください'); return }
    if (!file) { setError('画像を選択してください'); return }

    setUploading(true)
    setError(null)

    const ext = file.name.split('.').pop()
    const fileName = `${uuidv4()}.${ext}`

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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">スクリーンショット画像</label>
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

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={uploading}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? 'アップロード中...' : '書き込み画面へ進む →'}
        </button>
      </div>
    </div>
  )
}
