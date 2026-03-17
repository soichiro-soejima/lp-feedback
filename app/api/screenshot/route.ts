import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  const accessKey = process.env.APIFLASH_KEY
  if (!accessKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 })

  const apiUrl = `https://api.apiflash.com/v1/urltoimage?access_key=${accessKey}&url=${encodeURIComponent(url)}&format=png&full_page=true&width=1280`

  const res = await fetch(apiUrl)
  if (!res.ok) {
    return NextResponse.json({ error: 'スクリーンショットの取得に失敗しました' }, { status: 500 })
  }

  const buffer = await res.arrayBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
    },
  })
}
