<template lang='pug'>
  .editor-ckeditor
    div(ref='toolbarContainer')
    div.contents(ref='editor')
    v-system-bar.editor-ckeditor-sysbar(dark, status, color='grey darken-3')
      .caption.editor-ckeditor-sysbar-locale {{locale.toUpperCase()}}
      .caption.px-3 /{{path}}
      template(v-if='$vuetify.breakpoint.mdAndUp')
        v-spacer
        .caption Visual Editor
        v-spacer
        .caption {{$t('editor:ckeditor.stats', { chars: stats.characters, words: stats.words })}}
    editor-conflict(v-model='isConflict', v-if='isConflict')
    page-selector(mode='select', v-model='insertLinkDialog', :open-handler='insertLinkHandler', :path='path', :locale='locale')
    v-dialog(v-model='footnoteDialog', max-width='500px', eager)
      v-card
        v-card-title.text-subtitle-1 주석 내용 입력
        v-card-text.pt-2
          v-textarea(
            v-model='footnoteText'
            outlined
            label='주석 내용'
            rows='3'
            auto-grow
            autofocus
            hide-details
            @keydown.ctrl.enter='insertFootnote'
          )
          .caption.mt-1.grey--text Ctrl+Enter 로 삽입
        v-card-actions
          v-spacer
          v-btn(text, @click='footnoteDialog = false') 취소
          v-btn(color='primary', depressed, @click='insertFootnote')
            v-icon(left, small) mdi-check
            | 삽입
</template>

<script>
import _ from 'lodash'
import Cookies from 'js-cookie'
import { get, sync } from 'vuex-pathify'
import DecoupledEditor from '@requarks/ckeditor5'
// import DecoupledEditor from '../../../../wiki-ckeditor5/build/ckeditor'
import EditorConflict from './ckeditor/conflict.vue'
import { html as beautify } from 'js-beautify/js/lib/beautifier.min.js'

class WikiJsUploadAdapter {
  constructor (loader) {
    this.loader = loader
  }

