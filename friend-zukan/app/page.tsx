'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type User = {
  id: string
  name: string
  mbti: string
}

export default function Home() {
  const [name, setName] = useState('')
  const [mbti, setMbti] = useState('')
  const [users, setUsers] = useState<User[]>([])

  // データ取得
  const fetchUsers = async () => {
    const { data, error } = await supabase.from('users').select('*')

    if (!error && data) {
      setUsers(data)
    }
  }

  // 初回読み込み
  useEffect(() => {
    fetchUsers()
  }, [])

  // 登録
  const handleSubmit = async () => {
    const { error } = await supabase.from('users').insert([
      { name, mbti }
    ])

    if (error) {
      alert('エラー: ' + error.message)
    } else {
      setName('')
      setMbti('')
      fetchUsers() // 更新
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">友達図鑑</h1>

      {/* 登録フォーム */}
      <div className="mb-6">
        <input
          className="border p-2 mb-2 w-full"
          placeholder="名前"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          className="border p-2 mb-2 w-full"
          placeholder="MBTI"
          value={mbti}
          onChange={(e) => setMbti(e.target.value)}
        />

        <button
          className="bg-black text-white px-4 py-2"
          onClick={handleSubmit}
        >
          登録
        </button>
      </div>

      {/* 一覧表示 */}
      <div className="grid grid-cols-2 gap-4">
        {users.map((user) => (
          <div key={user.id} className="border p-3 rounded">
            <p className="font-bold">{user.name}</p>
            <p className="text-sm text-gray-500">{user.mbti}</p>
          </div>
        ))}
      </div>
    </div>
  )
}