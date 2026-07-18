# Firebase無料枠セットアップ

## 目的

GitHub Pagesで公開しているWeb版に、Firebase Realtime Databaseの無料枠で部屋同期を追加します。

## Firebase Consoleで行うこと

1. Firebase Consoleでプロジェクトを作成
2. Webアプリを追加
3. 表示される `firebaseConfig` をコピー
4. Realtime Databaseを作成
5. Database Rulesをテスト用に設定

テスト用Rules:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true,
        ".validate": "newData.hasChildren(['state', 'updatedAt']) || !newData.exists()"
      }
    }
  }
}
```

## Web版で行うこと

1. 公開ページを開く
2. ゲーム開始後、共有タブを開く
3. `firebaseConfig` を貼り付ける
4. Firebase設定を保存
5. 部屋IDを入力
6. 部屋を作る、または部屋に参加

## 注意

このRulesはテストプレイ用です。誰でも指定した部屋IDの状態を読み書きできます。公開範囲が広がったら、Firebase Authenticationを入れて部屋参加者だけ書き込めるRulesに変更してください。
