import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LP フィードバックツール',
  description: 'LPの修正指示を画像に書き込んでクライアントと共有するツール',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  )
}
