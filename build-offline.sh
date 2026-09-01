#!/usr/bin/env bash
# ============================================================
# Wiki.js 폐쇄망 배포용 빌드 스크립트
# 사용법: bash build-offline.sh [태그명]
# 결과: wiki-offline-<태그>.tar  (docker load 로 가져올 수 있음)
# ============================================================
set -e

TAG="${1:-latest}"
IMAGE_NAME="wiki-js"
OUTPUT_FILE="wiki-offline-${TAG}.tar"

echo ""
echo "============================================"
echo "  Wiki.js 폐쇄망 배포 빌드"
echo "  이미지: ${IMAGE_NAME}:${TAG}"
echo "  출력: ${OUTPUT_FILE}"
echo "============================================"
echo ""

# Docker 이미지 빌드
echo "[1/2] Docker 이미지 빌드 중..."
docker build \
  -f dev/build/Dockerfile \
  -t "${IMAGE_NAME}:${TAG}" \
  .

echo ""
echo "[2/2] tar 파일로 내보내는 중..."
docker save "${IMAGE_NAME}:${TAG}" -o "${OUTPUT_FILE}"

SIZE=$(du -sh "${OUTPUT_FILE}" | cut -f1)
echo ""
echo "============================================"
echo "  완료!"
echo "  파일: ${OUTPUT_FILE}  (${SIZE})"
echo ""
echo "  [폐쇄망 PC에서 실행 방법]"
echo "  1. docker load < ${OUTPUT_FILE}"
echo "  2. docker run -d -p 3000:3000 \\"
echo "       -v wiki_data:/wiki/data/content \\"
echo "       -e DB_TYPE=postgres \\"
echo "       -e DB_HOST=<DB주소> \\"
echo "       -e DB_PORT=5432 \\"
echo "       -e DB_USER=<사용자> \\"
echo "       -e DB_PASS=<비밀번호> \\"
echo "       -e DB_NAME=wiki \\"
echo "       --name wiki ${IMAGE_NAME}:${TAG}"
echo "============================================"
