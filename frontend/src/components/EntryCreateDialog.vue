<template>
  <div v-if="open" class="modal-mask" @click.self="close">
    <form class="modal-card" @submit.prevent="submit">
      <header class="modal-head">
        <h3>登记{{ meta.entity }}</h3>
        <button class="btn ghost" type="button" @click="close">关闭</button>
      </header>
      <div class="modal-body">
        <label v-for="field in meta.fields" :key="field" class="modal-field">
          <span>{{ field }}</span>
          <input
            v-model="form[field]"
            :type="inputType(field)"
            :placeholder="`请输入${field}`"
          />
        </label>
      </div>
      <footer class="modal-foot">
        <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
        <button class="btn primary" type="submit">提交登记</button>
      </footer>
    </form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'

import { createEntry } from '@/api/local-service'
import type { ModuleMeta } from '@/data/types'

const props = defineProps<{ open: boolean; meta: ModuleMeta }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'registered'): void
}>()

const form = reactive<Record<string, string>>({})
const errorMessage = ref('')

watch(
  () => props.open,
  (open) => {
    if (open) {
      for (const field of props.meta.fields) {
        form[field] = ''
      }
      errorMessage.value = ''
    }
  },
)

function close() {
  emit('close')
}

// 含「日期/时间/期限/有效期」的字段给日期选择器，其余按文本登记。
function inputType(field: string): string {
  return /日期|时间|期限|有效期/.test(field) ? 'date' : 'text'
}

function submit() {
  const result = createEntry(props.meta.key, form)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  emit('registered')
}
</script>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}
.modal-card {
  width: 560px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 64px);
  overflow: auto;
  background: #fff;
  border-radius: 10px;
  padding: 16px 18px;
}
.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.modal-head h3 {
  margin: 0;
  font-size: 16px;
}
.modal-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
}
.modal-field span {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 2px;
}
.modal-field input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}
</style>
