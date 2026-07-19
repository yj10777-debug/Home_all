# 次回改善 持ち越し事項（Pending Improvements）

> 最終更新: 2026-07-19
> 次回の改善作業を始めるとき、まずこのファイルを確認すること。

---

## 1.【完了】あすけん取得エラーの修正をデプロイする

- **状態**: **完了**。`Dockerfile` の `chromium-headless-shell` 追加はコミット・push済み（`3747b96` 以降の履歴で確認、2026-07-19 検証）。origin/main との差分なし。
- 以下は当時の記録として残す。
- **症状**: 2026-05-19 以降、あすけんの食事データが取得できない（Strong=Driveは正常）。
- **確定原因**: 本番コンテナに Playwright の headless 用ブラウザ `chrome-headless-shell`（build 1208）が無く、`headless: true` でのブラウザ起動に失敗。
  - SyncLog の実エラー: `browserType.launch: Executable doesn't exist at /root/.cache/ms-playwright/chromium_headless_shell-1208/...`
  - Playwright 1.58 系は headless 起動時にフル Chromium とは別バイナリ `chrome-headless-shell` が必要だが、`npx playwright install chromium` だけでは入らない。
  - 5/18 の登山機能デプロイで再ビルドされた際に顕在化。
- **適用済みの修正**: `Dockerfile`
  ```dockerfile
  # 変更前
  RUN npx playwright install chromium
  # 変更後
  RUN npx playwright install chromium chromium-headless-shell
  ```
- **必要アクション**:
  1. `Dockerfile` をコミット → `git push origin main` → Railway 再ビルド・再デプロイ。
  2. デプロイ後、欠落日（5/19・5/20・5/21〜）は次回の自動同期で補完される（あすけんデータが無い日のみ再取得する実装）。即時なら「今すぐ取得」/ `/api/sync` を手動実行。
  3. 確認: `/api/sync/status` の `errors` が空になり `askenCount` が増えること。

## 1.5【実装済み・2026-07-19】同期停止の検知

- `scripts/asken/session-guard.ts` に本番（APP_BASE_URL）の死活チェックと同期鮮度チェックを追加。
- /api/sync/status に到達できない、または lastSync が24時間以上古い場合にWindows通知。
- 2026-07-04〜07-11 の8日間無音停止と同種の障害を、次回はローカルguard起動時に検知できる。

## 1.6【実装済み・要有効化・2026-07-19】アプリ全体のBasic認証

- **背景**: JWT保護は meals 系APIのみ。`/api/sync`（スクレイピング起動）・`/api/ai/evaluate`（Geminiクォータ消費）・`/api/settings/system-prompt`（書換）・`/api/days` 等の健康データ閲覧は無認証で、本番URLを知られると自由に叩ける状態だった。
- **実装**: `src/proxy.ts`（Next.js 16 Proxy規約）にBasic認証を追加。`BASIC_AUTH_USER` / `BASIC_AUTH_PASS` を**両方設定したときだけ有効**（未設定なら従来どおり）。機械アクセスは `x-cron-secret` ヘッダで免除（session-guard は対応済み）。テスト10件（tests/proxy.test.ts）。
- **必要アクション**: Railway の環境変数に `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` を設定して再デプロイ。以後ブラウザ初回アクセス時に認証ダイアログが出る（スマホでも保存可）。

## 1.7【実装済み・2026-07-19】Drive取得の最適化とバグ修正

- **Strong / Health Auto Export のGoogle Drive取得を差分化**: 従来は同期のたびにフォルダ内の全ファイル（HAEは日次で増加、1000件超想定）をダウンロードしていた。対象期間の最古日−30日より後に更新されたファイルのみ取得するよう変更（1日8回の同期コスト・APIクォータを大幅削減）。
- **HAEの同一日複数ファイルのバグ修正**: 一覧はmodifiedTime降順なのに無条件上書きだったため「最古のファイルが勝つ」状態だった → 先勝ち（最新更新が優先）に修正。全対象日が揃った時点で残りのDLも省略。
- **run.ts のtodayStr TZバグ修正**: UTCサーバーで引数なし実行するとJST朝の時間帯に日付が1〜2日ズレる潜在バグ（現運用は明示的に日付を渡すため未顕在）。JST固定計算に修正し境界値検証済み。
- スクレイパーのエラー経路で診断ファイル保存や二重closeが本来のエラーを握りつぶす問題も修正。

## 2.【任意・再発防止】あすけんセッションの永続化 — 実装設計（2026-07-19）

- **課題**: `secrets/`（`asken-state.json`）が Railway コンテナの揮発FSで毎デプロイ消失 → デプロイのたびに `push-session.ts` での手動Cookie再配置が必要。
- **結論**: **コード変更は不要**。セッションファイルのパスは全コードで `process.cwd()/secrets`（本番では `/app/secrets`）に統一済みのため、Railwayのボリュームをそこにマウントするだけで永続化できる。

### 手順（Railwayダッシュボードのみ・約5分）

1. Railway → 対象サービス → **Settings → Volumes → New Volume**
2. Mount path に `/app/secrets` を指定して作成（サイズは最小でよい。中身はJSONと診断PNGのみ）
3. 再デプロイ（ボリュームマウントの反映）
4. ローカルから一度だけセッションを送る: `npx tsx scripts/asken/push-session.ts`
5. **検証**: もう一度手動で再デプロイし、`/api/sync/status` の errors にセッション系エラーが出ない（= 再pushなしで生き残っている）ことを確認

### 設計上の確認事項（調査済み）

- Dockerfile の `RUN mkdir -p /app/secrets` はマウントに上書きされるだけで無害。イメージには secrets を含めていないため、マウントで隠れて困るファイルもない。
- node:20-slim は root 実行のためボリュームの権限問題は発生しない。
- `asken-day-YYYY-MM-DD.json`（日次キャッシュ）もボリュームに蓄積されるが1日数KBで実害なし。気になる場合は年1回程度手動削除で十分。
- ボリューム作成後も `push-session.ts` / `POST /api/asken/session` の運用はそのまま使える（Cookie失効時の更新手段として）。変わるのは「デプロイでは消えなくなる」ことだけ。

---

## ハウスキーピング（細かい未処理）

- **AI採点リファクタのコミットを push**: 完了（origin/main と差分なし、2026-07-19 確認）。
- **検証用一時ファイルの削除**: `_*.cjs` 系は削除済み。`.tmpbuild` / `.tb_1779319067` / `.tb2_1779355202` は 2026-07-19 時点で残存（自動削除が権限でブロックされたため手動実行が必要）。
  ```powershell
  Remove-Item -Force _final.cjs,_harness.cjs,_sysprompt.cjs,_run.cjs,_realrun.cjs,_realrun2.cjs,_week.cjs,_sp.cjs,_del_test.cjs,_synctest.txt -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force .tmpbuild,.tb_1779319067,.tb2_1779355202 -ErrorAction SilentlyContinue
  ```
- **記録なし日の扱い（実装済みの仕様メモ）**: 食事・筋トレ・登山がいずれも無い日はスコア0・週平均から除外（`isDayRecorded`）。仕様変更したくなったらここを参照。
