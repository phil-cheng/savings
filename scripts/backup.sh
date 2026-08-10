#!/usr/bin/env bash
# 将 data/data.json 提交并推送到远程，用作账目定期备份
# 用法：npm run backup   或   ./scripts/backup.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DATA="data/data.json"
REMOTE="${BACKUP_REMOTE:-origin}"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
dim() { printf '\033[90m%s\033[0m\n' "$*"; }

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  red "错误：当前目录不是 git 仓库"
  exit 1
fi

if [[ ! -f "$DATA" ]]; then
  red "错误：找不到 $DATA（先启动一次服务生成数据文件）"
  exit 1
fi

if [[ -z "$BRANCH" || "$BRANCH" == "HEAD" ]]; then
  red "错误：当前处于 detached HEAD，请先切换到 main 等分支"
  exit 1
fi

# 只备份账目文件，避免把未完成的代码改动一并提交
git add -- "$DATA"

if git diff --cached --quiet -- "$DATA"; then
  # 数据相对上次提交无变化：若本地仍有未推送 commit，顺便推上去
  LOCAL="$(git rev-parse @)"
  REMOTE_REF="$(git rev-parse -q --verify "@{u}" 2>/dev/null || true)"
  if [[ -n "$REMOTE_REF" ]] && [[ "$LOCAL" != "$REMOTE_REF" ]]; then
    AHEAD="$(git rev-list --count "@{u}..@" 2>/dev/null || echo 0)"
    if [[ "${AHEAD:-0}" -gt 0 ]]; then
      dim "data.json 无新改动，但本地有 ${AHEAD} 个未推送提交，正在 push…"
      git push "$REMOTE" "HEAD:${BRANCH}"
      green "已推送未同步的提交 → ${REMOTE}/${BRANCH}"
      exit 0
    fi
  fi
  green "无需备份：data.json 与远程进度一致，没有新改动"
  exit 0
fi

# 生成可读时间戳（上海时区）
STAMP="$(TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M')"
MSG="backup: 储蓄数据 ${STAMP}"

git commit -m "$MSG"
dim "已提交：$MSG"

# 首次可能没有 upstream
if git rev-parse -q --verify "@{u}" >/dev/null 2>&1; then
  git push
else
  dim "未设置上游分支，执行：git push -u ${REMOTE} ${BRANCH}"
  git push -u "$REMOTE" "HEAD:${BRANCH}"
fi

green "备份完成 → ${REMOTE}/${BRANCH}"
green "提交：$(git rev-parse --short HEAD)  $MSG"
