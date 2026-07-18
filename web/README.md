# Web Prototype

`web/index.html` をブラウザで開くと、月喰みの漂流島の試作を遊べます。

## できること

- 4人/5人の正体と役職をランダム配布
- 全員が同じ海岸からスタート
- 24枚の六角島マップ表示
- 61枚の広域島マップ表示
- 1ターン1マス移動
- パネル別アクション
- 夜の視界不良、濃霧、嵐、道迷い
- 橋、船修理、救難信号、脱出ルート、危険の管理
- 疑惑と孤立の管理
- 盤面コードのコピー/読み込み
- Firebase Realtime Databaseによる部屋同期

## まだ簡略化していること

- 物資は個人手札ではなく共有在庫
- 月喰みの妨害は一部手動で反映
- Firebase設定ファイルは各自で作成

## Firebase無料枠で使う

1. FirebaseでWebアプリを作る
2. Realtime Databaseを作る
3. `web/firebase-config.example.js` を `web/firebase-config.js` にコピーする
4. FirebaseのWeb設定値を貼り付ける
5. Realtime Database Rulesをテスト用に設定する

テスト用ルール:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

公開テストが終わったら、認証付きルールに変えてください。

## 次に足す候補

- 個人の物資手札
- 未踏パネルの裏向き探索
- 夜フェイズの秘密入力