  upload () {
    return this.loader.file.then(file => new Promise((resolve, reject) => {
      const jwtToken = Cookies.get('jwt')
      const sanitizedName = file.name.toLowerCase().replace(/[\s,;#]+/g, '_')
      const formData = new FormData()
      formData.append('mediaUpload', file, sanitizedName)
      formData.append('mediaUpload', JSON.stringify({ folderId: null }))

      fetch('/u', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwtToken}` },
        body: formData
      }).then(res => {
        if (res.ok) {
          resolve({ default: `/${sanitizedName}` })
        } else {
          reject(new Error('Upload failed'))
        }
      }).catch(reject)
    }))
  }

  abort () {}
}

function WikiJsUploadAdapterPlugin (editor) {
  editor.plugins.get('FileRepository').createUploadAdapter = (loader) => new WikiJsUploadAdapter(loader)
}

/* global siteLangs */

export default {
  components: {
    EditorConflict
  },
  props: {
    save: {
      type: Function,
      default: () => {}
    }
  },
  data() {
    return {
      editor: null,
      stats: {
        characters: 0,
        words: 0
      },
      content: '',
      isConflict: false,
      insertLinkDialog: false,
      footnoteDialog: false,
      footnoteText: ''
    }
  },
  computed: {
    isMobile() {
      return this.$vuetify.breakpoint.smAndDown
    },
    locale: get('page/locale'),
    path: get('page/path'),
    activeModal: sync('editor/activeModal')
  },
  methods: {
    insertLink () {
      this.insertLinkDialog = true
    },
    openFootnoteDialog () {
      this.footnoteText = ''
      this.footnoteDialog = true
    },
    injectFootnoteButton () {
      const toolbarEl = this.editor.ui.view.toolbar.element
      if (!toolbarEl) return

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'ck ck-button ck-button_with-text ck-off editor-fn-toolbar-btn'
      btn.setAttribute('tabindex', '-1')
      btn.title = '각주 삽입'

      const label = document.createElement('span')
      label.className = 'ck ck-button__label'
      label.textContent = '각주'
      const sup = document.createElement('sup')
      sup.className = 'editor-fn-toolbar-btn-sup'
      const icon = document.createElement('i')
      icon.className = 'mdi mdi-asterisk'
      sup.appendChild(icon)
      label.appendChild(sup)
      btn.appendChild(label)

      btn.addEventListener('click', () => {
        this.openFootnoteDialog()
      })

      this.positionFootnoteButton(toolbarEl, btn)
    },
    // To-do List 버튼 뒤에 (구분선 - 각주 - 구분선) 순으로 끼워 넣어
    // Special Characters 버튼 바로 앞에 오도록 위치시킴.
    // 버튼 라벨은 언어(locale)마다 번역되어 다르므로, 같은 커맨드의 ButtonView를
    // componentFactory로 하나 더 만들어 그 label 값으로 실제 DOM 버튼을 찾는다.
    positionFootnoteButton (toolbarEl, btn) {
      const itemsEl = toolbarEl.querySelector('.ck-toolbar__items')
      if (!itemsEl) {
        toolbarEl.appendChild(btn)
        return
      }

      const labelOf = name => {
        if (!this.editor.ui.componentFactory.has(name)) return null
        const view = this.editor.ui.componentFactory.create(name)
        view.render()
        const text = view.label
        view.destroy()
        return text
      }

      const findByLabel = text => {
        if (!text) return null
        return Array.from(itemsEl.children).find(el => {
          const labelEl = el.querySelector && el.querySelector('.ck-button__label')
          return labelEl && labelEl.textContent === text
        })
      }

      const todoBtn = findByLabel(labelOf('todoList'))
      const specialCharsBtn = findByLabel(labelOf('specialCharacters'))

      const separator = () => {
        const sep = document.createElement('span')
        sep.className = 'ck ck-toolbar__separator'
        return sep
      }

      if (todoBtn) {
        const ref = todoBtn.nextSibling
        itemsEl.insertBefore(separator(), ref)
        itemsEl.insertBefore(btn, ref)
        itemsEl.insertBefore(separator(), ref)
      } else if (specialCharsBtn) {
        itemsEl.insertBefore(separator(), specialCharsBtn)
        itemsEl.insertBefore(btn, specialCharsBtn)
        itemsEl.insertBefore(separator(), specialCharsBtn)
      } else {
        toolbarEl.appendChild(btn)
      }
    },
    insertFootnote () {
      const content = this.footnoteText.trim()
      if (!content || !this.editor) return

      // Determine next footnote number
      const html = this.editor.getData()
      const supMatches = [...html.matchAll(/<sup>\[(\d+)\]<\/sup>/g)]
      const nums = supMatches.map(m => parseInt(m[1]))
      const n = nums.length > 0 ? Math.max(...nums) + 1 : 1

      this.editor.model.change(writer => {
        // Insert [N] superscript at the end of the selection (or cursor position if nothing selected)
        const position = this.editor.model.document.selection.getLastPosition()
        writer.insertText(`[${n}]`, { superscript: true }, position)

        const root = this.editor.model.document.getRoot()

        // First footnote: add separator paragraph
        if (n === 1) {
          const sep = writer.createElement('paragraph')
          writer.insert(sep, writer.createPositionAt(root, 'end'))
          writer.insertText('── 각주 ──', writer.createPositionAt(sep, 0))
        }

        // Add footnote content paragraph at document end
        const fnPara = writer.createElement('paragraph')
        writer.insert(fnPara, writer.createPositionAt(root, 'end'))
        writer.insertText(`[${n}] ${content}`, writer.createPositionAt(fnPara, 0))
      })

      this.footnoteDialog = false
      this.footnoteText = ''
    },
    insertLinkHandler ({ locale, path }) {
      this.editor.execute('link', siteLangs.length > 0 ? `/${locale}/${path}` : `/${path}`)
    },
    async uploadAndInsertFile (file) {
      const jwtToken = Cookies.get('jwt')
      const sanitized = file.name.toLowerCase().replace(/[\s,;#]+/g, '_')

      const fd = new FormData()
      fd.append('mediaUpload', file, file.name)
      fd.append('mediaUpload', JSON.stringify({ folderId: 0 }))

      this.$store.commit('showNotification', {
        message: `업로드 중: ${file.name}`,
        style: 'info',
        icon: 'cloud_upload'
      })

      try {
        const resp = await fetch('/u', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${jwtToken}` },
          body: fd
        })
        if (!resp.ok) {
          throw new Error(`Upload failed: ${resp.status}`)
        }
        const isImage = file.type.startsWith('image/')
        this.$root.$emit('editorInsert', {
          kind: isImage ? 'IMAGE' : 'BINARY',
          path: `/${sanitized}`,
          text: file.name,
          align: ''
        })
        this.$store.commit('showNotification', {
          message: `업로드 완료: ${file.name}`,
          style: 'success',
          icon: 'check'
        })
      } catch (err) {
        this.$store.commit('showNotification', {
          message: `업로드 실패: ${file.name}`,
          style: 'error',
          icon: 'error'
        })
      }
    },
    onEditorDragOver (e) {
      if (e.dataTransfer.types.includes('Files')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }
    },
    async onEditorDrop (e) {
      const files = Array.from(e.dataTransfer.files)
      if (files.length === 0) return
      e.preventDefault()
      e.stopPropagation()
      for (const file of files) {
        await this.uploadAndInsertFile(file)
      }
    },
    async onEditorPaste (e) {
      const items = Array.from(e.clipboardData.items || [])
      const imageItems = items.filter(item => item.type.startsWith('image/'))
      if (imageItems.length === 0) return
      e.preventDefault()
      e.stopPropagation()
      for (const item of imageItems) {
        const file = item.getAsFile()
        if (file) {
          await this.uploadAndInsertFile(file)
        }
      }
    }
  },
  async mounted () {
    this.$store.set('editor/editorKey', 'ckeditor')

    this.editor = await DecoupledEditor.create(this.$refs.editor, {
      language: this.locale,
      placeholder: 'Type the page content here',
      disableNativeSpellChecker: false,
      extraPlugins: [WikiJsUploadAdapterPlugin],
      // TODO: Mention autocomplete
      //
      // mention: {
      //   feeds: [
      //     {
      //       marker: '@',
      //       feed: [ '@Barney', '@Lily', '@Marshall', '@Robin', '@Ted' ],
      //       minimumCharacters: 1
      //     }
      //   ]
      // },
      wordCount: {
        onUpdate: stats => {
          this.stats = {
            characters: stats.characters,
            words: stats.words
          }
        }
      }
    })
    this.$refs.toolbarContainer.appendChild(this.editor.ui.view.toolbar.element)
    this.injectFootnoteButton()

    // Drag & drop / paste from local file system
    const editableEl = this.editor.ui.view.editable.element
    editableEl.addEventListener('dragover', this.onEditorDragOver)
    editableEl.addEventListener('drop', this.onEditorDrop)
    editableEl.addEventListener('paste', this.onEditorPaste)

    if (this.mode !== 'create') {
      this.editor.setData(this.$store.get('editor/content'))
    }

    this.editor.model.document.on('change:data', _.debounce(evt => {
      this.$store.set('editor/content', beautify(this.editor.getData(), { indent_size: 2, end_with_newline: true }))
    }, 300))

    this.$root.$on('editorInsert', opts => {
      switch (opts.kind) {
        case 'IMAGE':
          this.editor.execute('imageInsert', {
            source: opts.path
          })
          break
        case 'BINARY':
          this.editor.execute('link', opts.path, {
            linkIsDownloadable: true
          })
          break
        case 'DIAGRAM':
          this.editor.execute('imageInsert', {
            source: `data:image/svg+xml;base64,${opts.text}`
          })
          break
      }
    })

    this.$root.$on('editorLinkToPage', opts => {
      this.insertLink()
    })

    // Handle save conflict
    this.$root.$on('saveConflict', () => {
      this.isConflict = true
    })
    this.$root.$on('overwriteEditorContent', () => {
      this.editor.setData(this.$store.get('editor/content'))
    })
  },
  beforeDestroy () {
    if (this.editor) {
      const editableEl = this.editor.ui.view.editable.element
      editableEl.removeEventListener('dragover', this.onEditorDragOver)
      editableEl.removeEventListener('drop', this.onEditorDrop)
      editableEl.removeEventListener('paste', this.onEditorPaste)
      this.editor.destroy()
      this.editor = null
    }
  }
}
</script>

