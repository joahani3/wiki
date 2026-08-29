<template lang='pug'>
  v-app(:dark='$vuetify.theme.dark').recent-pages
    nav-header
    v-content.grey(:class='$vuetify.theme.dark ? `darken-4-d5` : `lighten-3`')
      v-toolbar(color='primary', dark, flat, height='58')
        v-icon.mr-3 mdi-clock-outline
        .overline 문서 목록
      v-tabs(v-model='tab', :color='$vuetify.theme.dark ? `blue` : `primary`', fixed-tabs, show-arrows)
        v-tab(key='created') 최근 생성된 문서
        v-tab(key='updated') 최근 수정된 문서
        v-tab(key='commented') 최근 댓글 문서
      v-divider
      .px-5.py-4
        .text-center.pt-10(v-if='isLoading')
          v-progress-circular(indeterminate, color='primary', size='64', width='2')
        template(v-else)
          .text-center.pt-10(v-if='items.length < 1')
            .subtitle-2.grey--text 표시할 문서가 없습니다.
          template(v-else)
            v-data-iterator(
              :items='items'
              :items-per-page='20'
              :options.sync='pagination'
              @page-count='pageTotal = $event'
              hide-default-footer
              )
              template(v-slot:default='props')
                v-row(align='stretch')
                  v-col(
                    v-for='item of props.items'
                    :key='`rp-` + item.id'
                    cols='12'
                    lg='6'
                    )
                    v-card.radius-7(
                      :href='`/` + item.path'
                      style='height:100%;'
                      :class='$vuetify.theme.dark ? `grey darken-4` : ``'
                      )
                      v-card-text
                        .d-flex.flex-row.align-center
                          .body-1: strong.primary--text {{ item.title || item.path }}
                          v-spacer
                          .caption.grey--text {{ dateFor(item) | moment('from') }}
                        .body-2.grey--text(v-if='tab === 2') 댓글 {{ item.commentCount }}개
                        v-divider.my-2
                        .d-flex.flex-row.align-center
                          v-chip(small, label, :color='$vuetify.theme.dark ? `grey darken-3-l5` : `grey lighten-4`').overline {{ item.locale }}
                          .caption.ml-1 / {{ item.path }}
            .text-center.py-2(v-if='pageTotal > 1')
              v-pagination(v-model='pagination.page', :length='pageTotal')
    nav-footer
    notify
    search-results
</template>

<script>
import _ from 'lodash'

import pagesQuery from 'gql/common/common-pages-query-list.gql'
import recentCommentsQuery from 'gql/common/common-comments-query-recent.gql'

const TABS = ['created', 'updated', 'commented']

export default {
  data() {
    return {
      tab: 0,
      isLoading: true,
      itemsCreated: [],
      itemsUpdated: [],
      itemsCommented: [],
      pagination: {
        page: 1,
        itemsPerPage: 20
      },
      pageTotal: 0
    }
  },
  computed: {
    items() {
      switch (this.tab) {
        case 1:
          return this.itemsUpdated
        case 2:
          return this.itemsCommented
        default:
          return this.itemsCreated
      }
    }
  },
  watch: {
    tab(newValue) {
      this.pagination.page = 1
      this.rebuildURL()
      this.fetchTab(newValue)
    }
  },
  created() {
    this.$store.commit('page/SET_MODE', 'recent')
    const type = new URLSearchParams(window.location.search).get('type')
    const idx = TABS.indexOf(type)
    this.tab = idx >= 0 ? idx : 0
  },
  mounted() {
    this.fetchTab(this.tab)
  },
  methods: {
    rebuildURL() {
      const url = new URL(window.location.href)
      url.searchParams.set('type', TABS[this.tab])
      window.history.replaceState(null, '', url.toString())
    },
    dateFor(item) {
      if (this.tab === 2) {
        return item.lastCommentAt
      } else if (this.tab === 1) {
        return item.updatedAt
      }
      return item.createdAt
    },
    async fetchTab(tabIdx) {
      this.isLoading = true
      try {
        if (tabIdx === 2) {
          if (this.itemsCommented.length < 1) {
            const resp = await this.$apollo.query({
              query: recentCommentsQuery,
              variables: { limit: 100 },
              fetchPolicy: 'network-only'
            })
            this.itemsCommented = _.get(resp, 'data.comments.recentPages', [])
          }
        } else if (tabIdx === 1) {
          if (this.itemsUpdated.length < 1) {
            const resp = await this.$apollo.query({
              query: pagesQuery,
              variables: { limit: 100, orderBy: 'UPDATED', orderByDirection: 'DESC' },
              fetchPolicy: 'network-only'
            })
            this.itemsUpdated = _.get(resp, 'data.pages.list', [])
              .filter(page => page.updatedAt !== page.createdAt)
          }
        } else {
          if (this.itemsCreated.length < 1) {
            const resp = await this.$apollo.query({
              query: pagesQuery,
              variables: { limit: 100, orderBy: 'CREATED', orderByDirection: 'DESC' },
              fetchPolicy: 'network-only'
            })
            this.itemsCreated = _.get(resp, 'data.pages.list', [])
          }
        }
      } catch (err) {
        this.$store.commit('showNotification', {
          message: '문서 목록을 불러오지 못했습니다.',
          style: 'error',
          icon: 'error'
        })
      } finally {
        this.isLoading = false
      }
    }
  }
}
</script>
