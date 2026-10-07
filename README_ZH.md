# usage-inspector

[English](README.md) | 繁體中文

Claude Code 外掛：在輸入框上方常駐一行用量列，不用執行 `/context` 或 `/usage` 就能看到 context 佔用、成本、每個 prompt 增加的 tokens，以及 5 小時／7 天額度的消耗速度。支援終端機、桌面版與 VS Code。

## 功能

**用量列**

- **Context**：已用百分比、`tokens / window`、累計費用。佔用未滿 60% 為綠色，60–84% 為黃色，85% 以上為紅色。
- **Turns**：最近 8 個 prompt 各增加的 tokens，最新一根以藍色標示並顯示 `+12k`。回覆進行中會即時增長。
- **5h / 7d**：額度已用百分比與時間進度標記並排，附剩餘時間與重置時刻。用量超前時間進度時，兩者之間以斜線標出：差距 15 個百分點以內為黃色，超過或已用 90% 以上為紅色。

**Context 面板**

點用量列右側的 `ⓘ`，或執行 `/context-detail`，開啟面板查看：

- 模型、auto-compact 門檻與剩餘空間、cache 命中率
- 各分類的 token 用量
- 用量最高的 5 個 MCP server 與 memory 檔
- Skills、Agents、Slash commands 的用量

面板開著時，每輪對話結束後自動更新。

Turns 歷史存在外掛 store，重開 session 會恢復最近 8 筆。

## 安裝

```
/plugin marketplace add <repo>
/plugin install usage-inspector@usage-inspector
```

`<repo>` 換成這個 repo 的 GitHub 路徑或本機路徑。

## 專案結構

```
.claude-plugin/
  plugin.json        外掛資訊
  marketplace.json   marketplace 設定
hooks/
  hooks.json         註冊 register.tsx
  register.tsx       用量列、面板與 /context-detail 指令
  register.test.tsx  用量列與面板的渲染測試
types/index.d.ts     外掛 state 型別
promo/               15 秒宣傳動畫（Canvas，無相依套件）
```