<style lang="scss">

$editor-height: calc(100vh - 64px - 24px);
$editor-height-mobile: calc(100vh - 56px - 16px);

.editor-ckeditor {
  background-color: mc('grey', '200');
  flex: 1 1 50%;
  display: flex;
  flex-flow: column nowrap;
  height: $editor-height;
  max-height: $editor-height;
  position: relative;

  @at-root .theme--dark & {
    background-color: mc('grey', '900');
  }

  @include until($tablet) {
    height: $editor-height-mobile;
    max-height: $editor-height-mobile;
  }

  &-sysbar {
    padding-left: 0;

    &-locale {
      background-color: rgba(255,255,255,.25);
      display:inline-flex;
      padding: 0 12px;
      height: 24px;
      width: 63px;
      justify-content: center;
      align-items: center;
    }
  }

  .contents {
    table {
      margin: inherit;
    }
    pre > code {
      background-color: unset;
      color: unset;
      padding: .15em;
    }
  }

  .ck.ck-toolbar {
    border: none;
    justify-content: center;
    background-color: mc('grey', '300');
    color: #FFF;
  }

  .ck.ck-toolbar__items {
    justify-content: center;
  }

  .editor-fn-toolbar-btn {
    flex-shrink: 0;
    white-space: nowrap;

    &-sup {
      display: inline-flex;
      vertical-align: super;
      margin-left: 1px;

      .mdi {
        font-size: .7em;
      }
    }
  }

  > .ck-editor__editable {
    background-color: mc('grey', '100');
    overflow-y: auto;
    overflow-x: hidden;
    padding: 2rem;
    box-shadow: 0 0 5px hsla(0, 0, 0, .1);
    margin: 1rem auto 0;
    width: calc(100vw - 256px - 16vw);
    min-height: calc(100vh - 64px - 24px - 1rem - 40px);
    border-radius: 5px;

    @at-root .theme--dark & {
      background-color: #303030;
      color: #FFF;
    }

    @include until($widescreen) {
      width: calc(100vw - 2rem);
      margin: 1rem 1rem 0 1rem;
      min-height: calc(100vh - 64px - 24px - 1rem - 40px);
    }

    @include until($tablet) {
      width: 100%;
      margin: 0;
      min-height: calc(100vh - 56px - 24px - 76px);
    }

    &.ck.ck-editor__editable:not(.ck-editor__nested-editable).ck-focused {
      border-color: #FFF;
      box-shadow: 0 0 10px rgba(mc('blue', '700'), .25);

      @at-root .theme--dark & {
        border-color: #444;
        border-bottom: none;
        box-shadow: 0 0 10px rgba(#000, .25);
      }
    }

    &.ck .ck-editor__nested-editable.ck-editor__nested-editable_focused,
    &.ck .ck-editor__nested-editable:focus,
    .ck-widget.table td.ck-editor__nested-editable.ck-editor__nested-editable_focused,
    .ck-widget.table th.ck-editor__nested-editable.ck-editor__nested-editable_focused {
      background-color: mc('grey', '100');

      @at-root .theme--dark & {
        background-color: mc('grey', '900');
      }
    }
  }
}
</style>
