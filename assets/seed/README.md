# 种子缓存（仓库里是空壳，正式安装包带填充版）

仓库里这一份 `cache-v1.json` 只有 38 字节空壳，**不带任何第三方片库数据**（版权/合规）。

但**发给用户的安装包要带**，这样装完第一次打开片库就有内容，不用等一轮联网抓取。

## 出正式包的标准流程

```bash
# 1) 用你自己的接口列表生成填充版（会写到 assets/seed/cache-v1.json）
node tools/gen-seed-cache.mjs --apis-file tmp/apis.json
#    输出形如：wrote assets/seed/cache-v1.json 46.56 MB | apis ok: 15 | keys: 296

# 2) 确认 git 不会被这个 46MB 的文件污染
git status --short          # 应当只剩 tools/gen-seed-cache.mjs 之类的代码改动

# 3) 构建 + 装机验证
cd android && ./gradlew :app:assembleRelease -PuniversalApk
```

`assets/seed/cache-v1.json` 在本机已被设为 **skip-worktree**：

```bash
git update-index --skip-worktree assets/seed/cache-v1.json   # 本机改动 git 装作没看见
git ls-files -v assets/seed/cache-v1.json                    # 显示 S 开头即生效
```

所以填充版**只存在于你的工作目录**，`git add -A` / `git commit` 都不会把它带进仓库。
需要改这份 JSON 本身（比如想换个空壳内容）时，先解除：

```bash
git update-index --no-skip-worktree assets/seed/cache-v1.json
```

## 体积参考

| 组成 | 大小 |
|---|---|
| 空壳（仓库版） | 38 B → 安装包 ≈ 220 MB |
| 填充版（本机） | 约 46 MB → 安装包 ≈ 258 MB |

填充版的耗时：本机 19 个接口约 4~5 分钟（每个请求 8 秒硬超时，坏源直接跳过）。
