import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  const accessKey = process.env.APIFLASH_KEY
  if (!accessKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 })

  const apiUrl = `https://api.apiflash.com/v1/urltoimage?access_key=${accessKey}&url=${encodeURIComponent(url)}&format=png&full_page=true&width=1280&wait_until=network_idle&delay=2`

  const res = await fetch(apiUrl, { cache: 'no-store' })
  if (!res.ok) {
    return NextResponse.json({ error: 'スクリーンショットの取得に失敗しました' }, { status: 500 })
  }
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('image')) {
    return NextResponse.json({ error: 'ページのスクリーンショット取得に失敗しました（ページが存在しないか、アクセスが拒否されました）' }, { status: 500 })
  }

  const buffer = await res.arrayBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
    },
  })
}
