# ====================
# --- Build Assets ---
# ====================
FROM node:24-alpine AS assets

RUN apk add yarn g++ make cmake python3 --no-cache

WORKDIR /wiki

# 의존성 관련 파일만 먼저 복사한다. package.json/yarn.lock/patches가 그대로면
# 소스 코드만 바뀐 빌드에서도 이 레이어들이 Docker 캐시로 재사용되어
# 매번 전체 yarn install(패키지 재다운로드/네이티브 빌드)을 다시 하지 않는다.
COPY ./package.json ./package.json
COPY ./yarn.lock ./yarn.lock
COPY ./patches ./patches

RUN yarn cache clean
RUN yarn --frozen-lockfile --non-interactive

# 소스 코드는 의존성 설치 이후에 복사 -> 위 install 레이어 캐시가 깨지지 않음
COPY ./client ./client
COPY ./dev ./dev
COPY ./.babelrc ./.babelrc
COPY ./.eslintignore ./.eslintignore
COPY ./.eslintrc.yml ./.eslintrc.yml

RUN yarn build
RUN rm -rf /wiki/node_modules
RUN yarn --production --frozen-lockfile --non-interactive
RUN yarn patch-package

# ===============
# --- Release ---
# ===============
FROM node:24-alpine
LABEL maintainer="requarks.io"

RUN apk add bash curl git openssh gnupg sqlite \
      poppler-utils tesseract-ocr tesseract-ocr-data-eng tesseract-ocr-data-kor tesseract-ocr-data-osd \
      --no-cache && \
    mkdir -p /wiki && \
    mkdir -p /logs && \
    mkdir -p /wiki/data/content && \
    chown -R node:node /wiki /logs

WORKDIR /wiki

COPY --chown=node:node --from=assets /wiki/assets ./assets
COPY --chown=node:node --from=assets /wiki/node_modules ./node_modules
COPY --chown=node:node ./server ./server
COPY --chown=node:node --from=assets /wiki/server/views ./server/views
COPY --chown=node:node ./dev/build/config.yml ./config.yml
COPY --chown=node:node ./package.json ./package.json
COPY --chown=node:node ./LICENSE ./LICENSE

# 소스 트리의 package.json은 "dev": true로 커밋되어 있음(진행 중인 개발 브랜치 표시).
# 릴리즈 이미지에서는 여기서만 false로 뒤집어 "DEVELOPMENT VERSION" 배너/원격 텔레메트리 억제 로직이
# 실제 배포판에서 잘못 발동하지 않도록 함 (소스 자체는 건드리지 않음).
RUN sed -i 's/"dev": true/"dev": false/' ./package.json

USER node

VOLUME ["/wiki/data/content"]

EXPOSE 3000
EXPOSE 3443

# HEALTHCHECK --interval=30s --timeout=30s --start-period=30s --retries=3 CMD curl -f http://localhost:3000/healthz

CMD ["node", "--no-deprecation", "server"]
